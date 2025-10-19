// src-tauri/src/file_watcher.rs
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher, EventKind};
use std::path::Path;
use std::sync::mpsc::channel;
use std::time::Duration;
use crate::indexing_jobs;
use tauri::{AppHandle, Emitter};
use once_cell::sync::Lazy;
use std::sync::Mutex;

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
                            
                            match kind {
                                EventKind::Create(_) => {
                                    println!("👀 [文件监听] 检测到创建: {}", rel_path);
                                    
                                    if let Err(e) = indexing_jobs::dispatch_update_job(
                                        workspace_path.clone(),
                                        rel_path.clone()
                                    ) {
                                        log_with_time!("⚠️ 分发索引任务失败: {}", e);
                                    }
                                    
                                    // 发送事件到前端
                                    if let Some(ref handle) = app_handle {
                                        let _ = handle.emit("file-changed", serde_json::json!({
                                            "type": "created",
                                            "path": rel_path
                                        }));
                                    }
                                }
                                EventKind::Modify(_) => {
                                    log_with_time!("👀 [文件监听] 检测到修改: {}", rel_path);
                                    
                                    if let Err(e) = indexing_jobs::dispatch_update_job(
                                        workspace_path.clone(),
                                        rel_path.clone()
                                    ) {
                                        log_with_time!("⚠️ 分发索引任务失败: {}", e);
                                    }
                                    
                                    // 发送事件到前端
                                    if let Some(ref handle) = app_handle {
                                        let _ = handle.emit("file-changed", serde_json::json!({
                                            "type": "modified",
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