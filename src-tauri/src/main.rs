#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use pulldown_cmark::{html, Parser};
use serde::Serialize;
use tauri::{Builder, Manager, State};

// 引入搜索模块
mod search;
use search::{initialize_index, index_documents, delete_document, search as search_notes_impl, update_document_index};

// ========================================
// 应用状态管理
// ========================================

struct AppState {
    search_index: Mutex<Option<Arc<tantivy::Index>>>,
    current_path: Mutex<Option<String>>,
}

// ========================================
// 数据结构定义
// ========================================

#[derive(Debug, Serialize)]
struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileNode>>,
}

// ========================================
// 文件系统命令
// ========================================

#[tauri::command]
async fn list_dir_tree(path: String) -> Result<Vec<FileNode>, String> {
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
        
        // 跳过隐藏文件和目录
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
            // 只包含 Markdown 文件
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
    
    // 按名称排序（目录优先）
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
async fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("读取文件失败: {}", e))
}

// ========================================
// 文件操作命令
// ========================================

#[tauri::command]
async fn save_file(
    path: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // 保存文件
    fs::write(&path, &content)
        .map_err(|e| format!("保存文件失败: {}", e))?;
    
    // 更新搜索索引
    if let Some(index) = state.search_index.lock().unwrap().as_ref() {
        let file_path = PathBuf::from(&path);
        if let Err(e) = update_document_index(index, &file_path) {
            eprintln!("更新索引失败: {}", e);
        }
    }
    
    Ok(())
}

#[tauri::command]
async fn create_new_file(
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
    
    // 创建文件并写入初始内容
    let initial_content = format!("# {}\n\n", file_name.trim_end_matches(".md"));
    fs::write(&file_path, &initial_content)
        .map_err(|e| format!("创建文件失败: {}", e))?;
    
    // 更新搜索索引
    if let Some(index) = state.search_index.lock().unwrap().as_ref() {
        if let Err(e) = update_document_index(index, &file_path) {
            eprintln!("更新索引失败: {}", e);
        }
    }
    
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn create_new_folder(dir_path: String, folder_name: String) -> Result<String, String> {
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
async fn delete_item(path: String, state: State<'_, AppState>) -> Result<(), String> {
    let item_path = PathBuf::from(&path);
    
    if !item_path.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    
    // 如果是文件，先从索引中删除
    if item_path.is_file() {
        if let Some(index) = state.search_index.lock().unwrap().as_ref() {
            if let Err(e) = delete_document(index, &path) {
                eprintln!("从索引中删除文档失败: {}", e);
            }
        }
        
        fs::remove_file(&item_path)
            .map_err(|e| format!("删除文件失败: {}", e))?;
    } else {
        // 如果是目录，需要先删除其中所有文件的索引
        if let Some(index) = state.search_index.lock().unwrap().as_ref() {
            delete_directory_from_index(index, &item_path);
        }
        
        fs::remove_dir_all(&item_path)
            .map_err(|e| format!("删除文件夹失败: {}", e))?;
    }
    
    Ok(())
}

/// 递归删除目录中所有文件的索引
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
async fn delete_folder(path: String, state: State<'_, AppState>) -> Result<(), String> {
    delete_item(path, state).await
}

// ========================================
// 搜索相关命令
// ========================================

#[tauri::command]
async fn initialize_index_command(
    base_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let path = PathBuf::from(&base_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!("路径不存在或不是目录: {}", base_path));
    }
    
    // 初始化 Tantivy 索引
    match initialize_index(&path) {
        Ok(index) => {
            *state.search_index.lock().unwrap() = Some(index);
            *state.current_path.lock().unwrap() = Some(base_path.clone());
            println!("✅ Tantivy 索引已初始化");
            Ok(())
        }
        Err(e) => Err(format!("初始化索引失败: {}", e))
    }
}

#[tauri::command]
async fn index_files(base_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let path = PathBuf::from(&base_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!("路径不存在或不是目录: {}", base_path));
    }
    
    // 获取索引实例
    let index = state.search_index.lock().unwrap();
    if let Some(index) = index.as_ref() {
        match index_documents(index, &path) {
            Ok(()) => {
                *state.current_path.lock().unwrap() = Some(base_path);
                Ok(())
            }
            Err(e) => Err(format!("索引文件失败: {}", e))
        }
    } else {
        Err("索引尚未初始化，请先调用 initialize_index_command".to_string())
    }
}

#[tauri::command]
async fn search_notes(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<search::SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    
    let index = state.search_index.lock().unwrap();
    if let Some(index) = index.as_ref() {
        match search_notes_impl(index, &query) {
            Ok(results) => Ok(results),
            Err(e) => Err(format!("搜索失败: {}", e))
        }
    } else {
        Err("索引尚未初始化".to_string())
    }
}

// ========================================
// Markdown 处理命令
// ========================================

#[tauri::command]
async fn parse_markdown(content: String) -> Result<String, String> {
    let parser = Parser::new(&content);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    Ok(html_output)
}

// ========================================
// 应用入口
// ========================================

pub fn run() {
    Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            search_index: Mutex::new(None),
            current_path: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            list_dir_tree,
            read_file_content,
            parse_markdown,
            save_file,
            create_new_file,
            create_new_folder,
            delete_item,
            delete_folder,
            initialize_index_command,
            index_files,
            search_notes
        ])
        .setup(|app| {
            println!("🚀 CheetahNote 正在启动...");
            println!("📦 已集成 Tantivy 全文搜索引擎");
            println!("🔍 支持中文分词（Jieba）");
            
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("CheetahNote - 极速笔记");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用时出错");
}

fn main() {
    run();
}