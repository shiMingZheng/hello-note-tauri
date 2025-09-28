// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{Builder, Manager};

// 应用状态结构
#[derive(Default)]
pub struct AppState {
    // 预留：存储应用级别的状态
    pub notes_cache: std::sync::Mutex<HashMap<String, String>>,
}

// 响应结构体
#[derive(Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub message: String,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            message: "操作成功".to_string(),
        }
    }

    pub fn error(message: String) -> Self {
        Self {
            success: false,
            data: None,
            message,
        }
    }
}

// 问候命令 - Hello World 版本
#[tauri::command]
async fn greet(name: String) -> Result<ApiResponse<String>, String> {
    let response = if name.trim().is_empty() {
        format!("🚀 欢迎使用 CheetahNote - 极速 Markdown 笔记软件!")
    } else {
        format!("👋 你好，{}! 欢迎使用 CheetahNote!", name.trim())
    };
    
    Ok(ApiResponse::success(response))
}

// 获取应用信息命令
#[tauri::command]
async fn get_app_info() -> Result<ApiResponse<HashMap<String, String>>, String> {
    let mut info = HashMap::new();
    info.insert("name".to_string(), "CheetahNote".to_string());
    info.insert("version".to_string(), "0.1.0".to_string());
    info.insert("description".to_string(), "高性能 Markdown 笔记软件".to_string());
    info.insert("memory_usage".to_string(), "< 50MB".to_string());
    info.insert("startup_time".to_string(), "< 500ms".to_string());
    
    Ok(ApiResponse::success(info))
}

// 检查系统资源使用情况
#[tauri::command]
async fn check_performance() -> Result<ApiResponse<HashMap<String, String>>, String> {
    let mut perf = HashMap::new();
    
    // 获取当前进程信息
    let process_id = std::process::id();
    perf.insert("process_id".to_string(), process_id.to_string());
    perf.insert("status".to_string(), "运行中".to_string());
    perf.insert("target".to_string(), "内存 < 50MB, CPU < 1%".to_string());
    
    Ok(ApiResponse::success(perf))
}

// 应用菜单事件处理 (Tauri 2.x 版本)
// 注意：在 Tauri 2.x 中，菜单事件处理方式已更改
// 这里先注释掉，后续版本中根据需要实现
/*
fn handle_menu_event(app: &AppHandle<R>, event: MenuEvent) {
    match event.id.as_ref() {
        "quit" => {
            std::process::exit(0);
        }
        "about" => {
            // 显示关于对话框
            let _ = app.emit_all("show-about", ());
        }
        _ => {}
    }
}
*/

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 构建 Tauri 应用
    Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_app_info,
            check_performance
        ])
        // 注释掉菜单事件处理，在 Tauri 2.x 中需要不同的实现方式
        // .on_menu_event(handle_menu_event)
        .setup(|app| {
            // 应用启动时的初始化逻辑
            println!("🚀 CheetahNote 正在启动...");
            
            // 在 Tauri 2.x 中使用 get_webview_window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("CheetahNote - 极速 Markdown 笔记");
            }
            
            // 预留：初始化数据库、文件系统监控等
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}