// src-tauri/src/file_watcher.rs
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher, EventKind};
use std::path::Path;
use std::sync::mpsc::channel;
use std::time::Duration;
use crate::indexing_jobs;
use tauri::{AppHandle, Emitter};
use once_cell::sync::Lazy;
use std::sync::Mutex;
use crate::indexing_jobs::SAVE_TRACKER;
use std::fs::metadata as fs_metadata;

use std::time::UNIX_EPOCH;  // ✅ 添加这行
use anyhow::Result;  // ✅ 添加这行
use rusqlite::params;  // ✅ 添加这行




// 获取当前时间的时:分:秒格式
fn get_time_string() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap();
    
    let total_secs = duration.as_secs();
    let hours = (total_secs / 3600) % 24;
    let minutes = (total_secs / 60) % 60;
    let seconds = total_secs % 60;
    let millis = duration.subsec_millis();
    
    // 加8小时转换为北京时间
    let hours = (hours + 8) % 24;
    
    format!("{:02}:{:02}:{:02}.{:03}", hours, minutes, seconds, millis)
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
    
    // 创建 watcher
    let mut watcher = RecommendedWatcher::new(
        tx,
        Config::default().with_poll_interval(Duration::from_secs(2))
    )?;
    
    // 开始监控
    watcher.watch(Path::new(&workspace_path), RecursiveMode::Recursive)?;
    
    log_with_time!("✅ [文件监听] Watcher 已创建并开始监控");
    
    // ✅ 将 watcher 保存到全局变量
    *WATCHER.lock().unwrap() = Some(watcher);
    
    // 启动事件处理线程
    std::thread::spawn(move || {
        log_with_time!("👀 [文件监听] 事件处理线程已启动");
        
        for res in rx {
            match res {
                Ok(event) => {
                    let kind = event.kind;
                    let paths = event.paths;
                    
                    //log_with_time!("📢 [文件监听] 收到事件: {:?}, 路径数: {}", kind, paths.len());
                    
                    // 只处理 .md 文件
                    for path in paths {
                        //log_with_time!("  🔍 检查路径: {:?}", path);
                        
                        // 跳过隐藏文件和 .cheetah-note 目录
                        if let Some(path_str) = path.to_str() {
							// 跳过 .cheetah-note 目录
							if path_str.contains(".cheetah-note") {
								//log_with_time!("  ⏭️ 跳过 .cheetah-note 目录");
								continue;
							}
                            if path_str.contains("\\.") || path_str.contains("/.") {
                                log_with_time!("  ⏭️ 跳过隐藏文件");
                                continue;
                            }
                        }
						
						if path.extension().and_then(|s| s.to_str()) != Some("md") {
                            log_with_time!("  ⏭️ 跳过非 .md 文件");
                            continue;
                        }
                        
                        // 计算相对路径
                        let relative_path = path.strip_prefix(&workspace_path)
                            .ok()
                            .and_then(|p| p.to_str())
                            .map(|s| s.replace('\\', "/"));
                        
                        if let Some(rel_path) = relative_path {
                            log_with_time!("  ✅ 相对路径: {}", rel_path);
							//从日志可以看到外部重命名的实际事件序列是：

//Modify 事件（旧文件） → 家人.md → 文件已不存在 → 跳过
//Modify 事件（新文件） → 家人2.md → 通过 Layer 3 → 尝试索引 → 报错

//所以重命名检测的触发条件应该是：连续的两个 Modify 事件，第一个文件不存在，第二个文件存在且无已知时间戳。
                            
                            match kind {
                                EventKind::Create(_) | EventKind::Modify(_) => {
									 // ✅ 提前检查文件是否存在
									let absolute_path = Path::new(&workspace_path).join(&rel_path);
									if !absolute_path.exists() {
										log_with_time!("⏭️ [文件不存在] 检测到: {} (可能是重命名的旧路径)", rel_path);
										
										// ✅ 标记为潜在的重命名源
										indexing_jobs::SAVE_TRACKER.mark_potential_rename_source(rel_path.clone());
										
										continue;
									}
                                    let event_type = if matches!(kind, EventKind::Create(_)) { "创建" } else { "修改" };
									log_with_time!("👀 [文件监听] 检测到{}: {}", event_type, rel_path);
								// ✅ Layer 1: 检查瞬时锁
									{
										let saving = SAVE_TRACKER.files_currently_saving.lock().unwrap();
										if saving.contains(&rel_path) {
											log_with_time!("⏭️ [Layer 1] 跳过: {} (正在保存中)", rel_path);
											continue; // 忽略此事件,不分发索引,不通知前端
										}
									}
									
									// ✅ Layer 2: 检查索引标记
									{
										let indexing = SAVE_TRACKER.files_currently_indexing.lock().unwrap();
										if indexing.contains(&rel_path) {
											log_with_time!("⏭️ [Layer 2] 跳过: {} (正在索引中)", rel_path);
											continue; // 忽略此事件
										}
									}
									
									// ✅ Layer 3: 时间戳对比
									let absolute_path = Path::new(&workspace_path).join(&rel_path);
									let should_ignore = {
										let known_times = SAVE_TRACKER.known_write_times.lock().unwrap();
										
										if let Some(known_time) = known_times.get(&rel_path) {
											if let Ok(meta) = fs_metadata(&absolute_path) {
												if let Ok(disk_time) = meta.modified() {
													// 时间戳容差: 4秒 (兼容 FAT32)
													let tolerance = std::time::Duration::from_secs(5);
													
													// 磁盘时间 <= 已知时间 + 容差 → 内部修改
													if disk_time <= *known_time + tolerance {
														log_with_time!("⏭️ [Layer 3] 跳过: {} (时间戳匹配,内部修改)", rel_path);
														true
													} else {
														log_with_time!("✅ [Layer 3] 通过: {} (时间戳不匹配,外部修改)", rel_path);
														false
													}
												} else {
													false
												}
											} else {
												false
											}
										} else {
											// 没有已知时间戳,可能是外部创建的文件
											log_with_time!("✅ [Layer 3] 通过: {} (无已知时间戳)", rel_path);
											false
										}
									};
									
									if should_ignore {
										continue; // 忽略此事件
									}
									
									// ✅ 三层检查都通过 → 确认是外部修改
									log_with_time!("🔔 [外部修改] 检测到外部{}文件: {}", event_type, rel_path);
									
									// ✅ 先清理过期的重命名源标记
									indexing_jobs::SAVE_TRACKER.cleanup_expired_rename_sources();
									
									// ✅ 检查是否为重命名操作
									if let Some(old_path) = indexing_jobs::SAVE_TRACKER.find_recent_rename_source() {
										log_with_time!("🔄 [重命名检测] 检测到外部重命名: {} -> {}", old_path, rel_path);
										
										// 确认重命名并移除标记
										indexing_jobs::SAVE_TRACKER.confirm_rename(&old_path);
										
										// 更新数据库记录（保留元数据）
										if let Err(e) = update_file_path_in_db(&workspace_path, &old_path, &rel_path) {
											eprintln!("❌ [文件监听] 更新数据库路径失败: {}", e);
											
											// 失败则按新建处理
											if let Err(e2) = ensure_file_record_exists(&workspace_path, &rel_path) {
												eprintln!("❌ [文件监听] 创建数据库记录失败: {}: {}", rel_path, e2);
												continue;
											}
											
											if let Err(e2) = indexing_jobs::dispatch_update_job(
												workspace_path.clone(),
												rel_path.clone()
											) {
												log_with_time!("⚠️ 分发索引任务失败: {}", e2);
											}
											
											// 发送创建事件到前端（降级处理）
											if let Some(ref handle) = app_handle {
												let _ = handle.emit("file-changed", serde_json::json!({
													"type": "created",
													"path": rel_path
												}));
											}
										} else {
											// 成功更新数据库，分发重命名索引任务
											if let Err(e) = indexing_jobs::dispatch_rename_job(
												workspace_path.clone(),
												old_path.clone(),
												rel_path.clone()
											) {
												log_with_time!("⚠️ 分发重命名索引任务失败: {}", e);
											}
											
											// ✅ 发送重命名事件到前端
											if let Some(ref handle) = app_handle {
												log_with_time!("🔍 [调试] old_path内容: '{}'", old_path);
												log_with_time!("🔍 [调试] rel_path内容: '{}'", rel_path);
												log_with_time!("🔍 [调试] workspace_path: '{}'", workspace_path);
												log_with_time!("📤 [前端事件] 发送重命名事件: {} -> {}", old_path, rel_path);
												let _ = handle.emit("file-changed", serde_json::json!({
													"type": "renamed",
													"oldPath": old_path,
													"newPath": rel_path
												}));
											}
										}
										
										continue; // 处理完重命名，跳过后续逻辑
									}
									
									// ✅ 不是重命名，是真正的外部创建或修改
									log_with_time!("📝 [外部操作] {}文件: {}", event_type, rel_path);
									
									// 如果是 Create 事件或无已知时间戳（可能是新建），需要先创建数据库记录
									if matches!(kind, EventKind::Create(_)) || !SAVE_TRACKER.known_write_times.lock().unwrap().contains_key(&rel_path) {
										if let Err(e) = ensure_file_record_exists(&workspace_path, &rel_path) {
											eprintln!("❌ [文件监听] 创建数据库记录失败: {}: {}", rel_path, e);
											continue;
										}
									}
									
									// 分发索引任务
									if let Err(e) = indexing_jobs::dispatch_update_job(
										workspace_path.clone(),
										rel_path.clone()
									) {
										log_with_time!("⚠️ 分发索引任务失败: {}", e);
									}
									
									// 发送事件到前端
									if let Some(ref handle) = app_handle {
										let event_type_str = if matches!(kind, EventKind::Create(_)) {
											"created"
										} else {
											"modified"
										};
										
										log_with_time!("📤 [前端事件] 发送{}事件: {}", event_type_str, rel_path);
										let _ = handle.emit("file-changed", serde_json::json!({
											"type": event_type_str,
											"path": rel_path
										}));
									}
								}
                                EventKind::Remove(_) => {
                                    log_with_time!("👀 [文件监听] 检测到删除: {}", rel_path);
                                    
                                    if let Err(e) = indexing_jobs::dispatch_delete_job(rel_path.clone()) {
                                        log_with_time!("⚠️ 分发删除任务失败: {}", e);
                                    }
                                    
                                    // 发送事件到前端
                                    if let Some(ref handle) = app_handle {
                                        let _ = handle.emit("file-changed", serde_json::json!({
                                            "type": "deleted",
                                            "path": rel_path
                                        }));
                                    }
                                }
                                _ => {
                                    log_with_time!("  ⏭️ 忽略其他类型事件: {:?}", kind);
                                }
                            }
                        } else {
                            log_with_time!("  ⚠️ 无法计算相对路径");
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



/// 确保文件记录存在（用于外部创建）
fn ensure_file_record_exists(root_path: &str, relative_path: &str) -> anyhow::Result<()> {
    let db_pool_lock = indexing_jobs::DB_POOL_REF.lock().unwrap();
    let db_pool = db_pool_lock.as_ref()
        .ok_or_else(|| anyhow::anyhow!("数据库连接池未初始化"))?;
    
    let conn = db_pool.get()?;
    
    // 检查记录是否已存在
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM files WHERE path = ?1)",
        params![relative_path],
        |row| row.get(0),
    )?;
    
    if !exists {
        let title = relative_path
            .split('/')
            .last()
            .unwrap_or(relative_path)
            .trim_end_matches(".md");
        
        let absolute_path = Path::new(root_path).join(relative_path);
        let mtime = if let Ok(meta) = fs_metadata(&absolute_path) {
            if let Ok(modified) = meta.modified() {
                modified.duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64
            } else {
                0
            }
        } else {
            0
        };
        
        conn.execute(
            "INSERT INTO files (path, title, is_dir, indexed, last_modified) 
             VALUES (?1, ?2, 0, 0, ?3)",
            params![relative_path, title, mtime],
        )?;
        
        println!("✅ [文件监听] 已创建数据库记录: {}", relative_path);
    }
    
    Ok(())
}

/// 更新文件路径（用于重命名）
fn update_file_path_in_db(root_path: &str, old_path: &str, new_path: &str) -> anyhow::Result<()> {
    let db_pool_lock = indexing_jobs::DB_POOL_REF.lock().unwrap();
    let db_pool = db_pool_lock.as_ref()
        .ok_or_else(|| anyhow::anyhow!("数据库连接池未初始化"))?;
    
    let conn = db_pool.get()?;
    
    let new_title = new_path
        .split('/')
        .last()
        .unwrap_or(new_path)
        .trim_end_matches(".md");
    
    let absolute_path = Path::new(root_path).join(new_path);
    let mtime = if let Ok(meta) = fs_metadata(&absolute_path) {
        if let Ok(modified) = meta.modified() {
            modified.duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64
        } else {
            0
        }
    } else {
        0
    };
    
    let updated = conn.execute(
        "UPDATE files SET path = ?1, title = ?2, indexed = 0, last_modified = ?3 
         WHERE path = ?4",
        params![new_path, new_title, mtime, old_path],
    )?;
    
    if updated > 0 {
        println!("✅ [文件监听] 已更新数据库路径: {} -> {}", old_path, new_path);
    } else {
        println!("⚠️ [文件监听] 未找到旧路径记录: {}", old_path);
    }
    
    Ok(())
}