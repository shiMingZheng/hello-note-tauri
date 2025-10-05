// src-tauri/src/commands/fs.rs
use crate::commands::history::record_file_event;
use crate::commands::links::update_links_for_file;
use crate::commands::path_utils::{to_absolute_path, to_relative_path};
use crate::search::delete_document;
use crate::AppState;
use rusqlite::params;
use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct FileNode {
    name: String,
    path: String, // This will be the relative path
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

    if !dir_to_read.is_dir() {
        return Ok(vec![]);
    }

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
                } else {
                    continue;
                };
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
        // Corrected function call
        if let Err(e) = crate::search::update_document_index(index, db_pool, base_path, relative_path_p) {
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

    let search_index_lock = state.search_index.lock().unwrap();
    let db_pool_lock = state.db_pool.lock().unwrap();
    if let (Some(index), Some(db_pool)) = (search_index_lock.as_ref(), db_pool_lock.as_ref()) {
        // Corrected function call
        if let Err(e) = crate::search::update_document_index(index, db_pool, base_path, &new_relative_path) {
            eprintln!("为新文件更新索引和数据库失败: {}", e);
        }
    }
    
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
    
    if !absolute_path.exists() { return Err(format!("路径不存在: {}", absolute_path.display())); }
    
    if let Some(pool) = state.db_pool.lock().unwrap().as_ref() {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM files WHERE path = ?1", params![&relative_path]).map_err(|e| e.to_string())?;
    }

    if absolute_path.is_file() {
        if let Some(index) = state.search_index.lock().unwrap().as_ref() {
            if let Err(e) = delete_document(index, &relative_path) {
                eprintln!("从索引中删除文档失败: {}", e);
            }
        }
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