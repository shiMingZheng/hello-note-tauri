//src-tauri/src/commands/favorites.rs

use crate::AppState;
use rusqlite::params;
use serde::Serialize;
use tauri::{command, State};

#[derive(Debug, Serialize, Clone)]
pub struct FavoriteNote {
    path: String, // relative path
    title: String,
}

#[command]
pub async fn favorite_note(relative_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;
    conn.execute("UPDATE files SET is_favorite = 1 WHERE path = ?1", params![relative_path])
        .map_err(|e| e.to_string())?;
    println!("? 已收藏笔记: {}", relative_path); // 添加日志
    Ok(())
}

#[command]
pub async fn unfavorite_note(relative_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;
    conn.execute("UPDATE files SET is_favorite = 0 WHERE path = ?1", params![relative_path])
        .map_err(|e| e.to_string())?;
    println!("? 已取消收藏笔记: {}", relative_path); // 添加日志
    Ok(())
}

#[command]
pub async fn get_favorited_notes(state: State<'_, AppState>) -> Result<Vec<FavoriteNote>, String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT path, title FROM files WHERE is_favorite = 1 ORDER BY title")
        .map_err(|e| e.to_string())?;

    let notes_iter = stmt.query_map([], |row| {
        Ok(FavoriteNote {
            path: row.get(0)?,
            // 确保 title 为空时使用文件名
            title: row.get::<_, Option<String>>(1)?.unwrap_or_else(|| {
                 let path_str: String = row.get(0).unwrap_or_default();
                 std::path::Path::new(&path_str)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string()
            }),
        })
    }).map_err(|e| e.to_string())?;

    let mut notes = Vec::new();
    for note in notes_iter {
        notes.push(note.map_err(|e| e.to_string())?);
    }
    println!("? 获取到 {} 条收藏笔记", notes.len()); // 添加日志
    Ok(notes)
}

//  新增：查询单个文件的收藏状态
#[command]
pub async fn get_note_favorite_status(relative_path: String, state: State<'_, AppState>) -> Result<bool, String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;

    // 使用 query_row，它期望正好有一行
    let favorite_status_result: rusqlite::Result<i32> = conn.query_row(
        "SELECT is_favorite FROM files WHERE path = ?1",
        params![relative_path],
        |row| row.get(0), // 获取第一列的值，类型推断为 i32
    );

    // 使用 match 处理 Result
    match favorite_status_result {
        // 查询成功，获取到 i32 值
        Ok(status_code) => Ok(status_code == 1), // 如果 status_code 是 1，则返回 true
        // 如果没有找到对应的文件记录 (query_row 会返回这个错误)
        Err(rusqlite::Error::QueryReturnedNoRows) => {
             println!("ℹ️ 未找到文件记录，无法查询收藏状态: {}", relative_path);
             Ok(false) // 文件不存在或记录不存在，视为未收藏
        }
        // 其他数据库错误
        Err(e) => {
             eprintln!("❌ 查询收藏状态时出错: {}: {}", relative_path, e);
             Err(format!("查询收藏状态失败: {}", e)) // 将错误传递给前端
        }
    }
}