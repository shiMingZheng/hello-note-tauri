// src-tauri/src/commands/fs.rs
use crate::commands::history::record_file_event;
use crate::commands::links::update_links_for_file;
use crate::commands::path_utils::{to_absolute_path, to_relative_path};
use crate::AppState;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::State;
use std::fs::metadata;



use crate::indexing_jobs;
use walkdir::WalkDir;

#[derive(Debug, Serialize)]
pub struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    has_children: bool,
}

/// 递归收集文件夹下的所有 .md 文件的相对路径
/// [FIX] This function should now return Vec<String> and standardize paths
fn collect_markdown_files(
    base_path: &Path,
    folder_relative_path: &str,
) -> Result<Vec<String>, String> {
    let folder_absolute_path = to_absolute_path(base_path, Path::new(folder_relative_path));
    let mut md_files = Vec::new();

    for entry in WalkDir::new(&folder_absolute_path).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Some(relative_path_str) = to_relative_path(base_path, entry.path()) {
                if relative_path_str.ends_with(".md") {
                    md_files.push(relative_path_str);
                }
            }
        }
    }
    Ok(md_files)
}
fn directory_has_children(dir: &Path) -> bool {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if name.starts_with('.') { continue; }
            }
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_dir() { return true; }
                if metadata.is_file() && entry.path().extension().and_then(|s| s.to_str()) == Some("md") {
                    return true;
                }
            }
        }
    }
    false
}

#[tauri::command]
pub async fn list_dir_lazy(root_path: String, relative_path: String) -> Result<Vec<FileNode>, String> {
    let base_path = Path::new(&root_path);
    let dir_to_read = to_absolute_path(base_path, Path::new(&relative_path));
    if !dir_to_read.is_dir() { return Ok(vec![]); }
    let mut nodes = Vec::new();
    let entries = fs::read_dir(&dir_to_read).map_err(|e| format!("读取目录失败: {}", e))?;
    for entry in entries.flatten() {
        let absolute_path = entry.path();
        if let Some(name) = absolute_path.file_name().and_then(|s| s.to_str()) {
            if name.starts_with('.') { continue; }
        }
        if let Ok(metadata) = entry.metadata() {
            // This `relative_node_path` is now an `Option<String>`
            if let Some(relative_node_path) = to_relative_path(base_path, &absolute_path) {
                let node = if metadata.is_dir() {
                    FileNode {
                        name: entry.file_name().to_string_lossy().to_string(),
                        // [FIX] Use the String directly
                        path: relative_node_path,
                        is_dir: true,
                        has_children: directory_has_children(&absolute_path),
                    }
                } else if absolute_path.extension().and_then(|s| s.to_str()) == Some("md") {
                    FileNode {
                        name: entry.file_name().to_string_lossy().to_string(),
                        // [FIX] Use the String directly
                        path: relative_node_path,
                        is_dir: false,
                        has_children: false,
                    }
                } else { continue; };
                nodes.push(node);
            }
        }
    }
    nodes.sort_by(|a, b| {
        if a.is_dir == b.is_dir { a.name.cmp(&b.name) } 
        else if a.is_dir { std::cmp::Ordering::Less } 
        else { std::cmp::Ordering::Greater }
    });
    Ok(nodes)
}


#[tauri::command]
pub async fn read_file_content(root_path: String, relative_path: String) -> Result<String, String> {
    let absolute_path = to_absolute_path(Path::new(&root_path), Path::new(&relative_path));
    
    // [修复] 检查文件是否存在
    if !absolute_path.exists() {
        return Err(format!("文件不存在: {}", relative_path));
    }
    
    if !absolute_path.is_file() {
        return Err(format!("路径不是文件: {}", relative_path));
    }
    
    fs::read_to_string(&absolute_path).map_err(|e| format!("读取文件失败: {}", e))
}

