// src-tauri/src/file_watcher.rs
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher, Event, EventKind};
use std::path::Path;
use std::sync::mpsc::channel;
use std::time::Duration;
use crate::indexing_jobs;

pub fn start_file_watcher(workspace_path: String) -> notify::Result<()> {
    let (tx, rx) = channel();
    
    let mut watcher = RecommendedWatcher::new(
        tx,
        Config::default().with_poll_interval(Duration::from_secs(2))
    )?;
    
    watcher.watch(Path::new(&workspace_path), RecursiveMode::Recursive)?;
    
    std::thread::spawn(move || {
        println!("👀 [文件监听] 已启动,监控路径: {}", workspace_path);
        
        for res in rx {
            match res {
                Ok(Event { kind, paths, .. }) => {
                    // 只处理 .md 文件
                    for path in paths {
                        if path.extension().and_then(|s| s.to_str()) != Some("md") {
                            continue;
                        }
                        
                        // 跳过隐藏文件和 .cheetah-note 目录
                        if path.to_str().map(|s| s.contains("/.")).unwrap_or(false) {
                            continue;
                        }
                        
                        // 计算相对路径
                        let relative_path = path.strip_prefix(&workspace_path)
                            .ok()
                            .and_then(|p| p.to_str())
                            .map(|s| s.replace('\\', "/"));
                        
                        if let Some(rel_path) = relative_path {
                            match kind {
                                EventKind::Create(_) | EventKind::Modify(_) => {
                                    println!("👀 [文件监听] 检测到变更: {}", rel_path);
                                    
                                    if let Err(e) = indexing_jobs::dispatch_update_job(
                                        workspace_path.clone(),
                                        rel_path.clone()
                                    ) {
                                        eprintln!("⚠️ 分发索引任务失败: {}", e);
                                    }
                                }
                                EventKind::Remove(_) => {
                                    println!("👀 [文件监听] 检测到删除: {}", rel_path);
                                    
                                    if let Err(e) = indexing_jobs::dispatch_delete_job(rel_path.clone()) {
                                        eprintln!("⚠️ 分发删除任务失败: {}", e);
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                }
                Err(e) => eprintln!("⚠️ [文件监听] 错误: {:?}", e),
            }
        }
    });
    
    // 保持 watcher 存活
    std::mem::forget(watcher);
    
    Ok(())
}