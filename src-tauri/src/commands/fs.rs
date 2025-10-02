//文件交互 src/commands/fs.rs

use std::fs;
use std::path::{Path, PathBuf};
use serde::Serialize;
use tauri::State;
use crate::search::{delete_document, update_document_index};
use crate::AppState;

// ========================================
// 数据结构定义
// ========================================

#[derive(Debug, Serialize)]
pub struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileNode>>,
}

// ========================================
// 文件系统命令
// ========================================

#[tauri::command]
pub async fn list_dir_tree(path: String) -> Result<Vec<FileNode>, String> {
    let base_path = PathBuf::from(&path);
    if !base_path.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    if !base_path.is_dir() {
        return Err(format!("路径不是目录: {}", path));
    }
    
    read_dir_recursive(&base_path)
        .map_err(|e| format!("读取目录失败: {}", e))
}

fn read_dir_recursive(dir: &Path) -> Result<Vec<FileNode>, std::io::Error> {
    let mut nodes = Vec::new();
    let entries = fs::read_dir(dir)?;
    
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        let metadata = entry.metadata()?;
        
        if let Some(name) = entry.file_name().to_str() {
            if name.starts_with('.') {
                continue;
            }
        }
        
        let node = if metadata.is_dir() {
            FileNode {
                name: entry.file_name().to_string_lossy().to_string(),
                path: path.to_string_lossy().to_string(),
                is_dir: true,
                children: Some(read_dir_recursive(&path)?),
            }
        } else {
            if path.extension().and_then(|s| s.to_str()) == Some("md") {
                FileNode {
                    name: entry.file_name().to_string_lossy().to_string(),
                    path: path.to_string_lossy().to_string(),
                    is_dir: false,
                    children: None,
                }
            } else {
                continue;
            }
        };
        
        nodes.push(node);
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
// 文件操作命令
// ========================================

#[tauri::command]
pub async fn save_file(
    path: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    fs::write(&path, &content)
        .map_err(|e| format!("保存文件失败: {}", e))?;
    
    if let Some(index) = state.search_index.lock().unwrap().as_ref() {
        let file_path = PathBuf::from(&path);
        if let Err(e) = update_document_index(index, &file_path) {
            eprintln!("更新索引失败: {}", e);
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
    
    let mut file_name = file_name;
    if !file_name.ends_with(".md") {
        file_name.push_str(".md");
    }
    
    let file_path = dir.join(&file_name);
    
    if file_path.exists() {
        return Err(format!("文件已存在: {}", file_path.display()));
    }
    
    let initial_content = format!("# {}\n\n", file_name.trim_end_matches(".md"));
    fs::write(&file_path, &initial_content)
        .map_err(|e| format!("创建文件失败: {}", e))?;
    
    if let Some(index) = state.search_index.lock().unwrap().as_ref() {
        if let Err(e) = update_document_index(index, &file_path) {
            eprintln!("更新索引失败: {}", e);
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