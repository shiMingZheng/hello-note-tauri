// src-tauri/src/commands/fs.rs
use crate::commands::history::record_file_event;
use crate::commands::links::update_links_for_file;
use crate::commands::path_utils::{to_absolute_path, to_relative_path};
use crate::AppState;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::fs;
use std::path::Path; // [修复] 移除了未使用的 PathBuf
use tauri::State;
use crate::search_core::{delete_document, update_document_index}; // 移除 reindex_document


// ... (顶部 FileNode 等结构体和函数保持不变) ...
#[derive(Debug, Serialize)]
pub struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    has_children: bool,
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
            if let Some(relative_node_path) = to_relative_path(base_path, &absolute_path) {
                let node = if metadata.is_dir() {
                    FileNode {
                        name: entry.file_name().to_string_lossy().to_string(),
                        path: relative_node_path.to_string_lossy().to_string(),
                        is_dir: true,
                        has_children: directory_has_children(&absolute_path),
                    }
                } else if absolute_path.extension().and_then(|s| s.to_str()) == Some("md") {
                    FileNode {
                        name: entry.file_name().to_string_lossy().to_string(),
                        path: relative_node_path.to_string_lossy().to_string(),
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
    fs::read_to_string(&absolute_path).map_err(|e| format!("读取文件失败: {}", e))
}


#[tauri::command]
pub async fn save_file(
    root_path: String,
    relative_path: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let base_path = Path::new(&root_path);
    let absolute_path = to_absolute_path(base_path, Path::new(&relative_path));
    fs::write(&absolute_path, &content).map_err(|e| format!("保存文件失败: {}", e))?;
    let _ = record_file_event(root_path.clone(), relative_path.clone(), "edited".to_string(), state.clone()).await;
    let search_index_lock = state.search_index.lock().unwrap();
    let db_pool_lock = state.db_pool.lock().unwrap();
    if let (Some(index), Some(db_pool)) = (search_index_lock.as_ref(), db_pool_lock.as_ref()) {
        let relative_path_p = Path::new(&relative_path);
        if let Err(e) = update_document_index(index, db_pool, base_path, relative_path_p) {
            eprintln!("更新索引和数据库失败: {}", e);
        }
        let mut conn = db_pool.get().map_err(|e| e.to_string())?;
        if let Err(e) = update_links_for_file(&mut conn, &root_path, &relative_path) {
            eprintln!("更新文件链接失败: {}", e);
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
    let new_relative_path = to_relative_path(base_path, &absolute_file_path).unwrap();
    let new_relative_path_str = new_relative_path.to_string_lossy().to_string();
    let _ = record_file_event(root_path.clone(), new_relative_path_str.clone(), "created".to_string(), state.clone()).await; 
    
    Ok(new_relative_path_str)
}

#[tauri::command]
pub async fn create_new_folder(root_path: String, relative_parent_path: String, folder_name: String) -> Result<String, String> {
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
    let new_relative_path = to_relative_path(base_path, &absolute_folder_path).unwrap();
    Ok(new_relative_path.to_string_lossy().to_string())
}


#[tauri::command]
pub async fn delete_item(root_path: String, relative_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let base_path = Path::new(&root_path);
    let absolute_path = to_absolute_path(base_path, Path::new(&relative_path));
    if !absolute_path.exists() {
        return Err(format!("路径不存在: {}", absolute_path.display()));
    }

    let db_pool_lock = state.db_pool.lock().unwrap();
    let search_index_lock = state.search_index.lock().unwrap();

    if let Some(pool) = db_pool_lock.as_ref() {
        let conn = pool.get().map_err(|e| e.to_string())?;
        
        let paths_to_delete = if absolute_path.is_dir() {
            let mut stmt = conn.prepare("SELECT path FROM files WHERE path = ?1 OR path LIKE ?2").map_err(|e| e.to_string())?;
            let mut paths = Vec::new();
            let separator = if cfg!(windows) { "\\" } else { "/" };
            let path_iter = stmt.query_map(params![&relative_path, format!("{}{}%", &relative_path, separator)], |row| row.get(0))
                .map_err(|e| e.to_string())?;
            for path in path_iter {
                paths.push(path.map_err(|e| e.to_string())?);
            }
            paths
        } else {
            vec![relative_path.clone()]
        };

        let separator = if cfg!(windows) { "\\" } else { "/" };
        conn.execute("DELETE FROM files WHERE path = ?1 OR path LIKE ?2", params![&relative_path, format!("{}{}%", &relative_path, separator)])
            .map_err(|e| e.to_string())?;

        if let Some(index) = search_index_lock.as_ref() {
            for path in paths_to_delete {
                if let Err(e) = delete_document(index, &path) {
                    eprintln!("从索引中删除文档 '{}' 失败: {}", path, e);
                }
            }
        }
    }

    if absolute_path.is_file() {
        fs::remove_file(&absolute_path).map_err(|e| format!("删除文件失败: {}", e))?;
    } else {
        fs::remove_dir_all(&absolute_path).map_err(|e| format!("删除文件夹失败: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_folder(root_path: String, relative_path: String, state: State<'_, AppState>) -> Result<(), String> {
    delete_item(root_path, relative_path, state).await
}

/**
 * [修复] 批量更新数据库中的路径
 * 修复点：确保在事务开始前释放所有读锁
 */

fn update_paths_in_db(
    conn: &mut Connection,
    old_prefix: &str,
    new_prefix: &str,
    is_dir: bool,
) -> Result<(), rusqlite::Error> {
    
    if is_dir {
        let separator = if cfg!(windows) { "\\" } else { "/" };
        let pattern = format!("{}{}%", old_prefix, separator);
        
        let tx = conn.transaction()?;
        
        // [修改] title 始终等于文件名
        let updated = tx.execute(
            "UPDATE files 
             SET path = REPLACE(path, ?1, ?2),
                 title = substr(
                     REPLACE(path, ?1, ?2), 
                     length(REPLACE(path, ?1, ?2)) - instr(reverse(REPLACE(path, ?1, ?2)), '/') + 2
                 ),
                 updated_at = CURRENT_TIMESTAMP
             WHERE path = ?1 OR path LIKE ?3",
            params![old_prefix, new_prefix, pattern],
        )?;
        
        // 移除 .md 后缀
        tx.execute(
            "UPDATE files 
             SET title = REPLACE(title, '.md', '') 
             WHERE title LIKE '%.md'",
            [],
        )?;
        
        tx.commit()?;
        println!("  更新了 {} 条文件夹记录", updated);
        
    } else {
        // [修改] 单个文件的 title 就是文件名
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

/**
 * [优化] 重命名文件或文件夹
 * 修复点：
 * 1. 返回 is_dir 字段，让前端知道是文件还是文件夹
 * 2. 对文件夹使用增量索引更新，而不是全量重建
 * 3. 添加详细的日志输出
 */
#[tauri::command]
pub async fn rename_item(
    root_path: String,
    old_relative_path: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<RenameResult, String> {
    println!("🔄 重命名请求: {} -> {}", old_relative_path, new_name);
    
    let base_path = Path::new(&root_path);
    let old_abs_path = to_absolute_path(base_path, Path::new(&old_relative_path));
    
    if !old_abs_path.exists() {
        return Err(format!("目标不存在: {}", old_abs_path.display()));
    }

    if new_name.contains('/') || new_name.contains('\\') {
        return Err("新名称不能包含路径分隔符".to_string());
    }

    let mut new_abs_path = old_abs_path.clone();
    new_abs_path.set_file_name(&new_name);
    
    if old_abs_path.is_file() && new_abs_path.extension().is_none() {
        new_abs_path.set_extension("md");
    }

    if new_abs_path.exists() {
        return Err("同名文件或文件夹已存在".to_string());
    }

    // 执行文件系统重命名
    fs::rename(&old_abs_path, &new_abs_path)
        .map_err(|e| format!("文件系统重命名失败: {}", e))?;
    
    println!("✅ 文件系统重命名成功");

    let mut new_relative_path = to_relative_path(base_path, &new_abs_path)
        .unwrap()
        .to_string_lossy()
        .to_string();

    new_relative_path = new_relative_path.replace('\\', "/");
    
    let is_dir = new_abs_path.is_dir();
    
    // 同步更新数据库（快速）
    let db_pool_lock = state.db_pool.lock().unwrap();
    let search_index_lock = state.search_index.lock().unwrap();

    if let Some(pool) = db_pool_lock.as_ref() {
        let mut conn = pool.get().map_err(|e| e.to_string())?;
        
        println!("📝 更新数据库...");
        update_paths_in_db(&mut conn, &old_relative_path, &new_relative_path, is_dir)
            .map_err(|e| format!("数据库更新失败: {}", e))?;
        
        println!("✅ 数据库更新完成");
        
        // [新增] 标记索引需要更新
        let _ = conn.execute(
            "INSERT OR REPLACE INTO index_status (key, value, updated_at) 
             VALUES ('indexing', 'true', CURRENT_TIMESTAMP)",
            [],
        );
    }

    // [关键] 异步更新索引（文件和文件夹都异步）
    if let (Some(pool), Some(index)) = (db_pool_lock.as_ref(), search_index_lock.as_ref()) {
        let pool_clone = pool.clone();
        let index_clone = index.clone();
        let base_path_owned = base_path.to_path_buf();
        let new_relative_path_clone = new_relative_path.clone();
        let is_dir_clone = is_dir;
        
        tauri::async_runtime::spawn(async move {
            println!("🔍 [后台] 开始异步更新索引...");
            let start_time = std::time::Instant::now();
            
            if is_dir_clone {
                // 文件夹：更新所有子文件
                if let Ok(conn) = pool_clone.get() {
                    let separator = std::path::MAIN_SEPARATOR.to_string();
                    let pattern = format!("{}{}%", new_relative_path_clone, separator);
                    
                    if let Ok(mut stmt) = conn.prepare(
                        "SELECT path FROM files WHERE path = ?1 OR path LIKE ?2"
                    ) {
                        if let Ok(paths) = stmt.query_map(
                            params![new_relative_path_clone, pattern], 
                            |row| row.get::<_, String>(0)
                        ) {
                            let affected_files: Vec<String> = paths.filter_map(Result::ok).collect();
                            println!("🔍 [后台] 需要更新 {} 个文件的索引", affected_files.len());
                            
                            for relative_path in affected_files {
                                let file_path = std::path::Path::new(&relative_path);
                                if let Err(e) = update_document_index(
                                    &index_clone, 
                                    &pool_clone, 
                                    &base_path_owned, 
                                    file_path
                                ) {
                                    eprintln!("🔍 [后台] ⚠️ 更新索引失败 {}: {}", relative_path, e);
                                }
                            }
                        }
                    }
                }
            } else {
                // 单个文件：更新一个索引
                let new_path = std::path::Path::new(&new_relative_path_clone);
                if let Err(e) = update_document_index(
                    &index_clone, 
                    &pool_clone, 
                    &base_path_owned, 
                    new_path
                ) {
                    eprintln!("🔍 [后台] ⚠️ 更新索引失败: {}", e);
                }
            }
            
            let elapsed = start_time.elapsed();
            println!("🔍 [后台] ✅ 索引更新完成，耗时: {:?}", elapsed);
            
            // 更新完成后清除标记
            if let Ok(conn) = pool_clone.get() {
                let _ = conn.execute(
                    "DELETE FROM index_status WHERE key = 'indexing'",
                    [],
                );
            }
        });
    }
    
    println!("✅ 重命名完成（索引正在后台更新）");

    Ok(RenameResult {
        new_path: new_relative_path,
        old_path: old_relative_path,
        is_dir,
    })
}