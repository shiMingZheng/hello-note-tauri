// src-tauri/src/commands/search.rs

use crate::{search, AppState};
use std::path::Path;
use tauri::{command, State};

#[command]
pub async fn initialize_index_command(root_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let index = search::initialize_index(Path::new(&root_path)).map_err(|e| e.to_string())?;
    *state.search_index.lock().unwrap() = Some(index);
    Ok(())
}

#[command]
pub async fn index_files(root_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let search_index_lock = state.search_index.lock().unwrap();
    let db_pool_lock = state.db_pool.lock().unwrap();
    if let (Some(index), Some(db_pool)) = (search_index_lock.as_ref(), db_pool_lock.as_ref()) {
        search::index_documents(index, db_pool, Path::new(&root_path)).map_err(|e| e.to_string())?;
    } else {
        return Err("索引或数据库未初始化".to_string());
    }
    Ok(())
}

#[command]
pub async fn search_notes(query: String, state: State<'_, AppState>) -> Result<Vec<search::SearchResult>, String> {
    let search_index_lock = state.search_index.lock().unwrap();
    if let Some(index) = search_index_lock.as_ref() {
        search::search(index, &query).map_err(|e| e.to_string())
    } else {
        Err("索引未初始化".to_string())
    }
}

#[command]
pub async fn ensure_index_is_loaded(
    root_path: String,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let mut search_index_lock = state.search_index.lock().unwrap();
    if search_index_lock.is_some() {
        return Ok(true);
    }

    println!("索引未加载，正在初始化...");
    let index =
        search::initialize_index(Path::new(&root_path)).map_err(|e| format!("初始化索引失败: {}", e))?;
    *search_index_lock = Some(index);

    // ▼▼▼【核心修改】从这里开始 ▼▼▼

    // 在 spawn 外部提取出 Arc 和 Pool 的克隆
    let index_clone = state.search_index.lock().unwrap().as_ref().cloned();
    let db_pool_clone = state.db_pool.lock().unwrap().as_ref().cloned();
    let root_path_clone = root_path.clone();

    // 将 'static 的克隆副本移入后台任务
    tokio::spawn(async move {
        if let (Some(index), Some(db_pool)) = (index_clone, db_pool_clone) {
            println!("后台开始全量索引...");
            if let Err(e) = search::index_documents(&index, &db_pool, Path::new(&root_path_clone))
            {
                eprintln!("后台全量索引失败: {}", e);
            } else {
                println!("后台全量索引完成。");
            }
        } else {
            eprintln!("后台索引任务启动失败：索引或数据库未初始化。");
        }
    });
    // ▲▲▲【核心修改】到这里结束 ▲▲▲

    Ok(true)
}

#[command]
pub async fn release_index(state: State<'_, AppState>) -> Result<(), String> {
    *state.search_index.lock().unwrap() = None;
    println!("索引已释放。");
    Ok(())
}