// src-tauri/src/commands/sync.rs

use crate::AppState;
use rusqlite::params;
use std::collections::{HashMap, HashSet};  // 添加 HashSet
use crate::indexing_jobs;  // 添加这一行
use std::path::Path;
use tauri::{command, State};
use walkdir::WalkDir;
use std::fs::metadata;
use std::time::UNIX_EPOCH;

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
        
        // 1. 扫描文件系统，获取所有 .md 文件和文件夹
        let mut fs_files: HashMap<String, u64> = HashMap::new(); // 路径 -> mtime
        let mut fs_folders = HashSet::new();
        
        for entry in WalkDir::new(base_path)
            .follow_links(false)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            
            // 跳过隐藏文件/文件夹和 .cheetah-note 目录
            if path.file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.starts_with('.'))
                .unwrap_or(false)
            {
                continue;
            }
            
            // 跳过根目录本身
            if path == base_path {
                continue;
            }
            
            if let Ok(relative_path) = path.strip_prefix(base_path) {
                let relative_str = relative_path.to_string_lossy().replace('\\', "/");
                
                if path.is_dir() {
                    fs_folders.insert(relative_str);
                } else if path.is_file() && 
                         path.extension().and_then(|s| s.to_str()) == Some("md") {
							if let Ok(meta) = metadata(&path) {
								if let Ok(modified) = meta.modified() {
									if let Ok(duration) = modified.duration_since(UNIX_EPOCH) {
										let mtime = duration.as_secs();
										fs_files.insert(relative_str.clone(), mtime);
									}
								}
							}
                }
            }
        }
        
        println!("📊 文件系统: {} 个文件, {} 个文件夹", fs_files.len(), fs_folders.len());
        
        // 2. 获取数据库中的所有文件和文件夹
        let (db_files, db_folders) = {
			conn.prepare("SELECT path, is_dir, indexed, last_modified FROM files")
				.and_then(|mut stmt| {
					stmt.query_map([], |row| {
						Ok((
							row.get::<_, String>(0)?,  // path
							row.get::<_, i32>(1)?,     // is_dir
							row.get::<_, i32>(2)?,     // indexed
							row.get::<_, i64>(3)?      // last_modified
						))
					})
					.and_then(|rows| rows.collect::<Result<Vec<_>, _>>())
				})
				.map(|items| {
					let mut files: HashMap<String, (i32, i64)> = HashMap::new(); // path -> (indexed, last_modified)
					let mut folders = HashSet::new();
					
					for (path, is_dir, indexed, last_modified) in items {
						if is_dir == 1 {
							folders.insert(path);
						} else {
							files.insert(path, (indexed, last_modified));
						}
					}
					
					(files, folders)
				})
				.map_err(|e: rusqlite::Error| e.to_string())?
		};
        
        println!("📊 数据库: {} 个文件, {} 个文件夹", db_files.len(), db_folders.len());
        
        // 3. 计算差异
        // 新增文件(磁盘有但数据库没有)
		let files_to_add: Vec<(String, u64)> = fs_files.iter()
			.filter(|(path, _)| !db_files.contains_key(*path))
			.map(|(p, m)| (p.clone(), *m))
			.collect();
		
		// 删除文件(数据库有但磁盘没有)
		let files_to_remove: Vec<String> = db_files.keys()
			.filter(|path| !fs_files.contains_key(*path))
			.cloned()
			.collect();
		
		// 需要索引的文件(indexed=0 或 mtime变化)
		let files_to_index: Vec<String> = fs_files.iter()
			.filter_map(|(path, disk_mtime)| {
				if let Some((indexed, db_mtime)) = db_files.get(path) {
					// 未索引 或 修改时间不一致
					if *indexed == 0 || (*disk_mtime as i64) != *db_mtime {
						return Some(path.clone());
					}
				}
				None
			})
			.collect();


        let folders_to_add: Vec<_> = fs_folders.difference(&db_folders).cloned().collect();
        let folders_to_remove: Vec<_> = db_folders.difference(&fs_folders).cloned().collect();
        
        println!("📊 差异统计:");
		println!("   新增文件: {}", files_to_add.len());
		println!("   删除文件: {}", files_to_remove.len());
		println!("   需要索引: {}", files_to_index.len());
        println!("   文件: 需要添加 {}, 需要删除 {}", files_to_add.len(), files_to_remove.len());
        println!("   文件夹: 需要添加 {}, 需要删除 {}", folders_to_add.len(), folders_to_remove.len());
        
        // 4. 执行同步
        if !files_to_add.is_empty() || !files_to_remove.is_empty() || 
           !folders_to_add.is_empty() || !folders_to_remove.is_empty() {
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            
            // 先添加文件夹（因为文件可能依赖文件夹）
            for path in folders_to_add {
                let title = path.split('/').last().unwrap_or(&path);
                
                tx.execute(
                    "INSERT OR IGNORE INTO files (path, title, is_dir, created_at, updated_at) 
                     VALUES (?1, ?2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                    params![path, title],
                ).map_err(|e| e.to_string())?;
                
                sync_result.added += 1;
            }
            
            // 添加文件
            for (path, mtime) in files_to_add {
				let title = path.split('/').last().unwrap_or(&path);
				
				tx.execute(
					"INSERT OR IGNORE INTO files (path, title, is_dir, last_modified, indexed, created_at, updated_at) 
					VALUES (?1, ?2, 0, ?3, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
					params![path, title, mtime as i64],
				).map_err(|e| e.to_string())?;
			}
            
            // 删除文件
            for path in files_to_remove {
                tx.execute(
                    "DELETE FROM files WHERE path = ?1 AND is_dir = 0",
                    params![path],
                ).map_err(|e| e.to_string())?;
                
                sync_result.removed += 1;
            }
            
            // 删除文件夹（最后删除，因为可能有文件依赖）
            for path in folders_to_remove {
                tx.execute(
                    "DELETE FROM files WHERE path = ?1 AND is_dir = 1",
                    params![path],
                ).map_err(|e| e.to_string())?;
                
                sync_result.removed += 1;
            }
            
            tx.commit().map_err(|e| e.to_string())?;
					// 5. 为需要索引的文件分发任务
			if !files_to_index.is_empty() {
				println!("📤 分发 {} 个文件的索引任务", files_to_index.len());
				
				for file_path in files_to_index {
					if let Err(e) = indexing_jobs::dispatch_update_job(
						root_path.clone(),
						file_path.clone()
					) {
						eprintln!("⚠️ 分发索引任务失败 ({}): {}", file_path, e);
					}
				}
			}
        }
		

        
        println!("✅ 同步完成: 添加 {}, 删除 {}", 
                 sync_result.added, sync_result.removed);
    }
    
    Ok(sync_result)
}