// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::{Builder, Manager};

// 应用状态结构
#[derive(Default)]
pub struct AppState {
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

// 文件信息结构
#[derive(Serialize, Deserialize, Clone)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

// 问候命令
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
    
    let process_id = std::process::id();
    perf.insert("process_id".to_string(), process_id.to_string());
    perf.insert("status".to_string(), "运行中".to_string());
    perf.insert("target".to_string(), "内存 < 50MB, CPU < 1%".to_string());
    
    Ok(ApiResponse::success(perf))
}

// 列出目录内容
#[tauri::command]
async fn list_dir_contents(path: String) -> Result<Vec<FileInfo>, String> {
    let dir_path = PathBuf::from(&path);
    
    if !dir_path.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    
    if !dir_path.is_dir() {
        return Err(format!("路径不是目录: {}", path));
    }
    
    let entries = fs::read_dir(&dir_path)
        .map_err(|e| format!("读取目录失败: {}", e))?;
    
    let mut files = Vec::new();
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
        let metadata = entry.metadata()
            .map_err(|e| format!("读取元数据失败: {}", e))?;
        
        let file_name = entry.file_name()
            .to_string_lossy()
            .to_string();
        
        let file_path = entry.path()
            .to_string_lossy()
            .to_string();
        
        files.push(FileInfo {
            name: file_name,
            path: file_path,
            is_dir: metadata.is_dir(),
        });
    }
    
    // 按文件夹优先、名称排序
    files.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });
    
    Ok(files)
}

// 读取文件内容 - 新增命令
#[tauri::command]
async fn read_file_content(path: String) -> Result<String, String> {
    let file_path = PathBuf::from(&path);
    
    // 验证路径存在
    if !file_path.exists() {
        return Err(format!("文件不存在: {}", path));
    }
    
    // 验证是文件而不是目录
    if file_path.is_dir() {
        return Err(format!("路径是目录，不是文件: {}", path));
    }
    
    // 读取文件内容
    fs::read_to_string(&file_path)
        .map_err(|e| format!("读取文件失败: {}. 错误: {}", path, e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())  // 添加 dialog 插件
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_app_info,
            check_performance,
            list_dir_contents,
            read_file_content  // 注册新命令
        ])
        .setup(|app| {
            println!("🚀 CheetahNote 正在启动...");
            
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("CheetahNote - 极速 Markdown 笔记");
            }
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}