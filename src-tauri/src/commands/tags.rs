// src-tauri/src/commands/tags.rs

use crate::AppState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{State, command};

#[derive(Debug, Serialize, Deserialize)]
pub struct TagInfo {
    name: String,
    count: i64,
}

/// 为指定文件路径添加一个标签
#[command]
pub async fn add_tag_to_file(path: String, tag_name: String, state: State<'_, AppState>) -> Result<(), String> {
    let tag_name = tag_name.trim().to_lowercase();
    if tag_name.is_empty() {
        return Err("标签名不能为空".into());
    }

    let db_pool = state.db_pool.lock().unwrap();
    let mut conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;

    // 开启一个事务，确保数据一致性
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // 1. 获取或创建 tag_id
    // ON CONFLICT(name) DO UPDATE SET name=name RETURNING id; 是一种在冲突时返回ID的技巧
    let tag_id: i64 = tx.query_row(
        "INSERT INTO tags (name) VALUES (?1) ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING id",
        params![tag_name],
        |row| row.get(0),
    ).map_err(|e| format!("获取或创建标签失败: {}", e))?;

    // 2. 获取 file_id
    let file_id: i64 = tx.query_row(
        "SELECT id FROM files WHERE path = ?1",
        params![path],
        |row| row.get(0),
    ).map_err(|e| format!("找不到文件记录: {}", e))?;

    // 3. 将关联写入 file_tags 表，忽略已存在的冲突
    tx.execute(
        "INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?1, ?2)",
        params![file_id, tag_id],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

/// 从指定文件路径移除一个标签
#[command]
pub async fn remove_tag_from_file(path: String, tag_name: String, state: State<'_, AppState>) -> Result<(), String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;
    
    conn.execute(
        "DELETE FROM file_tags WHERE file_id = (SELECT id FROM files WHERE path = ?1) AND tag_id = (SELECT id FROM tags WHERE name = ?2)",
        params![path, tag_name],
    ).map_err(|e| e.to_string())?;

    Ok(())
}


/// 获取指定文件的所有标签
#[command]
pub async fn get_tags_for_file(path: String, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT t.name FROM tags t
         INNER JOIN file_tags ft ON t.id = ft.tag_id
         INNER JOIN files f ON f.id = ft.file_id
         WHERE f.path = ?1
         ORDER BY t.name"
    ).map_err(|e| e.to_string())?;

    let tags_iter = stmt.query_map(params![path], |row| row.get(0)).map_err(|e| e.to_string())?;

    let mut tags = Vec::new();
    for tag in tags_iter {
        tags.push(tag.map_err(|e| e.to_string())?);
    }

    Ok(tags)
}

/// 获取所有标签及其使用计数
#[command]
pub async fn get_all_tags(state: State<'_, AppState>) -> Result<Vec<TagInfo>, String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
       "SELECT t.name, COUNT(ft.file_id) as count
        FROM tags t
        LEFT JOIN file_tags ft ON t.id = ft.tag_id
        GROUP BY t.name
        HAVING count > 0
        ORDER BY count DESC, t.name"
    ).map_err(|e| e.to_string())?;

    let tags_iter = stmt.query_map([], |row| {
        Ok(TagInfo {
            name: row.get(0)?,
            count: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut tags = Vec::new();
    for tag_info in tags_iter {
        tags.push(tag_info.map_err(|e| e.to_string())?);
    }
    
    Ok(tags)
}

/// [新增] 根据标签名获取所有文件路径
#[command]
pub async fn get_files_by_tag(tag_name: String, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT f.path FROM files f
         INNER JOIN file_tags ft ON f.id = ft.file_id
         INNER JOIN tags t ON t.id = ft.tag_id
         WHERE t.name = ?1
         ORDER BY f.path"
    ).map_err(|e| e.to_string())?;

    let paths_iter = stmt.query_map(params![tag_name], |row| row.get(0)).map_err(|e| e.to_string())?;

    let mut paths = Vec::new();
    for path in paths_iter {
        paths.push(path.map_err(|e| e.to_string())?);
    }

    Ok(paths)
}