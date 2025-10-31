// src-tauri/src/indexing_jobs.rs
// CheetahNote 异步索引任务系统 (已重构)

use crossbeam_channel::{unbounded, Sender, Receiver};
use once_cell::sync::Lazy;
use serde::{Serialize, Deserialize};
use std::sync::Arc;
use tantivy::Index;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params, OptionalExtension};
use anyhow::Result;
use crate::database::DbPool;
use std::sync::Mutex;
use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, Duration};
use std::path::Path;
use std::fs;
use std::time::UNIX_EPOCH;

// ============================================================================
// ★★★ 核心修改 ★★★
// 1. 引入 WatchedFileMetadata 结构体
// ============================================================================
#[derive(Debug, Clone)]
pub struct WatchedFileMetadata {
    pub path: String,
    pub title: String,
    pub size: i64,
    pub word_count: i64,
}

// ============================================================================
// 2. 重构 SaveTracker (L1/L2 合并, L4 使用元数据)
// ============================================================================
pub struct SaveTracker {
    /// L1/L2 合并: "应用活动锁"
    /// 涵盖内部的 Save, Create, Delete, Rename, Move。
    /// 任务在*开始时*（fs.rs）加入，在*索引完成后*（本文件 process_job）移除。
    pub app_activity_locks: Mutex<HashSet<String>>,
    
    /// L3: "时间戳"
    /// 记录内部已知写入时间，用于过滤 Modify 事件的"回声"。
    pub known_write_times: Mutex<HashMap<String, SystemTime>>,

    /// L4a: "重命名"检测 (Modify + !exists)
    /// Key: old_path, Value: (Time, DB Metadata)
    pub potential_rename_sources: Mutex<HashMap<String, (SystemTime, WatchedFileMetadata)>>,

    /// L4b: "移动"检测 (Remove)
    /// Key: old_path, Value: (Time, DB Metadata)
    pub potential_move_sources: Mutex<HashMap<String, (SystemTime, WatchedFileMetadata)>>,
    
    /// L4 检测窗口
    pub detection_window: Duration,
}

impl SaveTracker {
    pub fn new() -> Self {
        Self {
            app_activity_locks: Mutex::new(HashSet::new()),
            known_write_times: Mutex::new(HashMap::new()),
            potential_rename_sources: Mutex::new(HashMap::new()),
            potential_move_sources: Mutex::new(HashMap::new()),
            detection_window: Duration::from_secs(2), // 2秒检测窗口
        }
    }

    // --- L4a (重命名) 辅助函数 ---
    pub fn mark_potential_rename_source(&self, path: String, meta: WatchedFileMetadata) {
        self.potential_rename_sources.lock().unwrap().insert(path, (SystemTime::now(), meta));
    }
    
    // 匹配 size 和 word_count
    pub fn find_recent_rename_source(&self, new_size: i64, new_word_count: i64) -> Option<(String, WatchedFileMetadata)> {
        let now = SystemTime::now();
        let mut sources = self.potential_rename_sources.lock().unwrap();
        
        let found_key = sources.iter()
            .filter(|(_, (time, meta))| {
                now.duration_since(*time).unwrap_or_default() < self.detection_window &&
                meta.size == new_size &&
                meta.word_count == new_word_count
            })
            .map(|(path, _)| path.clone())
            .next(); // 找到第一个匹配的即可
            
        if let Some(key) = found_key {
            sources.remove_entry(&key).map(|(path, (_, meta))| (path, meta))
        } else {
            None
        }
    }
    
    // --- L4b (移动) 辅助函数 ---
    pub fn mark_potential_move_source(&self, path: String, meta: WatchedFileMetadata) {
        self.potential_move_sources.lock().unwrap().insert(path, (SystemTime::now(), meta));
    }

    // 匹配 title (文件名)
    pub fn find_recent_move_source(&self, new_title: &str) -> Option<(String, WatchedFileMetadata)> {
        let now = SystemTime::now();
        let mut sources = self.potential_move_sources.lock().unwrap();

        let found_key = sources.iter()
            .filter(|(_, (time, meta))| {
                now.duration_since(*time).unwrap_or_default() < self.detection_window &&
                meta.title == new_title
            })
            .map(|(path, _)| path.clone())
            .next();
            
        if let Some(key) = found_key {
            sources.remove_entry(&key).map(|(path, (_, meta))| (path, meta))
        } else {
            None
        }
    }

