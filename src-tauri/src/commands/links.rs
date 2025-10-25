// src-tauri/src/commands/links.rs

use crate::commands::path_utils::to_absolute_path;
use crate::AppState;
use regex::Regex;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Result as RusqliteResult};
use serde::Serialize;
use std::collections::HashSet;
use std::path::Path;
use tauri::{command, State};

#[derive(Debug, Serialize, Clone)]
pub struct LinkItem {
    path: String, // 相对路径
    title: String,
}

fn parse_wikilinks(content: &str) -> Vec<String> {
    println!("  🔗 [parse_wikilinks] Received content snippet (debug): {:?}", content.get(..100)); // 保留日志

    // ★★★ 新增：移除 Wikilink 前后的转义符 ★★★
    // 将 "\\[\\[" 替换为 "[["，将 "\\]\\]" 替换为 "]]"
    let cleaned_content = content.replace(r"\[\[", "[[").replace(r"\]\]", "]]");
    println!("  🔗 [parse_wikilinks] Cleaned content snippet (debug): {:?}", cleaned_content.get(..100)); // 打印清理后的内容
 
    let re = Regex::new(r"\[\[([^\]]+)\]\]").unwrap();
 
    // ★★★ 修改：使用清理后的 cleaned_content 进行匹配 ★★★
    let matches: Vec<String> = re.captures_iter(&cleaned_content) // 使用 cleaned_content
        .map(|cap| cap[1].trim().to_string())
        .collect();

    println!("  🔗 [parse_wikilinks] Regex matches found: {:?}", matches); // 保留日志
    matches
}

// file_path 应该是相对路径
// file_path 应该是相对路径
pub fn update_links_for_file(
    conn: &mut Connection,
    root_path: &str,
    relative_path: &str,
) -> Result<(), String> {
    println!("  🔗 [update_links] 开始处理文件: {}", relative_path); // 新增日志

    let absolute_path = to_absolute_path(Path::new(root_path), Path::new(relative_path));
    let content = match std::fs::read_to_string(&absolute_path) {
        Ok(c) => c,
        Err(e) => {
            // ★★★ 如果读取失败，也应该记录日志 ★★★
            eprintln!("  🔗 [update_links] 读取文件失败: {}: {}", relative_path, e);
            // 文件可能还不存在或无法读取，不视为错误，直接返回
            return Ok(());
        }
    };
    // println!("  🔗 [update_links] 文件内容长度: {}", content.len()); // 可选日志
 
    let source_file_id: i64 = match conn
        .query_row(
            "SELECT id FROM files WHERE path = ?1",
            params![relative_path],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("查询源文件ID失败: {}", e))? // ★★★ 修改错误信息 ★★★
    {
        Some(id) => {
            println!("  🔗 [update_links] 源文件 ID: {}", id); // 新增日志
            id
        },
        None => {
            println!("  🔗 [update_links] 警告: 未在数据库中找到源文件记录: {}", relative_path); // 新增日志
            // 如果源文件记录不存在，则无法添加链接
            return Ok(());
        },
    };
 
    let tx = conn.transaction().map_err(|e| format!("开启事务失败: {}", e))?; // ★★★ 修改错误信息 ★★★
    tx.execute(
        "DELETE FROM links WHERE source_file_id = ?1",
        params![source_file_id],
    )
    .map_err(|e| format!("删除旧链接失败: {}", e))?; // ★★★ 修改错误信息 ★★★
    // println!("  🔗 [update_links] 已删除旧链接"); // 可选日志
 
    let linked_targets = parse_wikilinks(&content);
    println!("  🔗 [update_links] 解析到 {} 个链接目标: {:?}", linked_targets.len(), linked_targets); // 新增日志
 
    if !linked_targets.is_empty() {
        let mut title_stmt = tx.prepare("SELECT id FROM files WHERE title = ?1").map_err(|e| format!("准备 title 查询失败: {}", e))?; // ★★★ 修改错误信息 ★★★
        let mut path_stmt = tx.prepare("SELECT id FROM files WHERE path LIKE ('%' || ?1)").map_err(|e| format!("准备 path 查询失败: {}", e))?; // ★★★ 修改错误信息 ★★★
 
        for target in linked_targets {
            println!("    🔗 [update_links] 正在处理目标: '{}'", target); // 新增日志
            let mut target_ids: Vec<i64> = Vec::new();

            // 尝试按 title 查询
            match title_stmt.query_map(params![&target], |row| row.get(0)) {
                Ok(rows) => {
                    for id_result in rows {
                        match id_result {
                            Ok(id_val) => target_ids.push(id_val),
                            Err(e) => eprintln!("      🔗 [update_links] 读取 title 查询结果失败: {}", e), // 记录行读取错误
                        }
                    }
                    println!("      🔗 [update_links] 按 title 查询到 {} 个 ID: {:?}", target_ids.len(), target_ids); // 新增日志
                }
                Err(e) => {
                    eprintln!("      🔗 [update_links] 按 title 查询时出错: {}", e); // 记录查询错误
                }
            }
 
 
            // 如果按 title 找不到，尝试按 path 查询
            if target_ids.is_empty() {
                println!("      🔗 [update_links] 按 title 未找到，尝试按 path..."); // 新增日志
                let path_pattern = format!("{}.md", &target);
                println!("        🔗 [update_links] Path pattern: '%{}'", path_pattern); // 新增日志
                match path_stmt.query_map(params![&path_pattern], |row| row.get(0)) {
                   Ok(rows) => {
                        for id_result in rows {
                            match id_result {
                                Ok(id_val) => target_ids.push(id_val),
                                Err(e) => eprintln!("        🔗 [update_links] 读取 path 查询结果失败: {}", e), // 记录行读取错误
                            }
                        }
                        println!("      🔗 [update_links] 按 path 查询到 {} 个 ID: {:?}", target_ids.len(), target_ids); // 新增日志
                    }
                    Err(e) => {
                        eprintln!("      🔗 [update_links] 按 path 查询时出错: {}", e); // 记录查询错误
                    }
                }
            }
 
            // ★★★ 只有当精确找到一个目标时才插入 ★★★
            if target_ids.len() == 1 {
                let target_file_id = target_ids[0];
                println!("      🔗 [update_links] 找到唯一目标 ID: {}, 准备插入链接 {} -> {}", target_file_id, source_file_id, target_file_id); // 新增日志
                tx.execute(
                    "INSERT OR IGNORE INTO links (source_file_id, target_file_id) VALUES (?1, ?2)",
                    params![source_file_id, target_file_id],
                )
                .map_err(|e| format!("插入链接失败 ({} -> {}): {}", source_file_id, target_file_id, e))?; // ★★★ 修改错误信息 ★★★
            } else {
                // ★★★ 记录为什么没有插入 ★★★
                if target_ids.is_empty() {
                    println!("      🔗 [update_links] 未找到目标 '{}' 的 ID，跳过插入", target);
                } else {
                    println!("      🔗 [update_links] 找到多个目标 '{}' 的 ID ({:?})，跳过插入", target, target_ids);
                }
            }
        }
    }
    tx.commit().map_err(|e| format!("提交事务失败: {}", e))?; // ★★★ 修改错误信息 ★★★
    println!("  🔗 [update_links] 事务提交成功"); // 新增日志
    Ok(())
}

