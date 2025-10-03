//这个文件将包含与 Tantivy 搜索功能桥接的命令。 src/commands/search.rs

use std::path::{Path, PathBuf};
use tauri::State;
// [修复] `index_documents` 不再直接调用，而是通过 `index_files` 命令触发
use crate::search::{self, initialize_index, search as search_notes_impl}; 
use crate::AppState;

#[tauri::command]
pub async fn initialize_index_command(
    base_path: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let path = PathBuf::from(&base_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!("路径不存在或不是目录: {}", base_path));
    }
    
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

// src-tauri/src/commands/search.rs

#[tauri::command]
pub async fn index_files(base_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let path = PathBuf::from(&base_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!("路径不存在或不是目录: {}", base_path));
    }
    
    let index_lock = state.search_index.lock().unwrap();
    let db_pool_lock = state.db_pool.lock().unwrap();

    // [修复] 这是正确的逻辑，它调用 crate::search::index_documents
    if let (Some(index), Some(db_pool)) = (index_lock.as_ref(), db_pool_lock.as_ref()) {
        match crate::search::index_documents(index, db_pool, &path) {
            Ok(()) => {
                *state.current_path.lock().unwrap() = Some(base_path);
                Ok(())
            }
            Err(e) => Err(format!("索引文件和同步数据库失败: {}", e))
        }
    } else {
        Err("索引或数据库尚未初始化".to_string())
    }
}

// ... (其余函数保持不变) ...

#[tauri::command]
pub async fn search_notes(
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

// ... (文件顶部的 use 语句和现有函数保持不变) ...

// [新增] 确保索引已加载到内存
#[tauri::command]
pub async fn ensure_index_is_loaded(state: State<'_, AppState>) -> Result<(), String> {
    let mut search_index = state.search_index.lock().unwrap();
    if search_index.is_none() {
        println!("🔍 索引未加载，正在从磁盘加载...");
        let current_path_str = state.current_path.lock().unwrap()
            .clone()
            .ok_or_else(|| "当前文件夹路径未设置".to_string())?;
        
        let base_path = Path::new(&current_path_str);
        match crate::search::initialize_index(base_path) {
            Ok(index) => {
                *search_index = Some(index);
                println!("✅ 索引加载成功");
            }
            Err(e) => {
                let err_msg = format!("加载索引失败: {}", e);
                eprintln!("{}", err_msg);
                return Err(err_msg);
            }
        }
    }
    Ok(())
}

// [新增] 从内存中释放索引
#[tauri::command]
pub async fn release_index(state: State<'_, AppState>) -> Result<(), String> {
    let mut search_index = state.search_index.lock().unwrap();
    if search_index.is_some() {
        *search_index = None;
        println!("🌙 索引已从内存中释放");
    }
    Ok(())
}

// ... (文件末尾的 extract_title_from_content 函数保持不变) ...