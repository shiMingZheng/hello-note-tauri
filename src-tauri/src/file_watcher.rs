// src-tauri/src/file_watcher.rs
// CheetahNote 外部文件监控系统 (已重构)

use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher, EventKind};
use std::path::{Path, PathBuf};
use std::sync::mpsc::channel;
use std::time::Duration;
use crate::indexing_jobs;
use tauri::{AppHandle, Emitter};
use once_cell::sync::Lazy;
use std::sync::Mutex;
use crate::indexing_jobs::{SAVE_TRACKER, WatchedFileMetadata, DB_POOL_REF};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use anyhow::Result;
use rusqlite::{params, Connection, OptionalExtension};
use crate::commands::path_utils::to_relative_path;
use crate::database::DbPool;
use serde_json::json;

// 获取当前时间的时:分:秒格式
fn get_time_string() -> String {
    use chrono::{Local, Timelike};
    let now = Local::now();
    format!("{:02}:{:02}:{:02}.{:03}", now.hour(), now.minute(), now.second(), now.nanosecond() / 1_000_000)
}

// 带时间戳的日志宏
macro_rules! log_with_time {
    ($($arg:tt)*) => {
        println!("[{}] {}", get_time_string(), format!($($arg)*))
    };
}

// 使用全局静态变量保存 watcher
static WATCHER: Lazy<Mutex<Option<RecommendedWatcher>>> = Lazy::new(|| Mutex::new(None));

