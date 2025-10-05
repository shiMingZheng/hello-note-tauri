// src-tauri/src/commands/search.rs
// ▼▼▼【核心修改】在这里 ▼▼▼
use crate::{search_core, AppState}; // 将 `search` 修改为 `search_core`
use std::path::Path;
use tauri::{command, State};

#[command]
pub async fn initialize_index_command(root_path: String, state: State<'_, AppState>) -> Result<(), String> {
    // 将 `search::` 修改为 `search_core::`
    let index = search_core::initialize_index(Path::new(&root_path)).map_err(|e| e.to_string())?;
    *state.search_index.lock().unwrap() = Some(index);
    Ok(())
}

#[command]
pub async fn index_files(root_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let search_index_lock = state.search_index.lock().unwrap();
    let db_pool_lock = state.db_pool.lock().unwrap();
    if let (Some(index), Some(db_pool)) = (search_index_lock.as_ref(), db_pool_lock.as_ref()) {
        // 将 `search::` 修改为 `search_core::`
        search_core::index_documents(index, db_pool, Path::new(&root_path)).map_err(|e| e.to_string())?;
    } else {
        return Err("索引或数据库未初始化".to_string());
    }
    Ok(())
}

#[command]
pub async fn search_notes(query: String, state: State<'_, AppState>) -> Result<Vec<search_core::SearchResult>, String> {
    let search_index_lock = state.search_index.lock().unwrap();
    if let Some(index) = search_index_lock.as_ref() {
        // 将 `search::` 修改为 `search_core::`
        search_core::search(index, &query).map_err(|e| e.to_string())
    } else {
        Err("索引未初始化".to_string())
    }
}

#[command]
pub async fn ensure_index_is_loaded(root_path: String, state: State<'_, AppState>) -> Result<bool, String> {
    let mut search_index_lock = state.search_index.lock().unwrap();
    if search_index_lock.is_some() {
        return Ok(true);
    }
    
    println!("索引未加载，正在初始化...");
    // 将 `search::` 修改为 `search_core::`
    let index = search_core::initialize_index(Path::new(&root_path))
        .map_err(|e| format!("初始化索引失败: {}", e))?;
    *search_index_lock = Some(index);
    
    let index_clone = state.search_index.lock().unwrap().as_ref().cloned();
    let db_pool_clone = state.db_pool.lock().unwrap().as_ref().cloned();
    let root_path_clone = root_path.clone();

    tokio::spawn(async move {
        if let (Some(index), Some(db_pool)) = (index_clone, db_pool_clone) {
            println!("后台开始全量索引...");
            // 将 `search::` 修改为 `search_core::`
            if let Err(e) = search_core::index_documents(&index, &db_pool, Path::new(&root_path_clone))
            {
                eprintln!("后台全量索引失败: {}", e);
            } else {
                println!("后台全量索引完成。");
            }
        } else {
            eprintln!("后台索引任务启动失败：索引或数据库未初始化。");
        }
    });

    Ok(true)
}

#[command]
pub async fn release_index(state: State<'_, AppState>) -> Result<(), String> {
    *state.search_index.lock().unwrap() = None;
    println!("索引已释放。");
    Ok(())
}