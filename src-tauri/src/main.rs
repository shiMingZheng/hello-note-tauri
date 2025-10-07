// src-tauri/src/main.rs
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]
use tauri::{Builder, Manager}; 
use std::sync::{Arc, Mutex};

mod search_core;
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
            // 工作区管理命令
    commands::workspace::check_workspace,
    commands::workspace::initialize_workspace,
    commands::workspace::load_workspace,
    commands::workspace::close_workspace,
    commands::workspace::get_current_workspace,
    
    // 文件系统命令
    commands::fs::list_dir_lazy,
    commands::fs::read_file_content,
    commands::fs::save_file,
    commands::fs::create_new_file,
    commands::fs::create_new_folder,
    commands::fs::delete_item,
    commands::fs::delete_folder,
    commands::fs::rename_item,

    
    // 搜索命令
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
	
	commands::utils::check_indexing_status,  // [新增]
	 commands::sync::sync_workspace, 
    
    // 其他命令
    commands::pins::pin_note,
    commands::pins::unpin_note,
    commands::pins::get_pinned_notes,
    commands::utils::parse_markdown,
    commands::history::record_file_event,
	commands::history::cleanup_invalid_history,
    commands::links::debug_get_all_links,
    commands::links::get_backlinks,
    commands::links::get_graph_data,
    commands::path_utils::migrate_paths_to_relative,
    commands::history::get_history
        ])
        .setup(|app| {
             println!("🚀 CheetahNote 正在启动...");
    println!("📦 已集成 Tantivy 全文搜索引擎");
    println!("🔍 支持中文分词（Jieba）");
    println!("🗃️ 已集成 SQLite 数据库");
    println!("🏢 支持多工作区管理");
    println!("⚠️ 请先选择或创建工作区");
            
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