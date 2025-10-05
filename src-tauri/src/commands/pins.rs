// src-tauri/src/commands/pins.rs

use crate::AppState;
use rusqlite::params;
use serde::Serialize;
use tauri::{command, State};

#[derive(Debug, Serialize, Clone)]
pub struct PinnedNote {
    path: String, // relative path
    title: String,
}

#[command]
pub async fn pin_note(relative_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;
    conn.execute("UPDATE files SET is_pinned = 1 WHERE path = ?1", params![relative_path])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn unpin_note(relative_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;
    conn.execute("UPDATE files SET is_pinned = 0 WHERE path = ?1", params![relative_path])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn get_pinned_notes(state: State<'_, AppState>) -> Result<Vec<PinnedNote>, String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT path, title FROM files WHERE is_pinned = 1 ORDER BY title")
        .map_err(|e| e.to_string())?;

    let notes_iter = stmt.query_map([], |row| {
        Ok(PinnedNote {
            path: row.get(0)?,
            title: row.get::<_, Option<String>>(1)?.unwrap_or_else(|| "无标题".to_string()),
        })
    }).map_err(|e| e.to_string())?;

    let mut notes = Vec::new();
    for note in notes_iter {
        notes.push(note.map_err(|e| e.to_string())?);
    }
    Ok(notes)
}