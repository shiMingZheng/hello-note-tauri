//这个文件将包含与 Tantivy 搜索功能桥接的命令。 src/commands/search.rs

use std::path::PathBuf;
use tauri::State;
use crate::search::{self, initialize_index, index_documents, search as search_notes_impl};
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

#[tauri::command]
pub async fn index_files(base_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let path = PathBuf::from(&base_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!("路径不存在或不是目录: {}", base_path));
    }
    
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