#[tauri::command]
pub async fn save_file(
    root_path: String,
    relative_path: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    use crate::indexing_jobs::SAVE_TRACKER;
    
    // ✅ Layer 1: 添加瞬时锁
    {
        let mut saving = SAVE_TRACKER.files_currently_saving.lock().unwrap();
        saving.insert(relative_path.clone());
    }
    
    let base_path = Path::new(&root_path);
    let absolute_path = to_absolute_path(base_path, Path::new(&relative_path));
    
    // 执行写入
    fs::write(&absolute_path, &content).map_err(|e| format!("保存文件失败: {}", e))?;
    
    // ✅ Layer 3: 记录写入时间戳
    {
        if let Ok(meta) = metadata(&absolute_path) {
            if let Ok(modified) = meta.modified() {
                let mut known_times = SAVE_TRACKER.known_write_times.lock().unwrap();
                known_times.insert(relative_path.clone(), modified);
            }
        }
    }
    
    // ✅ Layer 1: 释放瞬时锁
    {
        let mut saving = SAVE_TRACKER.files_currently_saving.lock().unwrap();
        saving.remove(&relative_path);
    }
    
    // 异步更新索引 (这里会被 Layer 2 检查)
    if let Err(e) = indexing_jobs::dispatch_update_job(
        root_path.clone(),
        relative_path.clone()
    ) {
        eprintln!("⚠️ 分发索引任务失败: {}", e);
    }
    
    let _ = record_file_event(root_path.clone(), relative_path.clone(), "edited".to_string(), state.clone()).await;
    
    // 链接更新代码保持不变
    let db_pool_lock = state.db_pool.lock().unwrap();
    if let Some(db_pool) = db_pool_lock.as_ref() {
        let mut conn = db_pool.get().map_err(|e| e.to_string())?;
        if let Err(e) = update_links_for_file(&mut conn, &root_path, &relative_path) {
            eprintln!("⚠️ 更新链接失败: {}", e);
        }
    }
    
    Ok(())
}

