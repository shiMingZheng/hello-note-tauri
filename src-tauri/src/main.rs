#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::sync::{Arc, Mutex};
use tauri::{Builder, Manager};

// 引入模块
mod search;
mod commands;

// ========================================
// 应用状态管理
// ========================================

pub struct AppState {
    search_index: Mutex<Option<Arc<tantivy::Index>>>,
    current_path: Mutex<Option<String>>,
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
			            // 文件系统命令 (更新此列表)
            commands::fs::list_dir_lazy, // <-- 新增
            // commands::fs::list_dir_tree, // <-- 删除此行
            commands::fs::read_file_content,
            commands::fs::save_file,
            commands::fs::create_new_file,
            commands::fs::create_new_folder,
            commands::fs::delete_item,
            commands::fs::delete_folder,
            // 搜索命令
            commands::search::initialize_index_command,
            commands::search::index_files,
            commands::search::search_notes,
            // 工具命令
            commands::utils::parse_markdown
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