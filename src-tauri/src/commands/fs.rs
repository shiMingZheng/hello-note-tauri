// src-tauri/src/commands/fs.rs
// ★★★ 已根据新的 SaveTracker (app_activity_locks) 重构 ★★★

use crate::commands::history::record_file_event;
use crate::commands::links::update_links_for_file;
use crate::commands::path_utils::{to_absolute_path, to_relative_path};  
use crate::AppState;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::State;
use crate::indexing_jobs;
use walkdir::WalkDir;
use std::fs::metadata; 
use crate::indexing_jobs::SAVE_TRACKER;
use std::time::SystemTime;

#[derive(Debug, Serialize)]
pub struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    has_children: bool,
}

#[tauri::command]
pub async fn move_item(
    root_path: String,
    source_path: String, // 旧的相对路径
    target_dir: String,  // 新的父目录相对路径
    state: State<'_, AppState>, // ★★★ 1. (重构) 添加 state ★★★
) -> Result<serde_json::Value, String> {
    use std::path::PathBuf;

    println!("📦 [fs::move_item] 开始移动: {} -> {}", source_path, target_dir);
    let base_path = Path::new(&root_path);

    // --- 1. 计算路径和元数据 ---
    let source_full = to_absolute_path(base_path, Path::new(&source_path));
    let target_dir_full = to_absolute_path(base_path, Path::new(&target_dir));
    
    let item_name = source_full.file_name().ok_or("无法获取文件名")?.to_str().ok_or("文件名编码错误")?;
    let target_full = target_dir_full.join(item_name);
    
    // ★★★ 核心修改：计算新的相对路径 ★★★
    let new_relative_path = to_relative_path(base_path, &target_full)
        .ok_or_else(|| "无法生成新的相对路径".to_string())?;

    // --- 2. 检查路径 ---
    if !source_full.exists() { return Err(format!("源路径不存在: {:?}", source_full)); }
    if !target_dir_full.exists() { return Err(format!("目标目录不存在: {:?}", target_dir_full)); }
    if target_full.exists() { return Err(format!("目标位置已存在同名文件: {}", item_name)); }
    
    let is_dir = source_full.is_dir();
    
    // --- 3. 收集受影响的文件 ---
    let affected_files = if is_dir {
        collect_markdown_files(base_path, &source_path)?
    } else {
        vec![source_path.clone()]
    };

    let new_affected_files: Vec<String> = affected_files.iter()
        .map(|old_file_path| old_file_path.replace(&source_path, &new_relative_path))
        .collect();

    // --- 4. ★★★ L1/L2 加锁 (新旧路径) ★★★
    {
        let mut locks = SAVE_TRACKER.app_activity_locks.lock().unwrap();
        for path in &affected_files { locks.insert(path.clone()); }
        for path in &new_affected_files { locks.insert(path.clone()); }
        if is_dir {
            locks.insert(source_path.clone());
            locks.insert(new_relative_path.clone());
        }
        println!("   [fs::move_item] L1/L2: 添加了 {} 个活动锁", locks.len());
    }

    // --- 5. L3 记录时间戳 ---
    let move_timestamp = SystemTime::now();

    // --- 6. 执行移动 ---
    fs::rename(&source_full, &target_full)
        .map_err(|e| format!("移动失败: {}", e))?;
    println!("   [fs::move_item] 文件系统移动成功");

    // --- 7. ★★★ L3 更新时间戳 ★★★
    {
        let mut known_times = SAVE_TRACKER.known_write_times.lock().unwrap();
        for old_path in &affected_files { known_times.remove(old_path); }
        for new_path in &new_affected_files { known_times.insert(new_path.clone(), move_timestamp); }
        println!("   [fs::move_item] L3: 更新了 {} 个时间戳", new_affected_files.len());
    }

    // --- 8. 更新数据库 ---
    println!("   [fs::move_item] 📝 更新数据库 (移动)...");
    {
        let db_pool_lock = state.db_pool.lock().unwrap();
        if let Some(pool) = db_pool_lock.as_ref() {
            let mut conn = pool.get().map_err(|e| e.to_string())?;
            update_paths_in_db(&mut conn, &source_path, &new_relative_path, is_dir)
                .map_err(|e| format!("数据库更新失败: {}", e))?;
        }
    }
    println!("   [fs::move_item] ✅ 数据库更新完成 (移动)");

    // --- 9. 分发索引任务 (锁将在后台释放) ---
    for (old_file_path, new_file_path) in affected_files.into_iter().zip(new_affected_files.into_iter()) {
        if let Err(e) = indexing_jobs::dispatch_rename_job(
            root_path.clone(),
            old_file_path.clone(),
            new_file_path.clone()
        ) {
            eprintln!("⚠️ [fs::move_item] 分发移动索引任务失败 ({} -> {}): {}", old_file_path, new_file_path, e);
            // ★★★ 关键：如果分发失败，必须立即释放锁 ★★★
            let mut locks = SAVE_TRACKER.app_activity_locks.lock().unwrap();
            locks.remove(&old_file_path);
            locks.remove(&new_file_path);
        }
    }
    
    println!("✅ [fs::move_item] 移动完成: {} -> {}", source_path, new_relative_path);

    // ★★★ 3. (重构) 更改返回值以匹配前端期望 ★★★
    Ok(serde_json::json!({
        "success": true,
        "old_path": source_path,
        "new_path": new_relative_path,
        "is_dir": is_dir,
        "message": format!("已移动到 {}", target_dir)
    }))
}

