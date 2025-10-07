// src-tauri/src/commands/sync.rs

use crate::AppState;
use rusqlite::params;
use std::collections::HashSet;
use std::path::Path;
use tauri::{command, State};
use walkdir::WalkDir;

#[derive(Debug, serde::Serialize)]
pub struct SyncResult {
    pub added: usize,
    pub removed: usize,
    pub updated: usize,
}

/// 扫描工作区并同步数据库
#[command]
pub async fn sync_workspace(
    root_path: String,
    state: State<'_, AppState>,
) -> Result<SyncResult, String> {
    println!("🔄 开始同步工作区: {}", root_path);
    
    let base_path = Path::new(&root_path);
    let mut sync_result = SyncResult {
        added: 0,
        removed: 0,
        updated: 0,
    };
    
    let db_pool_lock = state.db_pool.lock().unwrap();
    
    if let Some(pool) = db_pool_lock.as_ref() {
        let mut conn = pool.get().map_err(|e| e.to_string())?;
        
        // 1. 扫描文件系统，获取所有实际存在的 .md 文件
        let mut fs_files = HashSet::new();
        for entry in WalkDir::new(base_path)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            
            // 跳过隐藏文件和 .cheetah-note 目录
            if path.file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.starts_with('.'))
                .unwrap_or(false)
            {
                continue;
            }
            
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("md") {
                if let Ok(relative_path) = path.strip_prefix(base_path) {
                    let relative_str = relative_path.to_string_lossy().replace('\\', "/");
                    fs_files.insert(relative_str);
                }
            }
        }
        
        println!("📊 文件系统中发现 {} 个 .md 文件", fs_files.len());
        
        // 2. 获取数据库中的所有文件（在独立作用域中，让 stmt 自动释放）
        let db_files = {
            let mut stmt = conn.prepare("SELECT path FROM files").map_err(|e| e.to_string())?;
            let db_paths = stmt
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            
            let mut files = HashSet::new();
            for path in db_paths {
                if let Ok(p) = path {
                    files.insert(p);
                }
            }
            files
        }; // stmt 在这里被释放
        
        println!("📊 数据库中有 {} 个文件记录", db_files.len());
        
        // 3. 找出需要添加的文件（文件系统有，数据库没有）
        let to_add: Vec<_> = fs_files.difference(&db_files).cloned().collect();
        
        // 4. 找出需要删除的文件（数据库有，文件系统没有）
        let to_remove: Vec<_> = db_files.difference(&fs_files).cloned().collect();
        
        println!("📊 需要添加: {}, 需要删除: {}", to_add.len(), to_remove.len());
        
        // 5. 执行添加和删除（现在可以安全地创建事务了）
        if !to_add.is_empty() || !to_remove.is_empty() {
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            
            // 添加新文件
            for path in to_add {
                let title = path
                    .split('/')
                    .last()
                    .unwrap_or(&path)
                    .trim_end_matches(".md");
                
                tx.execute(
                    "INSERT INTO files (path, title, created_at, updated_at) 
                     VALUES (?1, ?2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                    params![path, title],
                ).map_err(|e| e.to_string())?;
                
                sync_result.added += 1;
            }
            
            // 删除不存在的文件（级联删除相关的 history、tags 等）
            for path in to_remove {
                tx.execute(
                    "DELETE FROM files WHERE path = ?1",
                    params![path],
                ).map_err(|e| e.to_string())?;
                
                sync_result.removed += 1;
            }
            
            tx.commit().map_err(|e| e.to_string())?;
        }
        
        println!("✅ 同步完成: 添加 {}, 删除 {}", sync_result.added, sync_result.removed);
    }
    
    Ok(sync_result)
}