#[command]
pub async fn get_backlinks(relative_path: String, state: State<'_, AppState>) -> Result<Vec<LinkItem>, String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT f.path, f.title FROM files f INNER JOIN links l ON f.id = l.source_file_id WHERE l.target_file_id = (SELECT id FROM files WHERE path = ?1) ORDER BY f.title").map_err(|e| e.to_string())?;
    let link_iter = stmt.query_map(params![relative_path], |row| -> RusqliteResult<LinkItem> {
        Ok(LinkItem {
            path: row.get(0)?,
            title: row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "无标题".to_string()),
        })
    }).map_err(|e| e.to_string())?;
    let links: Vec<LinkItem> = link_iter.filter_map(Result::ok).collect();
    Ok(links)
}

#[derive(Debug, Serialize, Clone)]
pub struct DebugLink {
    source_id: i64,
    target_id: i64,
}
#[command]
pub async fn debug_get_all_links(state: State<'_, AppState>) -> Result<Vec<DebugLink>, String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT source_file_id, target_file_id FROM links").map_err(|e| e.to_string())?;
    let link_iter = stmt.query_map([], |row| Ok(DebugLink { source_id: row.get(0)?, target_id: row.get(1)? })).map_err(|e| e.to_string())?;
    let links: Vec<DebugLink> = link_iter.filter_map(Result::ok).collect();
    Ok(links)
}

#[derive(Serialize, Clone)]
pub struct GraphNode {
    pub id: i64,
    pub label: String,
    pub path: String,
}
#[derive(Serialize, Clone)]
pub struct GraphEdge {
    pub from: i64,
    pub to: i64,
}
#[derive(Serialize, Clone)]
pub struct GraphData {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

#[command]
pub async fn get_graph_data(state: State<'_, AppState>) -> Result<GraphData, String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;
    let mut edges_stmt = conn.prepare("SELECT source_file_id, target_file_id FROM links").map_err(|e| e.to_string())?;
    let edges_iter = edges_stmt.query_map([], |row| Ok(GraphEdge { from: row.get(0)?, to: row.get(1)? })).map_err(|e| e.to_string())?;
    let mut edges = Vec::new();
    let mut connected_node_ids = HashSet::<i64>::new();
    for edge_result in edges_iter {
        let edge = edge_result.map_err(|e| e.to_string())?;
        connected_node_ids.insert(edge.from);
        connected_node_ids.insert(edge.to);
        edges.push(edge);
    }
    if connected_node_ids.is_empty() { return Ok(GraphData { nodes: vec![], edges: vec![] }); }
    let id_list: Vec<i64> = connected_node_ids.into_iter().collect();
    let sql = format!("SELECT id, title, path FROM files WHERE id IN ({})", id_list.iter().map(|_| "?").collect::<Vec<_>>().join(","));
    let mut nodes_stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let nodes_iter = nodes_stmt.query_map(params_from_iter(id_list), |row| {
        Ok(GraphNode {
            id: row.get(0)?,
            label: row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "无标题".to_string()),
            path: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;
    let nodes: Vec<GraphNode> = nodes_iter.filter_map(Result::ok).collect();
    Ok(GraphData { nodes, edges })
}