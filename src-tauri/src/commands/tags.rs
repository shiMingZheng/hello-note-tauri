// src-tauri/src/commands/tags.rs

use crate::AppState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{command, State};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct TagInfo {
    name: String,
    count: i64,
}

// 定义返回给前端的文件信息结构体
#[derive(Debug, Serialize)] // 添加 Serialize
pub struct TaggedFileInfo {
    path: String,
    title: String,
    // 可以根据需要添加 is_dir, name 等字段
    is_dir: bool, // 假设 files 表有 is_dir 字段
    name: String, // 文件名
}

#[command]
pub async fn add_tag_to_file(relative_path: String, tag_name: String, state: State<'_, AppState>) -> Result<(), String> {
    let tag_name = tag_name.trim().to_lowercase();
    if tag_name.is_empty() { return Err("标签名不能为空".into()); }

    let db_pool = state.db_pool.lock().unwrap();
    let mut conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let tag_id: i64 = tx.query_row(
        "INSERT INTO tags (name) VALUES (?1) ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING id",
        params![tag_name],
        |row| row.get(0),
    ).map_err(|e| format!("获取或创建标签失败: {}", e))?;

    let file_id: i64 = tx.query_row(
        "SELECT id FROM files WHERE path = ?1",
        params![relative_path],
        |row| row.get(0),
    ).map_err(|e| format!("找不到文件记录: {}", e))?;

    tx.execute("INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?1, ?2)", params![file_id, tag_id])
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn remove_tag_from_file(relative_path: String, tag_name: String, state: State<'_, AppState>) -> Result<(), String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM file_tags WHERE file_id = (SELECT id FROM files WHERE path = ?1) AND tag_id = (SELECT id FROM tags WHERE name = ?2)",
        params![relative_path, tag_name],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn get_tags_for_file(relative_path: String, state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT t.name FROM tags t INNER JOIN file_tags ft ON t.id = ft.tag_id INNER JOIN files f ON f.id = ft.file_id WHERE f.path = ?1 ORDER BY t.name")
        .map_err(|e| e.to_string())?;
    let tags_iter = stmt.query_map(params![relative_path], |row| row.get(0)).map_err(|e| e.to_string())?;
    let mut tags = Vec::new();
    for tag in tags_iter {
        tags.push(tag.map_err(|e| e.to_string())?);
    }
    Ok(tags)
}

#[command]
pub async fn get_all_tags(state: State<'_, AppState>) -> Result<Vec<TagInfo>, String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT t.name, COUNT(ft.file_id) as count FROM tags t LEFT JOIN file_tags ft ON t.id = ft.tag_id GROUP BY t.name HAVING count > 0 ORDER BY count DESC, t.name")
        .map_err(|e| e.to_string())?;
    let tags_iter = stmt.query_map([], |row| Ok(TagInfo { name: row.get(0)?, count: row.get(1)? })).map_err(|e| e.to_string())?;
    let mut tags = Vec::new();
    for tag_info in tags_iter {
        tags.push(tag_info.map_err(|e| e.to_string())?);
    }
    Ok(tags)
}

#[command]
pub async fn get_files_by_tag(tag_name: String, state: State<'_, AppState>) -> Result<Vec<TaggedFileInfo>, String> { // 修改返回类型
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;
    // ★★★ 修改 SQL 查询以获取更多信息 ★★★
    let mut stmt = conn.prepare(
        "SELECT f.path, f.title, f.is_dir /* 根据你的表结构调整 */
         FROM files f
         INNER JOIN file_tags ft ON f.id = ft.file_id
         INNER JOIN tags t ON t.id = ft.tag_id
         WHERE t.name = ?1 AND f.is_dir = 0 /* 确保只返回文件 */
         ORDER BY f.path"
    ).map_err(|e| e.to_string())?;

    let files_iter = stmt.query_map(params![tag_name], |row| {
        let path: String = row.get(0)?;
        let title: Option<String> = row.get(1)?;
        let is_dir_int: i32 = row.get(2)?; // 获取 is_dir

        // 从路径中提取文件名
        let name = Path::new(&path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        Ok(TaggedFileInfo {
            path: path,
            // 如果 title 为 NULL，尝试使用文件名（不含扩展名）
            title: title.unwrap_or_else(|| {
                 Path::new(&name)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or(&name) // 如果没有 stem，用完整 name
                    .to_string()
            }),
            is_dir: is_dir_int != 0, // 转换为 bool
            name: name,
        })
    }).map_err(|e| e.to_string())?;

    // 收集结果
    let files: Vec<TaggedFileInfo> = files_iter
        .filter_map(Result::ok) // 过滤掉查询错误
        .collect();

    Ok(files) // 返回 Vec<TaggedFileInfo>
}