    /// ★★★ 核心修改 (点 2)：清理所有过期的 L4 标记 ★★★
    /// 返回一个 Vec<WatchedFileMetadata> 包含所有确认被外部删除的条目
    pub fn cleanup_expired_sources(&self) -> Vec<WatchedFileMetadata> {
        let mut deleted_metas = Vec::new();
        let now = SystemTime::now();
        
        // 1. 清理重命名源 (Modify + !exists)
        self.potential_rename_sources.lock().unwrap().retain(|_, (time, meta)| {
            if now.duration_since(*time).unwrap_or_default() > self.detection_window {
                println!("⏱️ [L4a 超时] 确认为外部删除: {}", meta.path);
                deleted_metas.push(meta.clone());
                false // 从 map 中移除
            } else {
                true // 保留
            }
        });
        
        // 2. 清理移动源 (Remove)
        self.potential_move_sources.lock().unwrap().retain(|_, (time, meta)| {
            if now.duration_since(*time).unwrap_or_default() > self.detection_window {
                println!("⏱️ [L4b 超时] 确认为外部删除: {}", meta.path);
                deleted_metas.push(meta.clone());
                false // 从 map 中移除
            } else {
                true // 保留
            }
        });
        
        deleted_metas
    }
}

// 全局追踪器实例
pub static SAVE_TRACKER: Lazy<SaveTracker> = Lazy::new(|| SaveTracker::new());

// [新增] 全局数据库连接池引用
pub static DB_POOL_REF: Lazy<Mutex<Option<DbPool>>> = Lazy::new(|| Mutex::new(None));
// [新增] 初始化数据库连接池引用
pub fn set_db_pool(pool: DbPool) {
    *DB_POOL_REF.lock().unwrap() = Some(pool);
}

use crate::search_core::{
    update_document_index,
    update_document_index_for_rename,
    delete_document
};

// ============================================================================
// 3. 任务定义 (不变)
// ============================================================================
#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum JobPayload {
    UpdateOrSave { 
        root_path: String,
        relative_path: String 
    },
    RenameOrMove { 
        root_path: String,
        old_relative_path: String,
        new_relative_path: String 
    },
    Delete { 
        relative_path: String 
    },
}

#[derive(Debug)]
pub struct IndexingJob {
    pub db_id: Option<i64>,
    pub payload: JobPayload,
}

pub enum ControlSignal {
    Job(IndexingJob),
    Shutdown,
}

pub static JOB_CHANNEL: Lazy<(Sender<ControlSignal>, Receiver<ControlSignal>)> = 
    Lazy::new(|| unbounded());

// ============================================================================
// 4. 辅助函数：获取 MTime
// ============================================================================
/// 辅助函数：获取文件修改时间（秒级 Unix 时间戳）
fn get_file_mtime(absolute_path: &Path) -> i64 {
    if let Ok(meta) = fs::metadata(absolute_path) {
        if let Ok(modified) = meta.modified() {
            if let Ok(duration) = modified.duration_since(UNIX_EPOCH) {
                return duration.as_secs() as i64;
            }
        }
    }
    // 失败时返回当前时间
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}


// ============================================================================
// 5. 后台 Worker 启动函数 (不变)
// ============================================================================
pub fn start_background_worker(
    db_pool: Pool<SqliteConnectionManager>,
    index: Arc<Index>,
) -> std::thread::JoinHandle<()> {
    let receiver = JOB_CHANNEL.1.clone();

    std::thread::spawn(move || {
        println!("🔍 [索引Worker] 启动成功");

        if let Err(e) = process_pending_db_jobs(&db_pool, &index) {
            eprintln!("❌ [索引Worker] 处理遗留任务失败: {}", e);
        }

        loop {
            match receiver.recv() {
                Ok(ControlSignal::Job(job)) => {
                    println!("🔍 [索引Worker] 接收到任务: {:?}", job.payload);
                    let result = process_job(&db_pool, &index, &job.payload);

                    if let Err(e) = result {
                        eprintln!("❌ [索引Worker] 任务处理失败: {:?}. 错误: {}", job.payload, e);
                        if let Err(persist_err) = persist_failed_job_to_db(&db_pool, &job, &e.to_string()) {
                            eprintln!("❌ [索引Worker] 持久化失败任务时出错: {}", persist_err);
                        }
                    } else if let Some(id) = job.db_id {
                        if let Err(del_err) = delete_job_from_db(&db_pool, id) {
                            eprintln!("⚠️ [索引Worker] 删除已完成任务失败 (ID={}): {}", id, del_err);
                        } else {
                            println!("✅ [索引Worker] 任务完成并清理 (ID={})", id);
                        }
                    } else {
                        println!("✅ [索引Worker] 实时任务完成");
                    }
                }
                Ok(ControlSignal::Shutdown) => {
                    println!("🛑 [索引Worker] 接收到关闭信号，正在退出...");
                    break;
                }
                Err(e) => {
                    eprintln!("❌ [索引Worker] 接收任务时出错: {}", e);
                    break;
                }
            }
        }
        println!("🔍 [索引Worker] 已安全退出");
    })
}

