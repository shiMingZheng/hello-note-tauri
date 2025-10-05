// src-tauri/src/commands/history.rs

use crate::AppState;
use crate::commands::path_utils::to_absolute_path;
use chrono::Local;
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use std::path::Path;
use tauri::{command, State};

#[derive(Debug, Serialize, Clone)]
pub struct HistoryEntry {
    file_path: String, // relative path
    event_type: String,
    snippet: String,
    event_date: String,
    event_datetime: String,
}

#[command]
pub async fn record_file_event(
    root_path: String,
    relative_path: String,
    event_type: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;

    let now = Local::now();
    let today_date = now.format("%Y-%m-%d").to_string();
    let full_datetime = now.format("%Y-%m-%d %H:%M:%S").to_string();
    
    let absolute_path = to_absolute_path(Path::new(&root_path), Path::new(&relative_path));

    if event_type == "edited" {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM history WHERE file_path = ?1 AND event_type = 'edited' AND event_date = ?2",
            params![&relative_path, &today_date],
            |row| row.get(0),
        ).optional().map_err(|e| e.to_string())?.unwrap_or(0);

        if count > 0 {
            let snippet = std::fs::read_to_string(&absolute_path).unwrap_or_default()
                .lines().find(|&line| !line.trim().is_empty()).unwrap_or("").trim().to_string();
            conn.execute(
                "UPDATE history SET snippet = ?1, event_datetime = ?2 WHERE file_path = ?3 AND event_type = 'edited' AND event_date = ?4",
                params![snippet, full_datetime, &relative_path, today_date],
            ).map_err(|e| e.to_string())?;
            return Ok(());
        }
    }

    let content = std::fs::read_to_string(&absolute_path).unwrap_or_default();
    let snippet = content.lines().find(|&line| !line.trim().is_empty()).unwrap_or("").trim().to_string();

    conn.execute(
        "INSERT INTO history (file_path, event_type, snippet, event_date, event_datetime) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![relative_path, event_type, snippet, today_date, full_datetime],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[command]
pub async fn get_history(limit: u32, state: State<'_, AppState>) -> Result<Vec<HistoryEntry>, String> {
    let db_pool = state.db_pool.lock().unwrap();
    let conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT file_path, event_type, snippet, event_date, event_datetime FROM history ORDER BY event_datetime DESC LIMIT ?1"
    ).map_err(|e| e.to_string())?;

    let history_iter = stmt.query_map(params![limit], |row| {
        Ok(HistoryEntry {
            file_path: row.get(0)?,
            event_type: row.get(1)?,
            snippet: row.get(2)?,
            event_date: row.get(3)?,
            event_datetime: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut history = Vec::new();
    for entry in history_iter {
        history.push(entry.map_err(|e| e.to_string())?);
    }
    
    Ok(history)
}