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
use crate::search_core::{delete_document, update_document_index,update_document_index_for_rename};
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
fn collect_markdown_files(
    base_path: &Path,
    folder_relative_path: &str,
) -> Result<Vec<String>, String> {
    let folder_absolute_path = to_absolute_path(base_path, Path::new(folder_relative_path));
    
    let mut md_files = Vec::new();
    
    for entry in WalkDir::new(&folder_absolute_path)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        
        // 跳过目录本身，只处理文件
        if !path.is_file() {
            continue;
        }
        
        // 只处理 .md 文件
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        
        // 转换为相对路径
        if let Some(relative_path) = to_relative_path(base_path, path) {
            md_files.push(relative_path.to_string_lossy().to_string());
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
    let base_path = Path::new(&root_path);
    let absolute_path = to_absolute_path(base_path, Path::new(&relative_path));
    fs::write(&absolute_path, &content).map_err(|e| format!("保存文件失败: {}", e))?;
    let _ = record_file_event(root_path.clone(), relative_path.clone(), "edited".to_string(), state.clone()).await;
   
    // 异步更新索引
	if let Err(e) = indexing_jobs::dispatch_update_job(
		root_path.clone(),
		relative_path.clone()
	) {
		eprintln!("⚠️ 分发索引任务失败: {}", e);
	}
	
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
    let new_relative_path = to_relative_path(base_path, &absolute_file_path).unwrap();
    let new_relative_path_str = new_relative_path.to_string_lossy().to_string();
    
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

#[tauri::command]
pub async fn create_new_folder(
    root_path: String, 
    relative_parent_path: String, 
    folder_name: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
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
    let new_relative_path_str = new_relative_path.to_string_lossy().to_string();
    
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
    } // db_pool_lock 在这里被释放
    
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
            let separator = if cfg!(windows) { "\\" } else { "/" };
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
    if absolute_path.is_file() {
        fs::remove_file(&absolute_path).map_err(|e| format!("删除文件失败: {}", e))?;
    } else {
        fs::remove_dir_all(&absolute_path).map_err(|e| format!("删除文件夹失败: {}", e))?;
    }

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
        let separator = if cfg!(windows) { "\\" } else { "/" };
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
    println!("🔄 重命名请求: {} -> {}", old_relative_path, new_name);
    
    let base_path = Path::new(&root_path);
    let old_abs_path = to_absolute_path(base_path, Path::new(&old_relative_path));
    
    if !old_abs_path.exists() {
        return Err(format!("目标不存在: {}", old_abs_path.display()));
    }

    if new_name.contains('/') || new_name.contains('\\') {
        return Err("新名称不能包含路径分隔符".to_string());
    }

    let is_dir = old_abs_path.is_dir();
    
    // [新增] 在重命名前收集文件夹中的所有文件
    let affected_files = if is_dir {
        println!("📁 正在收集文件夹中的所有文件: {}", old_relative_path);
        let mut files = collect_markdown_files(base_path, &old_relative_path)?;
        
        // [关键修复] 统一路径分隔符为正斜杠
        files = files.into_iter()
            .map(|path| path.replace('\\', "/"))
            .collect();
        
        files
    } else {
        vec![]
    };
    
    if is_dir {
        println!("📊 文件夹包含 {} 个 Markdown 文件", affected_files.len());
    }

    // 构造新的绝对路径
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

    // 计算新的相对路径
    let mut new_relative_path = to_relative_path(base_path, &new_abs_path)
        .unwrap()
        .to_string_lossy()
        .to_string();
    new_relative_path = new_relative_path.replace('\\', "/");
    
    println!("📍 旧路径: {}", old_relative_path);
    println!("📍 新路径: {}", new_relative_path);

    // 更新数据库
    let db_pool_lock = state.db_pool.lock().unwrap();
    if let Some(pool) = db_pool_lock.as_ref() {
        let mut conn = pool.get().map_err(|e| e.to_string())?;
        
        println!("📝 更新数据库...");
        update_paths_in_db(&mut conn, &old_relative_path, &new_relative_path, is_dir)
            .map_err(|e| format!("数据库更新失败: {}", e))?;
        
        println!("✅ 数据库更新完成");
    }

    // 异步更新索引
    if is_dir {
        // 文件夹重命名：为每个子文件分发重命名任务
        println!("🔍 分发 {} 个文件的重命名索引任务...", affected_files.len());
        
        // [关键修复] 使用更精确的路径替换方法
        let old_prefix = if old_relative_path.is_empty() {
            String::new()
        } else {
            format!("{}/", old_relative_path)
        };
        
        let new_prefix = if new_relative_path.is_empty() {
            String::new()
        } else {
            format!("{}/", new_relative_path)
        };
        
        for old_file_path in affected_files {
            // [关键修复] 只在路径开头替换，避免嵌套同名问题
            let new_file_path = if old_prefix.is_empty() {
                // 根目录重命名的特殊情况
                old_file_path.clone()
            } else if old_file_path.starts_with(&old_prefix) {
                // 替换路径前缀
                format!("{}{}", new_prefix, &old_file_path[old_prefix.len()..])
            } else if old_file_path == old_relative_path {
                // 处理文件夹自身（虽然我们只收集文件，但为了完整性）
                new_relative_path.clone()
            } else {
                // 不应该发生，但保险起见
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
        // 单文件重命名
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