#[tauri::command]
pub async fn create_new_file(
    root_path: String,
    relative_dir_path: String,
    file_name: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let base_path = Path::new(&root_path);
    let absolute_dir_path = to_absolute_path(base_path, Path::new(&relative_dir_path));
    if !absolute_dir_path.exists() || !absolute_dir_path.is_dir() {
        return Err(format!("目录不存在: {}", absolute_dir_path.display()));
    }
    let mut file_name_str = file_name;
    if !file_name_str.ends_with(".md") { file_name_str.push_str(".md"); }
    let absolute_file_path = absolute_dir_path.join(&file_name_str);
    if absolute_file_path.exists() {
        return Err(format!("文件已存在: {}", absolute_file_path.display()));
    }
    let initial_content = format!("# {}\n\n", file_name_str.trim_end_matches(".md"));
    fs::write(&absolute_file_path, &initial_content).map_err(|e| format!("创建文件失败: {}", e))?;

	// [修改] 使用新的 to_relative_path，它已经标准化了路径
    let new_relative_path_str = to_relative_path(base_path, &absolute_file_path)
        .ok_or_else(|| "无法生成相对路径".to_string())?;
		
    
    // [修复] 在独立作用域中处理数据库，确保锁被释放
    {
        let db_pool_lock = state.db_pool.lock().unwrap();
        if let Some(pool) = db_pool_lock.as_ref() {
            let conn = pool.get().map_err(|e| e.to_string())?;
            let title = file_name_str.trim_end_matches(".md");
            conn.execute(
                "INSERT OR IGNORE INTO files (path, title, is_dir, created_at, updated_at) 
                 VALUES (?1, ?2, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                params![new_relative_path_str.clone(), title],
            ).map_err(|e| e.to_string())?;
        }
    } // db_pool_lock 在这里被释放
    
    // 现在可以安全地 await 了
    let _ = record_file_event(root_path.clone(), new_relative_path_str.clone(), "created".to_string(), state.clone()).await; 
    
    Ok(new_relative_path_str)
	
}

//#[tauri::command]
//pub async fn create_new_folder(
//    root_path: String, 
//    relative_parent_path: String, 
//    folder_name: String,
//    state: State<'_, AppState>,
//) -> Result<String, String> {
//    let base_path = Path::new(&root_path);
//    let absolute_parent_path = to_absolute_path(base_path, Path::new(&relative_parent_path));
//    if !absolute_parent_path.exists() || !absolute_parent_path.is_dir() {
//        return Err(format!("目录不存在: {}", absolute_parent_path.display()));
//    }
//    let absolute_folder_path = absolute_parent_path.join(&folder_name);
//    if absolute_folder_path.exists() {
//        return Err(format!("文件夹已存在: {}", absolute_folder_path.display()));
//    }
//    fs::create_dir(&absolute_folder_path).map_err(|e| format!("创建文件夹失败: {}", e))?;
// 
//	// [修改] 使用新的 to_relative_path
//    let new_relative_path_str = to_relative_path(base_path, &absolute_folder_path)
//        .ok_or_else(|| "无法生成相对路径".to_string())?;
//		
//	// ✅ Layer 3: 记录创建时间戳
//    {
//        if let Ok(meta) = metadata(&absolute_file_path) {
//            if let Ok(modified) = meta.modified() {
//                let mut known_times = SAVE_TRACKER.known_write_times.lock().unwrap();
//                known_times.insert(new_relative_path_str.clone(), modified);
//            }
//        }
//    }
//
//    // [修复] 在独立作用域中处理数据库
//    {
//        let db_pool_lock = state.db_pool.lock().unwrap();
//        if let Some(pool) = db_pool_lock.as_ref() {
//            let conn = pool.get().map_err(|e| e.to_string())?;
//            conn.execute(
//                "INSERT OR IGNORE INTO files (path, title, is_dir, created_at, updated_at) 
//                 VALUES (?1, ?2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
//                params![new_relative_path_str.clone(), folder_name],
//            ).map_err(|e| e.to_string())?;
//        }
//    } // db_pool_lock 在这里被释放
//    
//    Ok(new_relative_path_str)
//}
#[tauri::command]
pub async fn create_new_folder(
    root_path: String, 
    relative_parent_path: String, 
    folder_name: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    use crate::indexing_jobs::SAVE_TRACKER;
    
    let base_path = Path::new(&root_path);
    let absolute_parent_path = to_absolute_path(base_path, Path::new(&relative_parent_path));
    if !absolute_parent_path.exists() || !absolute_parent_path.is_dir() {
        return Err(format!("目录不存在: {}", absolute_parent_path.display()));
    }
    let absolute_folder_path = absolute_parent_path.join(&folder_name);
    if absolute_folder_path.exists() {
        return Err(format!("文件夹已存在: {}", absolute_folder_path.display()));
    }
    fs::create_dir(&absolute_folder_path).map_err(|e| format!("创建文件夹失败: {}", e))?;
 
    let new_relative_path_str = to_relative_path(base_path, &absolute_folder_path)
        .ok_or_else(|| "无法生成相对路径".to_string())?;

    // [修复] 在独立作用域中处理数据库
    {
        let db_pool_lock = state.db_pool.lock().unwrap();
        if let Some(pool) = db_pool_lock.as_ref() {
            let conn = pool.get().map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT OR IGNORE INTO files (path, title, is_dir, created_at, updated_at) 
                 VALUES (?1, ?2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                params![new_relative_path_str.clone(), folder_name],
            ).map_err(|e| e.to_string())?;
        }
    }
    
    // ✅ 注意: 文件夹不需要记录时间戳,因为我们只监控 .md 文件
    
    Ok(new_relative_path_str)
}
#[tauri::command]
pub async fn delete_item(
    root_path: String, 
    relative_path: String, 
    state: State<'_, AppState>
) -> Result<(), String> {
    let base_path = Path::new(&root_path);
    let absolute_path = to_absolute_path(base_path, Path::new(&relative_path));
    
    if !absolute_path.exists() {
        return Err(format!("路径不存在: {}", absolute_path.display()));
    }

    let is_dir = absolute_path.is_dir();
    
    // 1. [关键修改] 收集需要删除索引的所有文件
    let paths_to_delete = if is_dir {
        // 文件夹：收集所有 .md 子文件
        println!("📁 正在收集文件夹中的所有文件: {}", relative_path);
        collect_markdown_files(base_path, &relative_path)?
    } else {
        // 单文件
        vec![relative_path.clone()]
    };

    println!("🗑️ 准备删除 {} 个文件的索引", paths_to_delete.len());

    // 2. 删除数据库记录
    {
        let db_pool_lock = state.db_pool.lock().unwrap();
        if let Some(pool) = db_pool_lock.as_ref() {
            let conn = pool.get().map_err(|e| e.to_string())?;
           // [修改] 硬编码分隔符为 '/'
            let separator = "/";
            conn.execute(
                "DELETE FROM files WHERE path = ?1 OR path LIKE ?2",
                params![&relative_path, format!("{}{}%", &relative_path, separator)]
            ).map_err(|e| e.to_string())?;
            
            println!("✅ 数据库记录已删除");
        }
    }

    // 3. [关键修改] 异步删除索引 - 为每个文件分发删除任务
    for path in paths_to_delete {
        if let Err(e) = indexing_jobs::dispatch_delete_job(path.clone()) {
            eprintln!("⚠️ 分发删除索引任务失败 ({}): {}", path, e);
        }
    }

    // 4. 删除文件系统对象
    //if absolute_path.is_file() {
      //  fs::remove_file(&absolute_path).map_err(|e| format!("删除文件失败: {}", e))?;
   // } else {
     //   fs::remove_dir_all(&absolute_path).map_err(|e| format!("删除文件夹失败: {}", e))?;
    //}
	// 4. 移动到回收站(而不是永久删除)
	trash::delete(&absolute_path).map_err(|e| format!("移动到回收站失败: {}", e))?;
	println!("🗑️ 已移动到回收站: {}", absolute_path.display());

    println!("✅ 删除操作完成");
    Ok(())
}

#[tauri::command]
pub async fn delete_folder(root_path: String, relative_path: String, state: State<'_, AppState>) -> Result<(), String> {
    delete_item(root_path, relative_path, state).await
}

fn update_paths_in_db(
    conn: &mut Connection,
    old_prefix: &str,
    new_prefix: &str,
    is_dir: bool,
) -> Result<(), rusqlite::Error> {
    
    if is_dir {
        //let separator = if cfg!(windows) { "\\" } else { "/" };
				 // [修复] 这里应该总是使用 '/', 因为数据库中存储的是标准化后的路径
        let separator = "/"; 
        let pattern = format!("{}{}%", old_prefix, separator);
		
        let tx = conn.transaction()?;
        
       // [修复] 先获取需要更新的所有路径
	   
	   // 👇 **使用新的作用域来限制 stmt 的生命周期**
		let paths_to_update: Vec<(i64, String)> = {
			let mut stmt = tx.prepare(
				"SELECT id, path FROM files WHERE path = ?1 OR path LIKE ?2"
			)?;
			
			// 👇 **应用编译器的修复建议**
			let x = stmt.query_map(params![old_prefix, pattern], |row| {
				Ok((row.get(0)?, row.get(1)?))
			})?
			.collect::<Result<Vec<_>, _>>()?;
			x
		}; // <-- stmt 在此销毁，此时已无任何对它的借用
    
        
        // 更新每个路径
        for (id, old_path) in &paths_to_update {
            let new_path = old_path.replace(old_prefix, new_prefix);
            
            // 提取文件名作为 title
            let title = new_path
                .split('/')
                .last()
                .unwrap_or(&new_path)
                .trim_end_matches(".md");
            
            tx.execute(
                "UPDATE files SET path = ?1, title = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
                params![new_path, title, id],
            )?;
        }
        
        tx.commit()?;
        println!("  更新了 {} 条记录", paths_to_update.len());
        
    } else {
        let new_title = new_prefix
            .split('/')
            .last()
            .unwrap_or(new_prefix)
            .trim_end_matches(".md");
        
        let updated = conn.execute(
            "UPDATE files 
             SET path = ?1, 
                 title = ?2,
                 updated_at = CURRENT_TIMESTAMP 
             WHERE path = ?3",
            params![new_prefix, new_title, old_prefix],
        )?;
        
        if updated > 0 {
            println!("  更新了文件记录: {}", new_title);
        }
    }

    Ok(())
}

#[derive(Debug, Serialize)]
pub struct RenameResult {
    new_path: String,
    old_path: String,
    is_dir: bool,
}


#[tauri::command]
pub async fn rename_item(
    root_path: String,
    old_relative_path: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<RenameResult, String> {
    use crate::indexing_jobs::SAVE_TRACKER;
    use std::fs::metadata;
    use std::time::SystemTime;
    
    println!("🔄 重命名请求: {} -> {}", old_relative_path, new_name);
    let old_relative_path = old_relative_path.replace('\\', "/");
    
    let base_path = Path::new(&root_path);
    let old_abs_path = to_absolute_path(base_path, Path::new(&old_relative_path));
    
    if !old_abs_path.exists() {
        return Err(format!("目标不存在: {}", old_abs_path.display()));
    }

    if new_name.contains('/') || new_name.contains('\\') {
        return Err("新名称不能包含路径分隔符".to_string());
    }

    let is_dir = old_abs_path.is_dir();
    
    // 收集受影响的文件 (文件夹情况)
    let affected_files = if is_dir {
        println!("📁 正在收集文件夹中的所有文件: {}", old_relative_path);
        let mut files = collect_markdown_files(base_path, &old_relative_path)?;
        files = files.into_iter()
            .map(|path| path.replace('\\', "/"))
            .collect();
        files
    } else {
        vec![old_relative_path.clone()]
    };
    
    let parent_path = old_abs_path.parent()
        .ok_or_else(|| "无法获取父目录".to_string())?;
    let new_abs_path = parent_path.join(&new_name);
    
    if new_abs_path.exists() {
        return Err(format!("目标已存在: {}", new_name));
    }

    // 🔧 关键修改 1: 重命名前,先记录当前时间
    let rename_timestamp = SystemTime::now();
    println!("⏰ 记录重命名时间戳: {:?}", rename_timestamp);

    // 执行文件系统重命名
    fs::rename(&old_abs_path, &new_abs_path)
        .map_err(|e| format!("重命名失败: {}", e))?;
    println!("✅ 文件系统重命名成功");

    let new_relative_path = to_relative_path(base_path, &new_abs_path)
        .ok_or_else(|| "无法生成新的相对路径".to_string())?;
    
    println!("📍 旧路径: {}", old_relative_path);
    println!("📍 新路径: {}", new_relative_path);

    // 🔧 关键修改 2: 立即更新追踪器 (使用预先记录的时间戳)
    {
        let mut saving = SAVE_TRACKER.files_currently_saving.lock().unwrap();
        let mut indexing = SAVE_TRACKER.files_currently_indexing.lock().unwrap();
        let mut times = SAVE_TRACKER.indexing_start_times.lock().unwrap();
        let mut known_times = SAVE_TRACKER.known_write_times.lock().unwrap();
        
        // 1. 清除旧路径的所有标记
        saving.remove(&old_relative_path);
        indexing.remove(&old_relative_path);
        times.remove(&old_relative_path);
        known_times.remove(&old_relative_path);
        
        // 2. 为新路径添加时间戳 (使用重命名时的时间戳 + 容差)
        // ✅ 使用稍微提前一点的时间戳,确保 File Watcher 的事件能被识别为内部操作
        known_times.insert(new_relative_path.clone(), rename_timestamp);
        println!("✅ [追踪器] 已记录新路径时间戳: {}", new_relative_path);
        
        // 3. 如果是文件夹,为所有子文件更新时间戳
        if is_dir {
            let old_prefix = old_relative_path.clone();
            let new_prefix = new_relative_path.clone();
            let separator = "/";
            
            for old_file_path in &affected_files {
                // 计算新路径
                let new_file_path = if old_file_path.starts_with(&old_prefix) {
                    format!("{}{}", new_prefix, &old_file_path[old_prefix.len()..])
                } else {
                    continue;
                };
                
                // 清除旧路径,添加新路径
                known_times.remove(old_file_path);
                known_times.insert(new_file_path.clone(), rename_timestamp);
                println!("  ✅ 更新子文件时间戳: {}", new_file_path);
            }
        }
    }

    // 更新数据库
    println!("📝 更新数据库...");
    {
        let db_pool_lock = state.db_pool.lock().unwrap();
        if let Some(pool) = db_pool_lock.as_ref() {
            let mut conn = pool.get().map_err(|e| e.to_string())?;
            update_paths_in_db(&mut conn, &old_relative_path, &new_relative_path, is_dir)
                .map_err(|e| format!("数据库更新失败: {}", e))?;
        }
    }
    println!("✅ 数据库更新完成");

    // 分发重命名索引任务
    if is_dir {
        println!("📁 分发文件夹重命名索引任务...");
        
        let old_prefix = old_relative_path.clone();
        let new_prefix = new_relative_path.clone();
        
        for old_file_path in affected_files {
            let new_file_path = if old_file_path.starts_with(&old_prefix) {
                format!("{}{}", new_prefix, &old_file_path[old_prefix.len()..])
            } else if old_file_path == old_relative_path {
                new_relative_path.clone()
            } else {
                eprintln!("⚠️ 意外的路径格式: {}", old_file_path);
                continue;
            };
            
            println!("  📄 {} -> {}", old_file_path, new_file_path);
            
            if let Err(e) = indexing_jobs::dispatch_rename_job(
                root_path.clone(),
                old_file_path.clone(),
                new_file_path.clone()
            ) {
                eprintln!("⚠️ 分发重命名索引任务失败 ({} -> {}): {}", 
                    old_file_path, new_file_path, e);
            }
        }
        
        println!("✅ 已分发所有重命名索引任务");
    } else {
        println!("📄 分发文件重命名索引任务: {} -> {}", old_relative_path, new_relative_path);
        
        if let Err(e) = indexing_jobs::dispatch_rename_job(
            root_path.clone(),
            old_relative_path.clone(),
            new_relative_path.clone()
        ) {
            eprintln!("⚠️ 分发重命名索引任务失败: {}", e);
        }
    }
    
    println!("✅ 重命名完成（索引正在后台更新）");

    Ok(RenameResult {
        new_path: new_relative_path,
        old_path: old_relative_path,
        is_dir,
    })
}