/// 递归收集文件夹下的所有 .md 文件的相对路径
fn collect_markdown_files(
    base_path: &Path,
    folder_relative_path: &str,
) -> Result<Vec<String>, String> {
    // ... (函数内容不变) ...
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
    // ... (函数内容不变) ...
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
    // ... (函数内容不变) ...
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
            if let Some(relative_node_path) = to_relative_path(base_path, &absolute_path) {
                let node = if metadata.is_dir() {
                    FileNode {
                        name: entry.file_name().to_string_lossy().to_string(),
                        path: relative_node_path,
                        is_dir: true,
                        has_children: directory_has_children(&absolute_path),
                    }
                } else if absolute_path.extension().and_then(|s| s.to_str()) == Some("md") {
                    FileNode {
                        name: entry.file_name().to_string_lossy().to_string(),
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
    // ... (函数内容不变) ...
    let absolute_path = to_absolute_path(Path::new(&root_path), Path::new(&relative_path));
    if !absolute_path.exists() { return Err(format!("文件不存在: {}", relative_path)); }
    if !absolute_path.is_file() { return Err(format!("路径不是文件: {}", relative_path)); }
    fs::read_to_string(&absolute_path).map_err(|e| format!("读取文件失败: {}", e))
}


/* ★★★ 重构 save_file ★★★ */
#[tauri::command]
pub async fn save_file(
    root_path: String,
    relative_path: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    println!("💾 [fs::save_file] 开始保存: {}", relative_path);

    // ★★★ 步骤 1: L1/L2 加锁 ★★★
    // (合并 L1/L2 锁，在操作*开始*时加锁)
    {
        let mut locks = SAVE_TRACKER.app_activity_locks.lock().unwrap();
        locks.insert(relative_path.clone());
        println!("   [fs::save_file] L1/L2: 添加活动锁");
    }

    let base_path = Path::new(&root_path);
    let absolute_path = to_absolute_path(base_path, Path::new(&relative_path));

    // 步骤 2: 执行写入
    fs::write(&absolute_path, &content).map_err(|e| format!("保存文件失败: {}", e))?;
    println!("   [fs::save_file] 文件写入磁盘成功");

    // 步骤 3: L3 记录写入时间戳
    {
        if let Ok(meta) = metadata(&absolute_path) {
            if let Ok(modified) = meta.modified() {
                let mut known_times = SAVE_TRACKER.known_write_times.lock().unwrap();
                known_times.insert(relative_path.clone(), modified);
                println!("   [fs::save_file] L3: 记录写入时间戳");
            } else {
                 println!("   [fs::save_file] L3: 获取修改时间失败");
            }
        } else {
             println!("   [fs::save_file] L3: 获取元数据失败");
        }
    }
    
    // (L1/L2 锁*不*在这里释放，将由 process_job 在索引完成后释放)

    // --- 记录历史事件 (移到获取 db_pool_lock 之前) ---
    println!("   [fs::save_file] 准备记录编辑历史...");
    let _ = record_file_event(root_path.clone(), relative_path.clone(), "edited".to_string(), state.clone()).await;
    println!("   [fs::save_file] 记录编辑历史完成 (或已尝试)");


    // --- 数据库链接更新 ---
    let root_path_clone_for_links = root_path.clone();
    let relative_path_clone_for_links = relative_path.clone();

    { 
        let db_pool_lock = state.db_pool.lock().unwrap();
        if let Some(db_pool) = db_pool_lock.as_ref() {
            let mut conn = db_pool.get().map_err(|e| format!("获取数据库连接失败: {}", e))?;
            println!("   [fs::save_file] 获取数据库连接成功 (用于链接更新)");

            println!("   [fs::save_file] 开始更新双向链接...");
            if let Err(e) = update_links_for_file(&mut conn, &root_path_clone_for_links, &relative_path_clone_for_links) {
                eprintln!("⚠️ [fs::save_file] 更新双向链接失败: {}", e);
            } else {
                println!("   [fs::save_file] 更新双向链接成功");
            }
        } else {
            eprintln!("⚠️ [fs::save_file] 数据库连接池未初始化，无法更新链接");
        }
    }


    // 步骤 4: 异步更新索引
    println!("   [fs::save_file] 准备分发索引更新任务...");
    if let Err(e) = indexing_jobs::dispatch_update_job(
        root_path.clone(),
        relative_path.clone()
    ) {
        eprintln!("⚠️ [fs::save_file] 分发索引任务失败: {}", e);
        // ★★★ 关键：如果分发失败，必须立即释放锁 ★★★
        SAVE_TRACKER.app_activity_locks.lock().unwrap().remove(&relative_path);
        eprintln!("   [fs::save_file] L1/L2: 因分发失败，释放锁");
    } else {
         println!("   [fs::save_file] 索引更新任务已分发 (锁将在后台释放)");
    }

    println!("✅ [fs::save_file] 保存完成: {}", relative_path);
    Ok(())
}

/* ★★★ 重构 create_new_file ★★★ */
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
    
    // ★★★ 核心修改：计算元数据 ★★★
    let initial_content = format!("# {}\n\n", file_name_str.trim_end_matches(".md"));
    let content_size = initial_content.len() as i64;
    let word_count = initial_content.split_whitespace().count() as i64;
    
    // 步骤 1: 写入磁盘
    fs::write(&absolute_file_path, &initial_content).map_err(|e| format!("创建文件失败: {}", e))?;

    let new_relative_path_str = to_relative_path(base_path, &absolute_file_path)
        .ok_or_else(|| "无法生成相对路径".to_string())?;
		
    // ★★★ 步骤 2: L1/L2 加锁 ★★★
    SAVE_TRACKER.app_activity_locks.lock().unwrap().insert(new_relative_path_str.clone());
    println!("   [fs::create_new_file] L1/L2: 添加活动锁");
    
    // ★★★ 步骤 3: L3 记录时间戳 ★★★
    if let Ok(meta) = metadata(&absolute_file_path) {
        if let Ok(modified) = meta.modified() {
            SAVE_TRACKER.known_write_times.lock().unwrap().insert(new_relative_path_str.clone(), modified);
            println!("   [fs::create_new_file] L3: 记录写入时间戳");
        }
    }
    
    // 步骤 4: 数据库操作
    {
        let db_pool_lock = state.db_pool.lock().unwrap();
        if let Some(pool) = db_pool_lock.as_ref() {
            let conn = pool.get().map_err(|e| e.to_string())?;
            let title = file_name_str.trim_end_matches(".md");
            
            // ★★★ 核心修改：插入时包含 size 和 word_count, indexed = 0 ★★★
            conn.execute(
                "INSERT OR IGNORE INTO files (path, title, is_dir, created_at, updated_at, size, word_count, indexed) 
                 VALUES (?1, ?2, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?3, ?4, 0)",
                params![new_relative_path_str.clone(), title, content_size, word_count],
            ).map_err(|e| e.to_string())?;
        }
    }
    
    // 步骤 5: 记录历史事件
    let _ = record_file_event(root_path.clone(), new_relative_path_str.clone(), "created".to_string(), state.clone()).await; 
    
    // 步骤 6: 分发索引任务 (锁将在后台释放)
    if let Err(e) = indexing_jobs::dispatch_update_job(
        root_path.clone(),
        new_relative_path_str.clone()
    ) {
        eprintln!("⚠️ [fs::create_new_file] 分发索引任务失败: {}", e);
        // ★★★ 关键：如果分发失败，必须立即释放锁 ★★★
        SAVE_TRACKER.app_activity_locks.lock().unwrap().remove(&new_relative_path_str);
        eprintln!("   [fs::create_new_file] L1/L2: 因分发失败，释放锁");
    } else {
        println!("   [fs::create_new_file] 索引更新任务已分发");
    }

    Ok(new_relative_path_str)
	
}

#[tauri::command]
pub async fn create_new_folder(
    root_path: String, 
    relative_parent_path: String, 
    folder_name: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // ... (函数内容不变, 文件夹操作不需要 L1/L2 锁) ...
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
    
    Ok(new_relative_path_str)
}

/* ★★★ 重构 delete_item ★★★ */
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
    
    // 1. 收集需要删除索引的所有 .md 文件
    let paths_to_delete = if is_dir {
        println!("📁 正在收集文件夹中的所有文件: {}", relative_path);
        collect_markdown_files(base_path, &relative_path)?
    } else {
        vec![relative_path.clone()]
    };

    println!("🗑️ 准备删除 {} 个文件的索引", paths_to_delete.len());

    // ★★★ 步骤 1: L1/L2 加锁 (为所有子文件加锁) ★★★
    {
        let mut locks = SAVE_TRACKER.app_activity_locks.lock().unwrap();
        for path in &paths_to_delete {
            locks.insert(path.clone());
        }
        if is_dir {
            locks.insert(relative_path.clone()); // 锁文件夹本身
        }
        println!("   [fs::delete_item] L1/L2: 添加了 {} 个活动锁", locks.len());
    }

    // 2. 删除数据库记录
    {
        let db_pool_lock = state.db_pool.lock().unwrap();
        if let Some(pool) = db_pool_lock.as_ref() {
            let conn = pool.get().map_err(|e| e.to_string())?;
            let separator = "/";
            conn.execute(
                "DELETE FROM files WHERE path = ?1 OR path LIKE ?2",
                params![&relative_path, format!("{}{}%", &relative_path, separator)]
            ).map_err(|e| e.to_string())?;
            
            println!("✅ 数据库记录已删除");
        }
    }

	// 3. 移动到回收站
	trash::delete(&absolute_path).map_err(|e| format!("移动到回收站失败: {}", e))?;
	
    // 4. ★★★ L3 清理时间戳 ★★★
    {
        let mut known_times = SAVE_TRACKER.known_write_times.lock().unwrap();
        for path in &paths_to_delete {
            known_times.remove(path);
        }
         println!("   [fs::delete_item] L3: 清理了 {} 个时间戳", paths_to_delete.len());
    }
	
	// (L1/L2 锁*不*在这里释放)
	
    // 5. 异步删除索引 (锁将在后台释放)
    for path in paths_to_delete {
        if let Err(e) = indexing_jobs::dispatch_delete_job(path.clone()) {
            eprintln!("⚠️ 分发删除索引任务失败 ({}): {}", path, e);
            // ★★★ 关键：如果分发失败，必须立即释放锁 ★★★
            SAVE_TRACKER.app_activity_locks.lock().unwrap().remove(&path);
        }
    }

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
    // ... (函数内容不变) ...
    if is_dir {
        let separator = "/"; 
        let pattern = format!("{}{}%", old_prefix, separator);
		let tx = conn.transaction()?;
		let paths_to_update: Vec<(i64, String)> = {
			let mut stmt = tx.prepare(
				"SELECT id, path FROM files WHERE path = ?1 OR path LIKE ?2"
			)?;
			let x = stmt.query_map(params![old_prefix, pattern], |row| {
				Ok((row.get(0)?, row.get(1)?))
			})?
			.collect::<Result<Vec<_>, _>>()?;
			x
		};
        for (id, old_path) in &paths_to_update {
            let new_path = old_path.replace(old_prefix, new_prefix);
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
             SET path = ?1, title = ?2, updated_at = CURRENT_TIMESTAMP 
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


/* ★★★ 重构 rename_item ★★★ */
#[tauri::command]
pub async fn rename_item(
    root_path: String,
    old_relative_path: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<RenameResult, String> {
    
    println!("🔄 重命名请求: {} -> {}", old_relative_path, new_name);
    let old_relative_path = old_relative_path.replace('\\', "/");
    
    let base_path = Path::new(&root_path);
    let old_abs_path = to_absolute_path(base_path, Path::new(&old_relative_path));
    
    if !old_abs_path.exists() { return Err(format!("目标不存在: {}", old_abs_path.display())); }
    if new_name.contains('/') || new_name.contains('\\') { return Err("新名称不能包含路径分隔符".to_string()); }

    let is_dir = old_abs_path.is_dir();
    
    // 1. 收集受影响的文件
    let affected_files = if is_dir {
        println!("📁 正在收集文件夹中的所有文件: {}", old_relative_path);
        collect_markdown_files(base_path, &old_relative_path)?
    } else {
        vec![old_relative_path.clone()]
    };
    
    let parent_path = old_abs_path.parent().ok_or_else(|| "无法获取父目录".to_string())?;
    let new_abs_path = parent_path.join(&new_name);
    
    if new_abs_path.exists() { return Err(format!("目标已存在: {}", new_name)); }

    // 2. ★★★ 计算新路径 ★★★
    let new_relative_path = to_relative_path(base_path, &new_abs_path)
        .ok_or_else(|| "无法生成新的相对路径".to_string())?;
    
    let new_affected_files: Vec<String> = affected_files.iter()
        .map(|old_file_path| old_file_path.replace(&old_relative_path, &new_relative_path))
        .collect();

    // 3. ★★★ L1/L2 加锁 (为所有新旧路径加锁) ★★★
    {
        let mut locks = SAVE_TRACKER.app_activity_locks.lock().unwrap();
        for path in &affected_files { locks.insert(path.clone()); }
        for path in &new_affected_files { locks.insert(path.clone()); }
        if is_dir {
            locks.insert(old_relative_path.clone());
            locks.insert(new_relative_path.clone());
        }
        println!("   [fs::rename_item] L1/L2: 添加了 {} 个活动锁", locks.len());
    }

    // 4. 记录时间戳
    let rename_timestamp = SystemTime::now();
    println!("⏰ 记录重命名时间戳: {:?}", rename_timestamp);

    // 5. 执行文件系统重命名
    fs::rename(&old_abs_path, &new_abs_path)
        .map_err(|e| format!("重命名失败: {}", e))?;
    println!("✅ 文件系统重命名成功");

    println!("📍 旧路径: {}", old_relative_path);
    println!("📍 新路径: {}", new_relative_path);

    // 6. ★★★ L3 更新时间戳 ★★★
    {
        let mut known_times = SAVE_TRACKER.known_write_times.lock().unwrap();
        // 1. 清除旧路径的所有标记
        for old_path in &affected_files {
            known_times.remove(old_path);
        }
        // 2. 为新路径添加时间戳
        for new_path in &new_affected_files {
            known_times.insert(new_path.clone(), rename_timestamp);
        }
        println!("   [fs::rename_item] L3: 更新了 {} 个时间戳", new_affected_files.len());
    }

    // 7. 更新数据库
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
    
    // (L1/L2 锁*不*在这里释放)

    // 8. 分发重命名索引任务 (锁将在后台释放)
    for (old_file_path, new_file_path) in affected_files.into_iter().zip(new_affected_files.into_iter()) {
        println!("  📄 {} -> {}", old_file_path, new_file_path);
        
        if let Err(e) = indexing_jobs::dispatch_rename_job(
            root_path.clone(),
            old_file_path.clone(),
            new_file_path.clone()
        ) {
            eprintln!("⚠️ 分发重命名索引任务失败 ({} -> {}): {}", old_file_path, new_file_path, e);
            // ★★★ 关键：如果分发失败，必须立即释放锁 ★★★
            let mut locks = SAVE_TRACKER.app_activity_locks.lock().unwrap();
            locks.remove(&old_file_path);
            locks.remove(&new_file_path);
        }
    }
    
    println!("✅ 重命名完成（索引正在后台更新）");

    Ok(RenameResult {
        new_path: new_relative_path,
        old_path: old_relative_path,
        is_dir,
    })
}