pub fn start_file_watcher(
    workspace_path: String,
    app_handle: Option<AppHandle>
) -> notify::Result<()> {
    log_with_time!("👀 [文件监听] 正在启动,监控路径: {}", workspace_path);
    
    let (tx, rx) = channel();
    let mut watcher = RecommendedWatcher::new(
        tx,
        Config::default().with_poll_interval(Duration::from_secs(2))
    )?;
    watcher.watch(Path::new(&workspace_path), RecursiveMode::Recursive)?;
    
    *WATCHER.lock().unwrap() = Some(watcher);
    
    // ★★★ 核心修改: 必须克隆 DB 连接池并移入线程 ★★★
    let db_pool = match DB_POOL_REF.lock().unwrap().clone() {
        Some(pool) => pool,
        None => {
            log_with_time!("❌ [文件监听] 启动失败: DB_POOL_REF 未初始化!");
            return Err(notify::Error::generic("DB Pool not initialized"));
        }
    };
    
    std::thread::spawn(move || {
        log_with_time!("👀 [文件监听] 事件处理线程已启动");
        
        for res in rx {
            // ★★★ 核心修改 (点 2): 在每次事件循环开始时，清理过期的 L4 源 ★★★
            let deleted_metas = SAVE_TRACKER.cleanup_expired_sources();
            if !deleted_metas.is_empty() {
                log_with_time!("🧹 清理 {} 个外部删除的文件...", deleted_metas.len());
                for meta in deleted_metas {
                    handle_external_delete(&workspace_path, &meta.path, &app_handle, &db_pool);
                }
            }
            
            match res {
                Ok(event) => {
                    let kind = event.kind;
                    let paths = event.paths.clone();
                    
                    for path in &paths {
                        // (跳过 .cheetah-note 和隐藏文件)
                        if let Some(path_str) = path.to_str() {
                            if path_str.contains(".cheetah-note") || path_str.contains("/.") || path_str.contains("\\.") {
                                continue;
                            }
                        }
						if path.extension().and_then(|s| s.to_str()) != Some("md") {
                            continue;
                        }
                        
                        let relative_path_opt = to_relative_path(Path::new(&workspace_path), path);
                        if let Some(rel_path) = relative_path_opt {
                            
                            // ★★★ 核心修改 (点 1): 分离事件类型 ★★★
                            match kind {
                                // --- 1. CREATE (处理外部 Create 和 外部 Move-Target) ---
                                EventKind::Create(_) => {
                                    log_with_time!("👀 [监听] 检测到 Create: {}", rel_path);

                                    // L1/L2 检查 (内部 Create/Move)
                                    if SAVE_TRACKER.app_activity_locks.lock().unwrap().contains(&rel_path) {
                                        log_with_time!("⏭️ [L1/L2] 跳过: {} (内部创建/移动)", rel_path);
                                        continue;
                                    }

                                    // ★★★ 核心 (点 5): 读取新文件内容以计算元数据 ★★★
                                    let content = fs::read_to_string(path).unwrap_or_default();
                                    let new_size = content.len() as i64;
                                    let new_word_count = content.split_whitespace().count() as i64;
                                    let new_title = Path::new(&rel_path).file_stem().unwrap_or_default().to_string_lossy().to_string();

                                    // L4b (移动) 检测: 检查 Remove 列表 (文件名匹配)
                                    if let Some((old_path, _)) = SAVE_TRACKER.find_recent_move_source(&new_title) {
                                        log_with_time!("🔄 [L4b 移动] 检测到外部移动: {} -> {}", old_path, rel_path);
                                        handle_external_rename_move(&workspace_path, &old_path, &rel_path, &app_handle, &db_pool);
                                        continue;
                                    }

                                    // L4a (重命名) 检测: 检查 Modify(!exists) 列表 (Size/字数 匹配)
                                    if let Some((old_path, _)) = SAVE_TRACKER.find_recent_rename_source(new_size, new_word_count) {
                                        log_with_time!("🔄 [L4a 重命名] 检测到外部重命名: {} -> {}", old_path, rel_path);
                                        handle_external_rename_move(&workspace_path, &old_path, &rel_path, &app_handle, &db_pool);
                                        continue;
                                    }

                                    // --- 确认为 外部新建 ---
                                    log_with_time!("🔔 [外部创建] 确认为: {}", rel_path);
                                    handle_external_create(&workspace_path, &rel_path, new_size, new_word_count, &app_handle, &db_pool);
                                }

                                // --- 2. MODIFY (处理外部 Modify 和 外部 Rename) ---
                                EventKind::Modify(_) => {
                                    log_with_time!("👀 [监听] 检测到 Modify: {}", rel_path);
                                    let absolute_path = Path::new(&workspace_path).join(&rel_path);

                                    // --- A. 处理 Rename-Source (Modify + !exists) ---
                                    if !absolute_path.exists() {
                                        // L1/L2 检查 (如果是内部重命名/移动，L1/L2锁会包含old_path，应跳过)
                                        if SAVE_TRACKER.app_activity_locks.lock().unwrap().contains(&rel_path) {
                                            log_with_time!("⏭️ [L1/L2] 跳过: {} (内部重命名源)", rel_path);
                                            continue;
                                        }
                                        log_with_time!("⏭️ [L4a 源] 路径不存在: {} (标记为重命名源)", rel_path);
                                        // ★★★ 核心 (点 5): 从 DB 查询元数据 ★★★
                                        if let Some(meta) = get_metadata_from_db(&db_pool, &rel_path) {
                                            SAVE_TRACKER.mark_potential_rename_source(rel_path.clone(), meta);
                                        }
                                        continue;
                                    }

                                    // --- B. 处理 Rename-Target 和 外部 Modify (Modify + exists) ---
                                    
                                    // L1/L2 检查 (内部 Save/Rename-Target)
                                    if SAVE_TRACKER.app_activity_locks.lock().unwrap().contains(&rel_path) {
                                        log_with_time!("⏭️ [L1/L2] 跳过: {} (内部保存/重命名目标)", rel_path);
                                        continue;
                                    }

                                    // L3 检查 (时间戳回声)
                                    if should_skip_by_timestamp(&rel_path, &absolute_path) {
                                        log_with_time!("⏭️ [L3] 跳过: {} (时间戳匹配)", rel_path);
                                        continue;
                                    }
                                    
                                    // ★★★ 核心 (点 5): 读取新文件内容以计算元数据 ★★★
                                    let content = fs::read_to_string(&absolute_path).unwrap_or_default();
                                    let new_size = content.len() as i64;
                                    let new_word_count = content.split_whitespace().count() as i64;

                                    // L4a (重命名) 检测: (Size/字数 匹配)
                                    if let Some((old_path, _)) = SAVE_TRACKER.find_recent_rename_source(new_size, new_word_count) {
                                        log_with_time!("🔄 [L4a 重命名] 检测到外部重命名: {} -> {}", old_path, rel_path);
                                        handle_external_rename_move(&workspace_path, &old_path, &rel_path, &app_handle, &db_pool);
                                        continue;
                                    }
                                    
                                    // --- 确认为 外部修改 ---
                                    log_with_time!("🔔 [外部修改] 确认为: {}", rel_path);
                                    handle_external_modify(&workspace_path, &rel_path, new_size, new_word_count, &app_handle, &db_pool);
                                }

                                // --- 3. REMOVE (处理外部 Delete 和 外部 Move-Source) ---
                                EventKind::Remove(_) => {
                                    log_with_time!("👀 [监听] 检测到 Remove: {}", rel_path);

                                    // L1/L2 检查 (内部 Delete/Move-Source)
                                    if SAVE_TRACKER.app_activity_locks.lock().unwrap().contains(&rel_path) {
                                        log_with_time!("⏭️ [L1/L2] 跳过: {} (内部删除/移动源)", rel_path);
                                        continue;
                                    }

                                    // ★★★ 核心 (点 5): 从 DB 查询元数据 ★★★
                                    if let Some(meta) = get_metadata_from_db(&db_pool, &rel_path) {
                                        log_with_time!("🔔 [L4b 源] 标记为潜在移动源/删除源: {}", rel_path);
                                        SAVE_TRACKER.mark_potential_move_source(rel_path.clone(), meta);
                                    } else {
                                        log_with_time!("⏭️ [L4b 源] DB中无此记录，忽略 Remove: {}", rel_path);
                                    }
                                    // (此时不做任何事，等待 cleanup_expired_sources 或 Create 事件来处理)
                                }
                                _ => {}
                            }
                        }
                    }
                }
                Err(e) => {
                    log_with_time!("⚠️ [文件监听] 错误: {:?}", e);
                }
            }
        }
        
        log_with_time!("🛑 [文件监听] 事件处理线程已退出");
    });
    
    log_with_time!("✅ [文件监听] 启动完成");
    Ok(())
}

