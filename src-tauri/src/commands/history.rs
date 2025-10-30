// src-tauri/src/commands/history.rs

use crate::AppState;
use rusqlite::params;
use serde::Serialize;
use tauri::{command, State};

#[derive(Debug, Serialize)]
pub struct HistoryEntry {
    id: i64,
    file_id: i64,
    file_path: String,
    file_title: String,
    event_type: String,
    event_date: String,
    event_datetime: String,
}

/// 记录文件事件
#[command]
pub async fn record_file_event(
    _root_path: String,
    relative_path: String,
    event_type: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db_pool_lock = state.db_pool.lock().unwrap();
    
    if let Some(pool) = db_pool_lock.as_ref() {
        let conn = pool.get().map_err(|e| e.to_string())?;
        
        // [修改] 统一使用文件名作为 title
        let title = relative_path
            .split('/')
            .last()
            .unwrap_or(&relative_path)
            .trim_end_matches(".md");
        
        let file_id: i64 = conn.query_row(
            "SELECT id FROM files WHERE path = ?1",
            params![&relative_path],
            |row| row.get(0),
        ).or_else(|_| {
            conn.execute(
                "INSERT INTO files (path, title, created_at, updated_at) 
                 VALUES (?1, ?2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                params![&relative_path, title],
            )?;
            
            conn.query_row("SELECT last_insert_rowid()", [], |row| row.get(0))
        }).map_err(|e| e.to_string())?;
        
        let now = chrono::Local::now();
        let event_date = now.format("%Y-%m-%d").to_string();
        let event_datetime = now.format("%Y-%m-%d %H:%M:%S").to_string();
        
        conn.execute(
            "INSERT INTO history (file_id, event_type, event_date, event_datetime) 
             VALUES (?1, ?2, ?3, ?4)",
            params![file_id, event_type, event_date, event_datetime],
        ).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

/// 获取历史记录
#[command]
pub async fn get_history(
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<HistoryEntry>, String> {
    let db_pool_lock = state.db_pool.lock().unwrap();
    
    if let Some(pool) = db_pool_lock.as_ref() {
        let conn = pool.get().map_err(|e| e.to_string())?;
        
        let limit_value = limit.unwrap_or(50);
        
        // ★★★ [优化] 修改 SQL 查询 ★★★
        // 1. 使用 WITH 语句和 ROW_NUMBER() 来为每个文件每天的记录进行排序
        // 2. 选取 rn = 1 的记录（即每个文件每天的最新记录）
        // 3. 按日期和时间倒序排列
        let mut stmt = conn.prepare(
            "
            WITH RankedHistory AS (
                SELECT 
                    h.id,
                    h.file_id,
                    f.path,
                    COALESCE(f.title, '未命名') AS file_title,
                    h.event_type,
                    h.event_date,
                    h.event_datetime,
                    ROW_NUMBER() OVER(
                        PARTITION BY h.file_id, h.event_date 
                        ORDER BY h.event_datetime DESC
                    ) as rn
                FROM history h
                INNER JOIN files f ON h.file_id = f.id
            )
            SELECT 
                id,
                file_id,
                path,
                file_title,
                event_type,
                event_date,
                event_datetime
            FROM RankedHistory
            WHERE rn = 1
            ORDER BY event_date DESC, event_datetime DESC
            LIMIT ?1
            "
        ).map_err(|e| e.to_string())?;
        
        let entries = stmt.query_map(params![limit_value], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?,
                file_id: row.get(1)?,
                file_path: row.get(2)?,
                file_title: row.get(3)?,
                event_type: row.get(4)?,
                event_date: row.get(5)?,
                event_datetime: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();
        
        Ok(entries)
    } else {
        Err("数据库未初始化".to_string())
    }
}


/// 清理无效的历史记录（文件已被删除）
// 在 src-tauri/src/commands/history.rs 文件末尾添加以下代码

/// 清理无效的历史记录（文件已被删除）
#[command]
pub async fn cleanup_invalid_history(
    root_path: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let db_pool_lock = state.db_pool.lock().unwrap();
    
    if let Some(pool) = db_pool_lock.as_ref() {
        let conn = pool.get().map_err(|e| e.to_string())?;
        let base_path = std::path::Path::new(&root_path);
        
        // 查找所有需要检查的文件
        let file_records: Vec<(i64, String)> = {
            conn.prepare(
                "SELECT DISTINCT f.id, f.path FROM files f 
                 INNER JOIN history h ON f.id = h.file_id"
            )
            .and_then(|mut stmt| {
                stmt.query_map([], |row| {
                    Ok((row.get(0)?, row.get(1)?))
                })
                .and_then(|rows| {
                    rows.collect::<Result<Vec<_>, _>>()
                })
            })
            .map_err(|e| e.to_string())?
        };
        
        // 检查文件是否存在
        let deleted_ids: Vec<i64> = file_records
            .into_iter()
            .filter(|(_, relative_path)| {
                !base_path.join(relative_path).exists()
            })
            .map(|(id, _)| id)
            .collect();
        
        if deleted_ids.is_empty() {
            return Ok(0);
        }
        
        // 删除无效记录
        let deleted_count = deleted_ids.len();
        
        conn.execute_batch(&format!(
            "BEGIN;
             DELETE FROM history WHERE file_id IN ({});
             UPDATE files SET is_pinned = 0 WHERE id IN ({});
             COMMIT;",
            deleted_ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(","),
            deleted_ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",")
        )).map_err(|e| e.to_string())?;
        
        println!("✅ 清理了 {} 个无效历史记录", deleted_count);
        Ok(deleted_count)
    } else {
        Err("数据库未初始化".to_string())
    }
}