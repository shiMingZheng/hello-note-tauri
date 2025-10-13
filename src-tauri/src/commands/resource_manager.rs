// 新文件：src-tauri/src/commands/resource_manager.rs
// Rust 端资源管理

use crate::AppState;
use tauri::{command, State};

/// 最小化资源占用
#[command]
pub async fn minimize_resources(state: State<'_, AppState>) -> Result<(), String> {
    println!("💤 [Rust] 最小化资源占用...");
    
    // 1. 释放搜索索引
    {
        let mut search_index_lock = state.search_index.lock().unwrap();
        *search_index_lock = None;
        println!("  ✅ 搜索索引已释放");
    }
    
    // 2. 缩减数据库连接池（保留 1 个连接）
    // {
    //     let db_pool_lock = state.db_pool.lock().unwrap();
    //     if let Some(pool) = db_pool_lock.as_ref() {
    //         // r2d2 连接池会自动管理，这里只是记录
    //         println!("  ℹ️ 数据库连接池保持最小配置");
    //     }
    // }
    
    // 3. 【可选】手动触发垃圾回收（如果可用）
    // Rust 的垃圾回收是自动的，这里仅作记录
    println!("✅ [Rust] 资源最小化完成");
    
    Ok(())
}

/// 恢复资源
#[command]
pub async fn restore_resources(state: State<'_, AppState>) -> Result<(), String> {
    println!("🔄 [Rust] 恢复资源...");
    
    // 资源会在需要时自动加载（懒加载模式）
    // 这里只是一个占位函数
    
    println!("✅ [Rust] 资源恢复完成（按需加载）");
    Ok(())
}