// src-tauri/src/commands/workspace.rs
// CheetahNote - 工作区管理模块

use crate::database::init_database;
use crate::search_core;
use crate::AppState;
use std::fs;
use std::path::Path;
use tauri::{command, State};
use serde::Serialize;

/// 工作区元数据目录名称
const WORKSPACE_META_DIR: &str = ".cheetah-note";

#[derive(Debug, Serialize)]
pub struct WorkspaceInfo {
    pub path: String,
    pub exists: bool,
    pub is_initialized: bool,
}

/// 检查指定路径是否为有效的工作区
#[command]
pub async fn check_workspace(workspace_path: String) -> Result<WorkspaceInfo, String> {
    let path = Path::new(&workspace_path);
    
    if !path.exists() {
        return Err(format!("路径不存在: {}", workspace_path));
    }
    
    if !path.is_dir() {
        return Err(format!("路径不是目录: {}", workspace_path));
    }
    
    let meta_dir = path.join(WORKSPACE_META_DIR);
    let is_initialized = meta_dir.exists() 
        && meta_dir.join("metadata.sqlite").exists()
        && meta_dir.join(".cheetah_index").exists();
    
    Ok(WorkspaceInfo {
        path: workspace_path,
        exists: true,
        is_initialized,
    })
}

/// 初始化工作区（创建必要的目录和文件）
#[command]
pub async fn initialize_workspace(
    workspace_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    println!("🚀 开始初始化工作区: {}", workspace_path);
    
    let path = Path::new(&workspace_path);
    
    // 验证路径
    if !path.exists() || !path.is_dir() {
        return Err("无效的工作区路径".to_string());
    }
    
    // 创建元数据目录
    let meta_dir = path.join(WORKSPACE_META_DIR);
    if !meta_dir.exists() {
        fs::create_dir_all(&meta_dir)
            .map_err(|e| format!("创建元数据目录失败: {}", e))?;
        println!("✅ 创建元数据目录: {}", meta_dir.display());
    }
    
    // 初始化数据库
    println!("📦 初始化数据库...");
    let db_pool = init_database(&meta_dir)
        .map_err(|e| format!("初始化数据库失败: {}", e))?;
    
    // 初始化搜索索引
    println!("🔍 初始化搜索索引...");
    let index_dir = meta_dir.join(".cheetah_index");
    let index = search_core::initialize_index(&index_dir)
        .map_err(|e| format!("初始化搜索索引失败: {}", e))?;
    
    // 更新应用状态
    *state.db_pool.lock().unwrap() = Some(db_pool);
    *state.search_index.lock().unwrap() = Some(index);
    *state.current_path.lock().unwrap() = Some(workspace_path.clone());
    
    println!("✅ 工作区初始化完成");
    Ok(workspace_path)
}

/// 加载现有工作区
#[command]
pub async fn load_workspace(
    workspace_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    println!("📂 加载工作区: {}", workspace_path);
    
    let path = Path::new(&workspace_path);
    let meta_dir = path.join(WORKSPACE_META_DIR);
    
    // 验证工作区
    if !meta_dir.exists() {
        return Err("工作区未初始化，请先初始化".to_string());
    }
    
    let db_path = meta_dir.join("metadata.sqlite");
    if !db_path.exists() {
        return Err("数据库文件不存在".to_string());
    }
    
    // 加载数据库
    println!("📦 加载数据库...");
    let db_pool = init_database(&meta_dir)
        .map_err(|e| format!("加载数据库失败: {}", e))?;
    
    // 加载搜索索引
    println!("🔍 加载搜索索引...");
    let index_dir = meta_dir.join(".cheetah_index");
    let index = search_core::initialize_index(&index_dir)
        .map_err(|e| format!("加载搜索索引失败: {}", e))?;
    
    // 更新应用状态
    *state.db_pool.lock().unwrap() = Some(db_pool);
    *state.search_index.lock().unwrap() = Some(index);
    *state.current_path.lock().unwrap() = Some(workspace_path.clone());
    
    println!("✅ 工作区加载完成");
    Ok(workspace_path)
}

/// 关闭当前工作区
#[command]
pub async fn close_workspace(state: State<'_, AppState>) -> Result<(), String> {
    println!("🔒 关闭当前工作区");
    
    // 清理应用状态
    *state.db_pool.lock().unwrap() = None;
    *state.search_index.lock().unwrap() = None;
    *state.current_path.lock().unwrap() = None;
    
    println!("✅ 工作区已关闭");
    Ok(())
}

/// 获取当前工作区路径
#[command]
pub async fn get_current_workspace(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let current_path = state.current_path.lock().unwrap();
    Ok(current_path.clone())
}