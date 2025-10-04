// src-tauri/src/commands/links.rs

use crate::AppState;
use regex::Regex;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::{command, State};

#[derive(Debug, Serialize, Clone)]
pub struct LinkItem {
    path: String,
    title: String,
}

fn parse_wikilinks(content: &str) -> Vec<String> {
    let re = Regex::new(r"\[\[([^\]]+)\]\]").unwrap();
    re.captures_iter(content)
        .map(|cap| cap[1].to_string())
        .collect()
}

// ▼▼▼ 【核心修改 1】将 &Connection 改为 &mut Connection ▼▼▼
// src-tauri/src/commands/links.rs

// [修改] 替换旧的 update_links_for_file 函数
pub fn update_links_for_file(conn: &mut Connection, file_path: &str) -> Result<(), String> {
    println!("
    [Link Debug] --- Updating links for file: '{}' ---", file_path);
    let content = std::fs::read_to_string(file_path).map_err(|e| e.to_string())?;
    
    let source_file_id: i64 = match conn.query_row(
        "SELECT id FROM files WHERE path = ?1",
        params![file_path],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| e.to_string())?
    {
        Some(id) => {
            println!("[Link Debug] Source file found in DB with ID: {}", id);
            id
        },
        None => {
            println!("[Link Debug] 警告: 在更新链接时找不到文件 '{}' 的记录。可能是新文件，暂时跳过。", file_path);
            return Ok(());
        }
    };

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM links WHERE source_file_id = ?1", params![source_file_id])
        .map_err(|e| e.to_string())?;
    println!("[Link Debug] Cleared old links for source ID: {}", source_file_id);

    let linked_targets = parse_wikilinks(&content);
    println!("[Link Debug] Parsed {} link targets from content: {:?}", linked_targets.len(), linked_targets);

    if !linked_targets.is_empty() {
        let mut title_stmt = tx.prepare("SELECT id FROM files WHERE title = ?1").map_err(|e| e.to_string())?;
        let mut path_stmt = tx.prepare("SELECT id FROM files WHERE path LIKE ('%' || ?1)").map_err(|e| e.to_string())?;

        for target in linked_targets {
            println!("[Link Debug] -> Processing target: '{}'", target);
            let mut target_ids: Vec<i64> = Vec::new();

            // 策略1: 优先根据笔记标题 (title) 精确匹配
            let title_matches = title_stmt.query_map(params![&target], |row| row.get(0));
            if let Ok(rows) = title_matches {
                for id in rows {
                    if let Ok(id_val) = id { target_ids.push(id_val); }
                }
            }
            println!("[Link Debug]    - Found {} match(es) by title.", target_ids.len());

            // 策略2: 如果标题没有匹配到，则根据文件名 (path) 模糊匹配
            if target_ids.is_empty() {
                let path_pattern = format!("{}.md", &target);
                println!("[Link Debug]    - Title match failed, now matching path LIKE '%{}'", path_pattern);
                let path_matches = path_stmt.query_map(params![&path_pattern], |row| row.get(0));
                 if let Ok(rows) = path_matches {
                    for id in rows {
                        if let Ok(id_val) = id { target_ids.push(id_val); }
                    }
                }
                println!("[Link Debug]    - Found {} match(es) by path.", target_ids.len());
            }
            
            if target_ids.len() == 1 {
                let target_file_id = target_ids[0];
                println!("[Link Debug]    ✅ Found unique target. Linking {} -> {}", source_file_id, target_file_id);
                tx.execute(
                    "INSERT OR IGNORE INTO links (source_file_id, target_file_id) VALUES (?1, ?2)",
                    params![source_file_id, target_file_id],
                ).map_err(|e| e.to_string())?;
            } else if target_ids.len() > 1 {
                println!("[Link Debug]    ⚠️ Ambiguous link: Found {} matches for '{}'. Skipping.", target_ids.len(), target);
            } else {
                println!("[Link Debug]    ❌ No match found for target '{}'.", target);
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    println!("[Link Debug] --- Link update finished for '{}' ---
    ", file_path);
    Ok(())
}

#[command]
pub async fn get_backlinks(file_path: String, state: State<'_, AppState>) -> Result<Vec<LinkItem>, String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT f.path, f.title FROM files f
         INNER JOIN links l ON f.id = l.source_file_id
         WHERE l.target_file_id = (SELECT id FROM files WHERE path = ?1)
         ORDER BY f.title"
    ).map_err(|e| e.to_string())?;

    let link_iter = stmt.query_map(params![file_path], |row| {
        Ok(LinkItem {
            path: row.get(0)?,
            title: row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "无标题".to_string()),
        })
    }).map_err(|e| e.to_string())?;

    let mut links = Vec::new();
    for link in link_iter {
        links.push(link.map_err(|e| e.to_string())?);
    }
    Ok(links)
}

// src-tauri/src/commands/links.rs

// ... (文件顶部的 use 和 struct 定义保持不变) ...

// 函数 update_links_for_file 保持不变

// 函数 get_backlinks 保持不变

// ▼▼▼ 【新增】超级调试命令 ▼▼▼
#[derive(Debug, Serialize, Clone)]
pub struct DebugLink {
    source_id: i64,
    target_id: i64,
}

#[command]
pub async fn debug_get_all_links(state: State<'_, AppState>) -> Result<Vec<DebugLink>, String> {
    println!("
    [Link Debug] --- Executing debug_get_all_links ---");
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT source_file_id, target_file_id FROM links")
        .map_err(|e| e.to_string())?;

    let link_iter = stmt.query_map([], |row| {
        Ok(DebugLink {
            source_id: row.get(0)?,
            target_id: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut links = Vec::new();
    for link in link_iter {
        links.push(link.map_err(|e| e.to_string())?);
    }

    println!("[Link Debug] Found {} links in the 'links' table.", links.len());
    println!("[Link Debug] --- End debug_get_all_links ---
    ");
    Ok(links)
}