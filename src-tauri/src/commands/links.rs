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
    let re = Regex::new(r"\[\[([^\]]+)\]\]").unwrap();
    re.captures_iter(content)
        .map(|cap| cap[1].trim().to_string())
        .collect()
}

// file_path 应该是相对路径
pub fn update_links_for_file(
    conn: &mut Connection,
    root_path: &str,
    relative_path: &str,
) -> Result<(), String> {
    let absolute_path = to_absolute_path(Path::new(root_path), Path::new(relative_path));
    let content = match std::fs::read_to_string(absolute_path) {
        Ok(c) => c,
        Err(_) => return Ok(()), // 文件可能还不存在，这是正常情况
    };

    let source_file_id: i64 = match conn
        .query_row(
            "SELECT id FROM files WHERE path = ?1",
            params![relative_path],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?
    {
        Some(id) => id,
        None => return Ok(()),
    };

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "DELETE FROM links WHERE source_file_id = ?1",
        params![source_file_id],
    )
    .map_err(|e| e.to_string())?;

    let linked_targets = parse_wikilinks(&content);
    if !linked_targets.is_empty() {
        let mut title_stmt = tx.prepare("SELECT id FROM files WHERE title = ?1").map_err(|e| e.to_string())?;
        let mut path_stmt = tx.prepare("SELECT id FROM files WHERE path LIKE ('%' || ?1)").map_err(|e| e.to_string())?;

        for target in linked_targets {
            let mut target_ids: Vec<i64> = Vec::new();
            if let Ok(rows) = title_stmt.query_map(params![&target], |row| row.get(0)) {
                for id in rows {
                    if let Ok(id_val) = id {
                        target_ids.push(id_val);
                    }
                }
            }
            if target_ids.is_empty() {
                let path_pattern = format!("{}.md", &target);
                if let Ok(rows) = path_stmt.query_map(params![&path_pattern], |row| row.get(0)) {
                    for id in rows {
                        if let Ok(id_val) = id {
                            target_ids.push(id_val);
                        }
                    }
                }
            }
            if target_ids.len() == 1 {
                let target_file_id = target_ids[0];
                tx.execute(
                    "INSERT OR IGNORE INTO links (source_file_id, target_file_id) VALUES (?1, ?2)",
                    params![source_file_id, target_file_id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
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