/// 停止文件监听
pub fn stop_file_watcher() {
    log_with_time!("🛑 [文件监听] 正在停止...");
    *WATCHER.lock().unwrap() = None;
    log_with_time!("✅ [文件监听] 已停止");
}

// ============================================================================
// ★★★ 核心修改 ★★★
// 5. Watcher 辅助函数 (处理外部事件)
// ============================================================================

/// (辅助) L3 检查：时间戳对比
fn should_skip_by_timestamp(rel_path: &str, absolute_path: &Path) -> bool {
    let known_times = SAVE_TRACKER.known_write_times.lock().unwrap();
    if let Some(known_time) = known_times.get(rel_path) {
        if let Ok(meta) = fs::metadata(absolute_path) {
            if let Ok(disk_time) = meta.modified() {
                // 5秒容差
                let tolerance = std::time::Duration::from_secs(5);
                if disk_time <= *known_time + tolerance {
                    return true; // 内部修改，跳过
                }
            }
        }
    }
    false // 外部修改或无记录，不跳过
}

/// (辅助) 从数据库获取元数据
fn get_metadata_from_db(db_pool: &DbPool, path: &str) -> Option<WatchedFileMetadata> {
    let conn = db_pool.get().ok()?;
    conn.query_row(
        // ★★★ 依赖 `size` 和 `word_count` 字段 ★★★
        "SELECT path, title, size, word_count FROM files WHERE path = ?1",
        params![path],
        |row| {
            Ok(WatchedFileMetadata {
                path: row.get(0)?,
                title: row.get(1)?,
                size: row.get(2)?,
                word_count: row.get(3)?,
            })
        },
    ).optional().unwrap_or(None)
}

/// (辅助) 处理外部删除 (由 cleanup_expired_sources 调用)
/// ★★★ 修复点 2：外部删除现在会清理索引 ★★★
fn handle_external_delete(workspace_path: &str, path: &str, app_handle: &Option<AppHandle>, db_pool: &DbPool) {
    log_with_time!("🔔 [外部删除] 确认为: {}", path);

    // 1. 清理 DB (如果存在)
    if let Ok(conn) = db_pool.get() {
        let _ = conn.execute("DELETE FROM files WHERE path = ?1", params![path]);
    }

    // 2. ★★★ L1/L2 加锁 (因为分发了任务) ★★★
    SAVE_TRACKER.app_activity_locks.lock().unwrap().insert(path.to_string());

    // 3. 清理索引 (异步)
    if let Err(e) = indexing_jobs::dispatch_delete_job(path.to_string()) {
        eprintln!("❌ 分发外部删除索引任务失败: {}", e);
        // 失败也要释放锁
        SAVE_TRACKER.app_activity_locks.lock().unwrap().remove(path);
    }

    // 4. 通知前端
    if let Some(ref handle) = app_handle {
         let _ = handle.emit("file-changed", json!({ "type": "deleted", "path": path }));
    }
}