// ============================================================================
// 6. ★★★ 核心修改 ★★★ 任务处理逻辑 (添加元数据计算和锁释放)
// ============================================================================
fn process_job(
    db_pool: &Pool<SqliteConnectionManager>,
    index: &Arc<Index>,
    payload: &JobPayload,
) -> Result<()> {

    match payload {
        JobPayload::UpdateOrSave { root_path, relative_path } => {
            println!("🔍 [索引] 更新/保存: {}", relative_path);
            
            // 步骤 1: 执行索引
            update_document_index(
                index,
                db_pool,
                Path::new(root_path),
                Path::new(relative_path),
            )?;
            
            // 步骤 2: 计算元数据
            let absolute_path = crate::commands::path_utils::to_absolute_path(
                Path::new(root_path),
                Path::new(relative_path)
            );
            
            let content = fs::read_to_string(&absolute_path).unwrap_or_default();
            let file_size = content.len() as i64;
            // (注意: 这里的 word_count 只是一个简单示例，更精确的计算可能需要移除 markdown 标记)
            let file_word_count = content.split_whitespace().count() as i64;
            let mtime = get_file_mtime(&absolute_path);
            
            // 步骤 3: 更新 files 表
            let conn = db_pool.get()?;
            conn.execute(
                "UPDATE files 
                 SET indexed = 1, last_modified = ?1, size = ?2, word_count = ?3 
                 WHERE path = ?4",
                params![mtime, file_size, file_word_count, relative_path],
            )?;
            
            // 步骤 4: ★★★ 释放 L1/L2 锁 ★★★
            SAVE_TRACKER.app_activity_locks.lock().unwrap().remove(relative_path);
            println!("✅ [L1/L2] 释放锁: {}", relative_path);

            println!("✅ [索引] 已更新数据库状态: {}", relative_path);
        }
        
        JobPayload::RenameOrMove { root_path, old_relative_path, new_relative_path } => {
            println!("🔍 [索引] 重命名/移动: {} -> {}", old_relative_path, new_relative_path);
            
            // 步骤 1: 执行索引
            update_document_index_for_rename(
                index,
                db_pool,
                Path::new(root_path),
                Path::new(old_relative_path),
                Path::new(new_relative_path),
            )?;
            
            // 步骤 2: 计算元数据 (针对新文件)
            let absolute_path = crate::commands::path_utils::to_absolute_path(
                Path::new(root_path),
                Path::new(new_relative_path)
            );
            
            let content = fs::read_to_string(&absolute_path).unwrap_or_default();
            let file_size = content.len() as i64;
            let file_word_count = content.split_whitespace().count() as i64;
            let mtime = get_file_mtime(&absolute_path);

            // 步骤 3: 更新数据库 (fs.rs 中可能已经更新了 path，这里确保其他元数据被更新)
            let conn = db_pool.get()?;
            conn.execute(
                "UPDATE files 
                 SET indexed = 1, last_modified = ?1, size = ?2, word_count = ?3 
                 WHERE path = ?4",
                params![mtime, file_size, file_word_count, new_relative_path],
            )?;
            
            // 步骤 4: ★★★ 释放 L1/L2 锁 (新旧路径都释放) ★★★
            {
                let mut locks = SAVE_TRACKER.app_activity_locks.lock().unwrap();
                locks.remove(old_relative_path);
                locks.remove(new_relative_path);
                println!("✅ [L1/L2] 释放锁: {} -> {}", old_relative_path, new_relative_path);
            }
            
            println!("✅ [索引] 已更新数据库状态: {}", new_relative_path);
        }
        
        JobPayload::Delete { relative_path } => {
            println!("🔍 [索引] 删除: {}", relative_path);
            
            // 步骤 1: 删除索引
            delete_document(index, relative_path)?;
            
            // 步骤 2: ★★★ 释放 L1/L2 锁 ★★★
            SAVE_TRACKER.app_activity_locks.lock().unwrap().remove(relative_path);
            println!("✅ [L1/L2] 释放锁: {}", relative_path);
        }
    }

    Ok(())
}

