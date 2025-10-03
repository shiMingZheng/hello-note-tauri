// src/commands/fs.rs

use std::fs;
use std::path::{Path, PathBuf};
use serde::Serialize;
use tauri::State;
use crate::search::delete_document; 
use crate::AppState;
use rusqlite::params;

// ========================================
// 数据结构定义 (已修改)
// ========================================

#[derive(Debug, Serialize)]
pub struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    // 新增: 用于告知前端此目录是否包含任何有效子项（.md文件或子目录）
    has_children: bool, 
}

// ========================================
// 文件系统命令 (已修改)
// ========================================

/// 检查目录是否包含任何有效内容（非隐藏的 .md 文件或子目录）
fn directory_has_children(dir: &Path) -> bool {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if name.starts_with('.') {
                    continue; // 跳过隐藏文件/目录
                }
            }
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_dir() {
                    return true;
                }
                if metadata.is_file() && entry.path().extension().and_then(|s| s.to_str()) == Some("md") {
                    return true;
                }
            }
        }
    }
    false
}

/// [新命令] 懒加载方式读取单层目录
#[tauri::command]
pub async fn list_dir_lazy(path: String) -> Result<Vec<FileNode>, String> {
    let base_path = PathBuf::from(&path);
    if !base_path.is_dir() {
        return Ok(vec![]); // 如果不是目录，返回空数组
    }

    let mut nodes = Vec::new();
    let entries = fs::read_dir(&base_path)
        .map_err(|e| format!("读取目录失败: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(name) = entry.file_name().to_str() {
            if name.starts_with('.') {
                continue;
            }
        }
        
        if let Ok(metadata) = entry.metadata() {
            let node = if metadata.is_dir() {
                FileNode {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: path.to_string_lossy().to_string(),
                    is_dir: true,
                    has_children: directory_has_children(&path),
                }
            } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
                FileNode {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: path.to_string_lossy().to_string(),
                    is_dir: false,
                    has_children: false,
                }
            } else {
                continue;
            };
            nodes.push(node);
        }
    }

    nodes.sort_by(|a, b| {
        if a.is_dir == b.is_dir {
            a.name.cmp(&b.name)
        } else if a.is_dir {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    Ok(nodes)
}


#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("读取文件失败: {}", e))
}

// ========================================
// 文件操作命令 (保持不变)
// ========================================

#[tauri::command]
pub async fn save_file(
    path: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    fs::write(&path, &content)
        .map_err(|e| format!("保存文件失败: {}", e))?;
    
    // [修复] 同时获取 index 和 db_pool
    let search_index_lock = state.search_index.lock().unwrap();
    let db_pool_lock = state.db_pool.lock().unwrap();
    if let (Some(index), Some(db_pool)) = (search_index_lock.as_ref(), db_pool_lock.as_ref()) {
        let file_path = PathBuf::from(&path);
        // [修复] 将 db_pool 作为参数传递
        if let Err(e) = crate::search::update_document_index(index, db_pool, &file_path) {
            eprintln!("更新索引和数据库失败: {}", e);
        }
    }
    
    Ok(())
}

#[tauri::command]
pub async fn create_new_file(
    dir_path: String,
    file_name: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let dir = PathBuf::from(&dir_path);
    if !dir.exists() || !dir.is_dir() {
        return Err(format!("目录不存在: {}", dir_path));
    }
    
    let mut file_name_str = file_name;
    if !file_name_str.ends_with(".md") {
        file_name_str.push_str(".md");
    }
    
    let file_path = dir.join(&file_name_str);
    
    if file_path.exists() {
        return Err(format!("文件已存在: {}", file_path.display()));
    }
    
    let initial_content = format!("# {}\n\n", file_name_str.trim_end_matches(".md"));
    fs::write(&file_path, &initial_content)
        .map_err(|e| format!("创建文件失败: {}", e))?;
    
    // 同时获取 index 和 db_pool
    let search_index_lock = state.search_index.lock().unwrap();
    let db_pool_lock = state.db_pool.lock().unwrap();
    if let (Some(index), Some(db_pool)) = (search_index_lock.as_ref(), db_pool_lock.as_ref()) {
        // [修复] 在这里，我们既要更新全文索引，也要写入数据库
        // 我们调用 update_document_index，它现在会处理这两件事
        if let Err(e) = crate::search::update_document_index(index, db_pool, &file_path) {
            eprintln!("为新文件更新索引和数据库失败: {}", e);
        }
    }
    
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn create_new_folder(dir_path: String, folder_name: String) -> Result<String, String> {
    let dir = PathBuf::from(&dir_path);
    if !dir.exists() || !dir.is_dir() {
        return Err(format!("目录不存在: {}", dir_path));
    }
    
    let folder_path = dir.join(&folder_name);
    
    if folder_path.exists() {
        return Err(format!("文件夹已存在: {}", folder_path.display()));
    }
    
    fs::create_dir(&folder_path)
        .map_err(|e| format!("创建文件夹失败: {}", e))?;
    
    Ok(folder_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn delete_item(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let item_path = PathBuf::from(&path);
    
    if !item_path.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    
    if item_path.is_file() {
        if let Some(index) = state.search_index.lock().unwrap().as_ref() {
            if let Err(e) = delete_document(index, &path) {
                eprintln!("从索引中删除文档失败: {}", e);
            }
        }
        
		 // [新增] 在删除文件/目录前，先从数据库删除记录
    if let Some(pool) = state.db_pool.lock().unwrap().as_ref() {
        let conn = pool.get().map_err(|e| e.to_string())?;
        // 使用 LIKE 'path%' 来删除目录下的所有文件记录
        let path_for_db = if item_path.is_dir() {
            format!("{}%", item_path.to_string_lossy())
        } else {
            path.clone()
        };

        // src-tauri/src/commands/fs.rs
		conn.execute(
			"DELETE FROM files WHERE path LIKE ?1",
			params![path_for_db],
		).map_err(|e| e.to_string())?;
    }
        fs::remove_file(&item_path)
            .map_err(|e| format!("删除文件失败: {}", e))?;
    } else {
        if let Some(index) = state.search_index.lock().unwrap().as_ref() {
            delete_directory_from_index(index, &item_path);
        }
        
        fs::remove_dir_all(&item_path)
            .map_err(|e| format!("删除文件夹失败: {}", e))?;
    }
    
    Ok(())
}

fn delete_directory_from_index(index: &tantivy::Index, dir: &Path) {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("md") {
                if let Err(e) = delete_document(index, &path.to_string_lossy()) {
                    eprintln!("删除索引失败: {}", e);
                }
            } else if path.is_dir() {
                delete_directory_from_index(index, &path);
            }
        }
    }
}

#[tauri::command]
pub async fn delete_folder(path: String, state: State<'_, AppState>) -> Result<(), String> {
    delete_item(path, state).await
}