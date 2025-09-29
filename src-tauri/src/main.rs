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
    pub level: usize,  // 新增：目录层级
    pub is_expanded: bool,  // 新增：是否展开
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
            level: 0,  // 顶层目录
            is_expanded: false,
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

// 递归列出目录树（带层级信息）
#[tauri::command]
async fn list_dir_tree(path: String, max_depth: Option<usize>) -> Result<Vec<FileInfo>, String> {
    let dir_path = PathBuf::from(&path);
    
    if !dir_path.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    
    if !dir_path.is_dir() {
        return Err(format!("路径不是目录: {}", path));
    }
    
    let max = max_depth.unwrap_or(10); // 默认最大深度10层
    let mut result = Vec::new();
    
    fn scan_directory(
        dir_path: &PathBuf,
        level: usize,
        max_depth: usize,
        result: &mut Vec<FileInfo>
    ) -> Result<(), String> {
        if level >= max_depth {
            return Ok(());
        }
        
        let entries = fs::read_dir(dir_path)
            .map_err(|e| format!("读取目录失败: {}", e))?;
        
        let mut items = Vec::new();
        
        for entry in entries {
            let entry = entry.map_err(|e| format!("读取条目失败: {}", e))?;
            let metadata = entry.metadata()
                .map_err(|e| format!("读取元数据失败: {}", e))?;
            
            let file_name = entry.file_name().to_string_lossy().to_string();
            let file_path = entry.path().to_string_lossy().to_string();
            let is_dir = metadata.is_dir();
            
            items.push((file_name, file_path, is_dir));
        }
        
        // 排序：文件夹优先
        items.sort_by(|a, b| {
            match (a.2, b.2) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.0.to_lowercase().cmp(&b.0.to_lowercase()),
            }
        });
        
        // 添加到结果并递归处理子目录
        for (name, path, is_dir) in items {
            result.push(FileInfo {
                name: name.clone(),
                path: path.clone(),
                is_dir,
                level,
                is_expanded: is_dir,
            });
            
            if is_dir {
                let sub_path = PathBuf::from(&path);
                let _ = scan_directory(&sub_path, level + 1, max_depth, result);
            }
        }
        
        Ok(())
    }
    
    scan_directory(&dir_path, 0, max, &mut result)?;
    
    Ok(result)
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

// 获取父目录 - 新增命令
#[tauri::command]
async fn get_parent_directory(path: String) -> Result<String, String> {
    let current_path = PathBuf::from(&path);
    
    // 尝试获取父目录
    match current_path.parent() {
        Some(parent) => {
            let parent_str = parent.to_string_lossy().to_string();
            // 如果父路径为空（到达根目录），返回原路径
            if parent_str.is_empty() {
                Ok(path)
            } else {
                Ok(parent_str)
            }
        },
        None => Ok(path) // 已经是根目录，返回原路径
    }
}

// 创建新文件
#[tauri::command]
async fn create_new_file(dir_path: String, file_name: String) -> Result<String, String> {
    let dir = PathBuf::from(&dir_path);
    
    // 确保目录存在
    if !dir.exists() || !dir.is_dir() {
        return Err(format!("目标目录不存在: {}", dir_path));
    }
    
    // 构建完整文件路径
    let file_path = dir.join(&file_name);
    
    // 检查文件是否已存在
    if file_path.exists() {
        return Err(format!("文件已存在: {}", file_name));
    }
    
    // 创建文件
    fs::File::create(&file_path)
        .map_err(|e| format!("创建文件失败: {}", e))?;
    
    Ok(file_path.to_string_lossy().to_string())
}

// 创建新文件夹
#[tauri::command]
async fn create_new_folder(parent_path: String, folder_name: String) -> Result<String, String> {
    let parent = PathBuf::from(&parent_path);
    
    // 确保父目录存在
    if !parent.exists() || !parent.is_dir() {
        return Err(format!("父目录不存在: {}", parent_path));
    }
    
    // 构建完整文件夹路径
    let folder_path = parent.join(&folder_name);
    
    // 检查文件夹是否已存在
    if folder_path.exists() {
        return Err(format!("文件夹已存在: {}", folder_name));
    }
    
    // 创建文件夹
    fs::create_dir(&folder_path)
        .map_err(|e| format!("创建文件夹失败: {}", e))?;
    
    Ok(folder_path.to_string_lossy().to_string())
}

// 删除项目（文件）
#[tauri::command]
async fn delete_item(path: String) -> Result<(), String> {
    let item_path = PathBuf::from(&path);
    
    // 验证路径存在
    if !item_path.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    
    // 只处理文件删除
    if item_path.is_file() {
        fs::remove_file(&item_path)
            .map_err(|e| format!("删除文件失败: {}", e))?;
        Ok(())
    } else {
        Err("当前只支持删除文件，不支持删除文件夹".to_string())
    }
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
            list_dir_tree,
            read_file_content,
            get_parent_directory,
            create_new_file,
            create_new_folder,
            delete_item
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