// ============================================================================
// 7. 数据库队列辅助函数 (不变)
// ============================================================================
fn process_pending_db_jobs(
    db_pool: &Pool<SqliteConnectionManager>,
    index: &Arc<Index>,
) -> Result<()> {
    let conn = db_pool.get()?;
    println!("🔍 [索引Worker] 检查遗留任务...");
    loop {
        let job_opt: Option<(i64, String)> = conn
            .query_row(
                "SELECT id, payload FROM indexing_jobs 
                 WHERE status = 'pending' AND retry_count < max_retries
                 ORDER BY created_at ASC LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        match job_opt {
            Some((id, payload_json)) => {
                println!("🔍 [索引Worker] 处理遗留任务 ID={}", id);
                let payload: JobPayload = serde_json::from_str(&payload_json)?;
                let result = process_job(db_pool, index, &payload);
                if let Err(e) = result {
                    eprintln!("❌ [索引Worker] 遗留任务失败 ID={}: {}", id, e);
                    conn.execute(
                        "UPDATE indexing_jobs 
                         SET retry_count = retry_count + 1, last_error = ?1, updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?2",
                        params![e.to_string(), id],
                    )?;
                    let retry_count: i32 = conn.query_row("SELECT retry_count FROM indexing_jobs WHERE id = ?1", params![id], |row| row.get(0))?;
                    let max_retries: i32 = conn.query_row("SELECT max_retries FROM indexing_jobs WHERE id = ?1", params![id], |row| row.get(0))?;
                    if retry_count >= max_retries {
                        conn.execute("UPDATE indexing_jobs SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ?1", params![id])?;
                        eprintln!("⚠️ [索引Worker] 任务 ID={} 已标记为失败", id);
                    }
                } else {
                    delete_job_from_db(db_pool, id)?;
                    println!("✅ [索引Worker] 遗留任务完成 ID={}", id);
                }
            }
            None => {
                println!("✅ [索引Worker] 所有遗留任务处理完成");
                break;
            }
        }
    }
    Ok(())
}

fn persist_failed_job_to_db(
    db_pool: &Pool<SqliteConnectionManager>,
    job: &IndexingJob,
    error_msg: &str,
) -> Result<()> {
    let conn = db_pool.get()?;
    let payload_json = serde_json::to_string(&job.payload)?;
    if let Some(id) = job.db_id {
        conn.execute(
            "UPDATE indexing_jobs 
             SET retry_count = retry_count + 1, last_error = ?1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?2",
            params![error_msg, id],
        )?;
    } else {
        conn.execute(
            "INSERT INTO indexing_jobs (payload, status, last_error) VALUES (?1, 'pending', ?2)",
            params![payload_json, error_msg],
        )?;
    }
    Ok(())
}

fn delete_job_from_db(db_pool: &Pool<SqliteConnectionManager>, job_id: i64) -> Result<()> {
    let conn = db_pool.get()?;
    conn.execute("DELETE FROM indexing_jobs WHERE id = ?1", params![job_id])?;
    Ok(())
}

// ============================================================================
// 8. ★★★ 核心修改 ★★★ 公共 API (不再管理锁)
// ============================================================================

/// (私有) 持久化任务到数据库，返回任务ID
fn persist_job_to_db(payload: &JobPayload) -> Result<i64> {
    let db_pool_lock = DB_POOL_REF.lock().unwrap();
    let db_pool = db_pool_lock.as_ref().ok_or_else(|| anyhow::anyhow!("数据库连接池未初始化"))?;
    let conn = db_pool.get()?;
    let payload_json = serde_json::to_string(payload)?;
    conn.execute(
        "INSERT INTO indexing_jobs (payload, status, retry_count) VALUES (?1, 'pending', 0)",
        params![payload_json],
    )?;
    let job_id = conn.last_insert_rowid();
    Ok(job_id)
}

/// 发送更新/保存任务
/// (注意：调用者 fs.rs 必须负责添加 app_activity_locks)
pub fn dispatch_update_job(root_path: String, relative_path: String) -> Result<()> {
    let payload = JobPayload::UpdateOrSave { root_path, relative_path };
    let job_id = persist_job_to_db(&payload)?;
    let job = IndexingJob { db_id: Some(job_id), payload };
    JOB_CHANNEL.0.send(ControlSignal::Job(job)).map_err(|e| anyhow::anyhow!("发送索引任务失败: {}", e))
}

/// 发送重命名任务
/// (注意：调用者 fs.rs 必须负责为 old_path 和 new_path 添加 app_activity_locks)
pub fn dispatch_rename_job(
    root_path: String,
    old_relative_path: String,
    new_relative_path: String,
) -> Result<()> {
    let payload = JobPayload::RenameOrMove { root_path, old_relative_path, new_relative_path };
    let job_id = persist_job_to_db(&payload)?;
    let job = IndexingJob { db_id: Some(job_id), payload };
    JOB_CHANNEL.0.send(ControlSignal::Job(job)).map_err(|e| anyhow::anyhow!("发送重命名任务失败: {}", e))
}

/// 发送删除任务
/// (注意：调用者 fs.rs 或 file_watcher.rs 必须负责添加 app_activity_locks)
pub fn dispatch_delete_job(relative_path: String) -> Result<()> {
    let payload = JobPayload::Delete { relative_path };
    let job_id = persist_job_to_db(&payload)?;
    let job = IndexingJob { db_id: Some(job_id), payload };
    JOB_CHANNEL.0.send(ControlSignal::Job(job)).map_err(|e| anyhow::anyhow!("发送删除任务失败: {}", e))
}