/// (辅助) 处理外部新建
fn handle_external_create(
    workspace_path: &str, 
    path: &str, 
    size: i64, 
    word_count: i64, 
    app_handle: &Option<AppHandle>, 
    db_pool: &DbPool
) {
    // 1. 插入 DB
    if let Ok(conn) = db_pool.get() {
        let title = Path::new(path).file_stem().unwrap_or_default().to_string_lossy();
        let _ = conn.execute(
            // ★★★ 插入新元数据 ★★★
            "INSERT INTO files (path, title, size, word_count, indexed, is_dir) VALUES (?1, ?2, ?3, ?4, 0, 0)",
            params![path, title, size, word_count]
        );
    }
    
    // 2. ★★★ L1/L2 加锁 ★★★
    SAVE_TRACKER.app_activity_locks.lock().unwrap().insert(path.to_string());
    
    // 3. 分发索引
    if let Err(e) = indexing_jobs::dispatch_update_job(workspace_path.to_string(), path.to_string()) {
         eprintln!("❌ 分发外部创建索引任务失败: {}", e);
         SAVE_TRACKER.app_activity_locks.lock().unwrap().remove(path); // 失败释放锁
    }
    
    // 4. 通知前端
    if let Some(ref handle) = app_handle {
         let _ = handle.emit("file-changed", json!({ "type": "created", "path": path }));
    }
}

/// (辅助) 处理外部修改
fn handle_external_modify(
    workspace_path: &str, 
    path: &str, 
    size: i64, 
    word_count: i64, 
    app_handle: &Option<AppHandle>, 
    db_pool: &DbPool
) {
    // 1. 更新 DB
    if let Ok(conn) = db_pool.get() {
        let _ = conn.execute(
            // ★★★ 更新元数据并将 indexed 设为 0 ★★★
            "UPDATE files SET size = ?1, word_count = ?2, indexed = 0, updated_at = CURRENT_TIMESTAMP 
             WHERE path = ?3",
            params![size, word_count, path]
        );
    }
    
    // 2. ★★★ L1/L2 加锁 ★★★
    SAVE_TRACKER.app_activity_locks.lock().unwrap().insert(path.to_string());
    
    // 3. 分发索引
    if let Err(e) = indexing_jobs::dispatch_update_job(workspace_path.to_string(), path.to_string()) {
         eprintln!("❌ 分发外部修改索引任务失败: {}", e);
         SAVE_TRACKER.app_activity_locks.lock().unwrap().remove(path); // 失败释放锁
    }
    
    // 4. 通知前端
    if let Some(ref handle) = app_handle {
         let _ = handle.emit("file-changed", json!({ "type": "modified", "path": path }));
    }
}

/// (辅助) 处理外部重命名或移动
fn handle_external_rename_move(
    workspace_path: &str, 
    old_path: &str, 
    new_path: &str, 
    app_handle: &Option<AppHandle>, 
    db_pool: &DbPool
) {
    // 1. 更新 DB (保留元数据，只改 path 和 title)
    if let Ok(conn) = db_pool.get() {
        let new_title = Path::new(new_path).file_stem().unwrap_or_default().to_string_lossy();
        let _ = conn.execute(
            // ★★★ indexed 设为 0 ★★★
            "UPDATE files SET path = ?1, title = ?2, indexed = 0, updated_at = CURRENT_TIMESTAMP
             WHERE path = ?3",
            params![new_path, new_title, old_path]
        );
    }
    
    // 2. ★★★ L1/L2 加锁 (新旧路径) ★★★
    {
        let mut locks = SAVE_TRACKER.app_activity_locks.lock().unwrap();
        locks.insert(old_path.to_string());
        locks.insert(new_path.to_string());
    }
    
    // 3. 分发索引
    if let Err(e) = indexing_jobs::dispatch_rename_job(
        workspace_path.to_string(), 
        old_path.to_string(), 
        new_path.to_string()
    ) {
         eprintln!("❌ 分发外部重命名索引任务失败: {}", e);
         let mut locks = SAVE_TRACKER.app_activity_locks.lock().unwrap();
         locks.remove(old_path);
         locks.remove(new_path);
    }
    
    // 4. 通知前端
    if let Some(ref handle) = app_handle {
         let _ = handle.emit("file-changed", json!({ 
            "type": "renamed", 
            "oldPath": old_path,
            "newPath": new_path 
        }));
    }
}