// src-tauri/src/commands/path_utils.rs

use crate::AppState;
use rusqlite::params;
use std::path::{Path, PathBuf};
use tauri::{command, State};

// 将绝对路径转换为相对于 base_path 的相对路径，分隔符统一

pub fn to_relative_path(base_path: &Path, absolute_path: &Path) -> Option<String> {
    pathdiff::diff_paths(absolute_path, base_path)
        .map(|p| p.to_string_lossy().replace('\\', "/"))
}
// 将相对路径和 base_path 组合成绝对路径
pub fn to_absolute_path(base_path: &Path, relative_path: &Path) -> PathBuf {
    base_path.join(relative_path)
}

// 数据库迁移命令
#[command]
pub async fn migrate_paths_to_relative(
    root_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db_pool = state.db_pool.lock().unwrap();
    let mut conn = db_pool.as_ref().ok_or("数据库未初始化")?.get().map_err(|e| e.to_string())?;

    let user_version: i32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    // 迁移只在版本为 0 时执行一次
    if user_version == 0 {
        println!("🔀 开始数据库路径迁移...");
        let base_path = Path::new(&root_path);
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        // 1. 迁移 'files' 表
        {
            let mut stmt = tx.prepare("SELECT id, path FROM files").map_err(|e| e.to_string())?;
            let mut rows_to_update = Vec::new();
            let mut query_rows = stmt.query([]).map_err(|e| e.to_string())?;
            while let Some(row) = query_rows.next().map_err(|e| e.to_string())? {
                let id: i64 = row.get(0).map_err(|e| e.to_string())?;
                let absolute_path_str: String = row.get(1).map_err(|e| e.to_string())?;
                rows_to_update.push((id, absolute_path_str));
            }
            
            for (id, absolute_path_str) in rows_to_update {
                let absolute_path = Path::new(&absolute_path_str);
                if absolute_path.is_absolute() {
					if let Some(relative_path) = to_relative_path(base_path, absolute_path) {
                    tx.execute(
                        "UPDATE files SET path = ?1 WHERE id = ?2",
                        // [修复] 直接使用 relative_path，它已经是 String
                        params![relative_path, id],
                    ).map_err(|e| e.to_string())?;
                }
                }
            }
        }

        // 2. 迁移 'history' 表
        {
            let mut stmt = tx.prepare("SELECT id, file_path FROM history").map_err(|e| e.to_string())?;
            let mut rows_to_update = Vec::new();
            let mut query_rows = stmt.query([]).map_err(|e| e.to_string())?;
            while let Some(row) = query_rows.next().map_err(|e| e.to_string())? {
                let id: i64 = row.get(0).map_err(|e| e.to_string())?;
                let absolute_path_str: String = row.get(1).map_err(|e| e.to_string())?;
                rows_to_update.push((id, absolute_path_str));
            }
            
            for (id, absolute_path_str) in rows_to_update {
                let absolute_path = Path::new(&absolute_path_str);
                if absolute_path.is_absolute() {
                    if let Some(relative_path) = to_relative_path(base_path, absolute_path) {
                    tx.execute(
                        "UPDATE history SET file_path = ?1 WHERE id = ?2",
                        // [修复] 直接使用 relative_path，它已经是 String
                        params![relative_path, id],
                    ).map_err(|e| e.to_string())?;
                    }
                }
            }
        }

        // 3. 更新数据库版本号
        tx.pragma_update(None, "user_version", &1i32).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        println!("✅ 数据库路径迁移完成！");
    }

    Ok(())
}