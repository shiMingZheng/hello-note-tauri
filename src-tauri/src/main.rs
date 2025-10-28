// src-tauri/src/main.rs
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]
use tauri::{Builder, Manager}; 
use std::sync::{Arc, Mutex};

mod file_watcher;
mod search_core;
mod commands;
mod database;
mod indexing_jobs; // [新增] 导入索引任务模块

use crate::database::DbPool;
use crate::indexing_jobs::ControlSignal; // [新增]

pub struct AppState {
    search_index: Mutex<Option<Arc<tantivy::Index>>>,
    current_path: Mutex<Option<String>>,
    db_pool: Mutex<Option<DbPool>>,
    worker_handle: Mutex<Option<std::thread::JoinHandle<()>>>, // [新增] Worker线程句柄
}

pub fn run() {
    Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            search_index: Mutex::new(None),
            current_path: Mutex::new(None),
            db_pool: Mutex::new(None),
            worker_handle: Mutex::new(None), // [新增]
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
            
            commands::utils::check_indexing_status,
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
            commands::history::get_history,
			commands::pins::favorite_note,      // ✅ 新增
			commands::pins::unfavorite_note,    // ✅ 新增
			commands::pins::get_favorited_notes,// ✅ 新增
			commands::pins::is_favorited,      // ✅ 新增
			commands::pins::is_pinned
        ])
        .setup(|app| {
            println!("🚀 CheetahNote 正在启动...");
            println!("📦 已集成 Tantivy 全文搜索引擎");
            println!("🔍 支持中文分词（Jieba）");
            println!("🗃️ 已集成 SQLite 数据库");
            println!("🏢 支持多工作区管理");
            println!("🔄 异步索引队列已就绪"); // [新增]
            println!("⚠️ 请先选择或创建工作区");
			
			   // ⭐ 添加这段代码 - 强制打开开发者工具
			#[cfg(debug_assertions)]
			{
				let window = app.get_webview_window("main").unwrap();
				window.open_devtools();
			}
            
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("CheetahNote - 极速笔记");
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("运行 Tauri 应用时出错")
        .run(|app_handle, event| { // [修复] 这里只调用一次 run
            // [新增] 优雅关闭处理
            if let tauri::RunEvent::ExitRequested { .. } = event {
                println!("🛑 应用正在关闭...");
                
                // 发送关闭信号给Worker
                let sender = indexing_jobs::JOB_CHANNEL.0.clone();
                if let Err(e) = sender.send(ControlSignal::Shutdown) {
                    eprintln!("⚠️ 发送Worker关闭信号失败: {}", e);
                }
                
                // 等待Worker线程结束
                if let Some(state) = app_handle.try_state::<AppState>() {
                    if let Ok(mut handle_lock) = state.worker_handle.lock() {
                        if let Some(handle) = handle_lock.take() {
                            println!("⏳ 等待索引Worker完成当前任务...");
                            if let Err(e) = handle.join() {
                                eprintln!("⚠️ Worker线程退出异常: {:?}", e);
                            } else {
                                println!("✅ 索引Worker已安全退出");
                            }
                        }
                    }
                }
                
                println!("👋 CheetahNote 已关闭");
            }
        });
}

fn main() {
    run();
}