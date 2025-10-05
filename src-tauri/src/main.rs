// src-tauri/src/main.rs
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::sync::{Arc, Mutex};
use tauri::{Builder, Manager, State};

// ▼▼▼【核心修改】在这里 ▼▼▼
mod search_core; // 将 `mod search;` 修改为 `mod search_core;`
mod commands;
mod database;

use crate::database::DbPool;

pub struct AppState {
    search_index: Mutex<Option<Arc<tantivy::Index>>>,
    current_path: Mutex<Option<String>>,
    db_pool: Mutex<Option<DbPool>>,
}

pub fn run() {
    Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            search_index: Mutex::new(None),
            current_path: Mutex::new(None),
            db_pool: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            // 文件系统命令
            commands::fs::list_dir_lazy,
            commands::fs::read_file_content,
            commands::fs::save_file,
            commands::fs::create_new_file,
            commands::fs::create_new_folder,
            commands::fs::delete_item,
            commands::fs::delete_folder,
            // 搜索命令 (保持不变)
            commands::search::initialize_index_command,
            commands::search::index_files,
            commands::search::search_notes,
            commands::search::ensure_index_is_loaded,
            commands::search::release_index,
            // 标签管理命令
            commands::tags::add_tag_to_file,
            commands::tags::remove_tag_from_file,
            commands::tags::get_tags_for_file,
            commands::tags::get_all_tags,
            commands::tags::get_files_by_tag,
            // 其他命令
            commands::pins::pin_note,
            commands::pins::unpin_note,
            commands::pins::get_pinned_notes,
            commands::utils::parse_markdown,
            commands::history::record_file_event,
            commands::links::debug_get_all_links,
            commands::links::get_backlinks,
            commands::links::get_graph_data,
            commands::path_utils::migrate_paths_to_relative,
            commands::history::get_history
        ])
        .setup(|app| {
            println!("🚀 CheetahNote 正在启动...");
            let handle = app.handle();
            let app_state: State<AppState> = handle.state();
            let app_data_dir = handle.path().app_data_dir().expect("获取应用数据目录失败");
            
            let db_pool = database::init_database(&app_data_dir)
                .expect("数据库初始化失败");
            
            *app_state.db_pool.lock().unwrap() = Some(db_pool);
            println!("📦 已集成 Tantivy 全文搜索引擎");
            println!("🔍 支持中文分词（Jieba）");
            println!("🗃️ 已集成 SQLite 数据库");
            
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