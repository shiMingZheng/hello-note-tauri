// src-tauri/src/indexing_jobs.rs
// CheetahNote 异步索引任务系统
use crossbeam_channel::{unbounded, Sender, Receiver};
use once_cell::sync::Lazy;
use serde::{Serialize, Deserialize};
use std::sync::Arc;
use tantivy::Index;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::{params, OptionalExtension}; // [修复] 添加 OptionalExtension
use anyhow::Result;
use crate::database::DbPool;
use std::sync::Mutex;
use crate::commands::path_utils::to_absolute_path;
use std::fs::metadata;
use std::time::UNIX_EPOCH;



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
// 1. 任务载荷定义
// ============================================================================

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum JobPayload {
    /// 更新或保存文件
    UpdateOrSave { 
        root_path: String,
        relative_path: String 
    },
    
    /// 重命名或移动文件
    RenameOrMove { 
        root_path: String,
        old_relative_path: String,
        new_relative_path: String 
    },
    
    /// 删除文件
    Delete { 
        relative_path: String 
    },
}

// ============================================================================
// 2. 索引任务结构
// ============================================================================

#[derive(Debug)]
pub struct IndexingJob {
    /// 数据库ID（从数据库加载的任务有ID，实时任务为None）
    pub db_id: Option<i64>,
    
    /// 任务载荷
    pub payload: JobPayload,
}

// ============================================================================
// 3. 控制信号
// ============================================================================

pub enum ControlSignal {
    Job(IndexingJob),
    Shutdown,
}

// ============================================================================
// 4. 全局通道
// ============================================================================

pub static JOB_CHANNEL: Lazy<(Sender<ControlSignal>, Receiver<ControlSignal>)> = 
    Lazy::new(|| unbounded());

// ============================================================================
// 5. 后台 Worker 启动函数
// ============================================================================

pub fn start_background_worker(
    db_pool: Pool<SqliteConnectionManager>,
    index: Arc<Index>,
) -> std::thread::JoinHandle<()> {
    let receiver = JOB_CHANNEL.1.clone();

    std::thread::spawn(move || {
        println!("🔍 [索引Worker] 启动成功");

        // 步骤A: 处理数据库中的遗留任务
        if let Err(e) = process_pending_db_jobs(&db_pool, &index) {
            eprintln!("❌ [索引Worker] 处理遗留任务失败: {}", e);
        }

        // 步骤B: 进入主循环，监听实时任务
        loop {
            match receiver.recv() {
                Ok(ControlSignal::Job(job)) => {
					  println!("🔍 [索引Worker] 接收到任务: {:?}", job.payload); // ✅ 添加这行
                    // 处理任务
                    let result = process_job(&db_pool, &index, &job.payload);

                    if let Err(e) = result {
                        eprintln!(
                            "❌ [索引Worker] 任务处理失败: {:?}. 错误: {}",
                            job.payload, e
                        );
                        
                        // 持久化失败的任务
                        if let Err(persist_err) = persist_failed_job_to_db(&db_pool, &job, &e.to_string()) {
                            eprintln!(
                                "❌ [索引Worker] 持久化失败任务时出错: {}",
                                persist_err
                            );
                        }
                    } else if let Some(id) = job.db_id {
                        // 如果任务来自数据库，成功后删除
                        if let Err(del_err) = delete_job_from_db(&db_pool, id) {
                            eprintln!(
                                "⚠️ [索引Worker] 删除已完成任务失败 (ID={}): {}",
                                id, del_err
                            );
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
// 6. 任务处理逻辑
// ============================================================================

fn process_job(
    db_pool: &Pool<SqliteConnectionManager>,
    index: &Arc<Index>,
    payload: &JobPayload,
) -> Result<()> {
    use std::path::Path;
    use std::fs::metadata;
    use std::time::UNIX_EPOCH;

    match payload {
        JobPayload::UpdateOrSave { root_path, relative_path } => {
			println!("🔍 [索引] 更新/保存: {}", relative_path);
			
			// 步骤1: 执行索引
			update_document_index(
				index,
				db_pool,
				Path::new(root_path),
				Path::new(relative_path),
			)?;
			
			// 步骤2: ✅ 更新 files 表的 indexed 和 last_modified
			let conn = db_pool.get()?;
			let absolute_path = crate::commands::path_utils::to_absolute_path(
				Path::new(root_path),
				Path::new(relative_path)
			);
			
			// ✅ 获取 mtime，如果失败则使用当前时间戳
			let mtime = if let Ok(meta) = metadata(&absolute_path) {
				if let Ok(modified) = meta.modified() {
					if let Ok(duration) = modified.duration_since(UNIX_EPOCH) {
						duration.as_secs() as i64
					} else {
						// 如果时间早于 UNIX_EPOCH，使用当前时间
						std::time::SystemTime::now()
							.duration_since(UNIX_EPOCH)
							.unwrap()
							.as_secs() as i64
					}
				} else {
					// 获取修改时间失败，使用当前时间
					std::time::SystemTime::now()
						.duration_since(UNIX_EPOCH)
						.unwrap()
						.as_secs() as i64
				}
			} else {
				// 读取文件元数据失败，使用当前时间
				eprintln!("⚠️ [索引] 无法获取文件元数据: {}", absolute_path.display());
				std::time::SystemTime::now()
					.duration_since(UNIX_EPOCH)
					.unwrap()
					.as_secs() as i64
			};
			
			// ✅ 无论如何都要更新 indexed 状态
			conn.execute(
				"UPDATE files SET indexed = 1, last_modified = ?1 WHERE path = ?2",
				params![mtime, relative_path],
			)?;
			
			println!("✅ [索引] 已更新数据库状态: {} (mtime={})", relative_path, mtime);
		}
        
        JobPayload::RenameOrMove { root_path, old_relative_path, new_relative_path } => {
			println!(
				"🔍 [索引] 重命名: {} -> {}",
				old_relative_path, new_relative_path
			);
			
			// 步骤1: 执行索引
			update_document_index_for_rename(
				index,
				db_pool,
				Path::new(root_path),
				Path::new(old_relative_path),
				Path::new(new_relative_path),
			)?;
			
			// 步骤2: 更新数据库
			let conn = db_pool.get()?;
			let absolute_path = crate::commands::path_utils::to_absolute_path(
				Path::new(root_path),
				Path::new(new_relative_path)
			);
			
			// ✅ 获取 mtime，如果失败则使用当前时间戳
			let mtime = if let Ok(meta) = metadata(&absolute_path) {
				if let Ok(modified) = meta.modified() {
					if let Ok(duration) = modified.duration_since(UNIX_EPOCH) {
						duration.as_secs() as i64
					} else {
						eprintln!("⚠️ [索引] 文件时间早于 UNIX_EPOCH: {}", absolute_path.display());
						std::time::SystemTime::now()
							.duration_since(UNIX_EPOCH)
							.unwrap()
							.as_secs() as i64
					}
				} else {
					eprintln!("⚠️ [索引] 无法获取文件修改时间: {}", absolute_path.display());
					std::time::SystemTime::now()
						.duration_since(UNIX_EPOCH)
						.unwrap()
						.as_secs() as i64
				}
			} else {
				eprintln!("⚠️ [索引] 无法获取文件元数据: {}", absolute_path.display());
				std::time::SystemTime::now()
					.duration_since(UNIX_EPOCH)
					.unwrap()
					.as_secs() as i64
			};
			
			conn.execute(
				"UPDATE files SET indexed = 1, last_modified = ?1 WHERE path = ?2",
				params![mtime, new_relative_path],
			)?;
			
			println!("✅ [索引] 已更新数据库状态: {} (mtime={})", new_relative_path, mtime);
		}
        
        JobPayload::Delete { relative_path } => {
            println!("🔍 [索引] 删除: {}", relative_path);
            
            // 删除操作不需要更新 files 表,因为记录已经在 fs.rs 中被删除了
            delete_document(index, relative_path)?;
        }
    }

    Ok(())
}

// ============================================================================
// 7. 数据库队列辅助函数
// ============================================================================

/// 处理数据库中所有待处理的任务
/// 处理数据库中所有待处理的任务
fn process_pending_db_jobs(
    db_pool: &Pool<SqliteConnectionManager>,
    index: &Arc<Index>,
) -> Result<()> {
    let conn = db_pool.get()?;
    
    println!("🔍 [索引Worker] 检查遗留任务...");

    loop {
        // 查询一条待处理的任务
        let job_opt: Option<(i64, String)> = conn
            .query_row(
                "SELECT id, payload FROM indexing_jobs 
                 WHERE status = 'pending' AND retry_count < max_retries
                 ORDER BY created_at ASC LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)), // [修复] 直接在这里返回 String
            )
            .optional()?;

        match job_opt {
            Some((id, payload_json)) => { // [修复] payload_json 现在是 String 类型
                println!("🔍 [索引Worker] 处理遗留任务 ID={}", id);

                // 反序列化载荷
                let payload: JobPayload = serde_json::from_str(&payload_json)?;

                // 处理任务
                let result = process_job(db_pool, index, &payload);

                if let Err(e) = result {
                    eprintln!("❌ [索引Worker] 遗留任务失败 ID={}: {}", id, e);

                    // 增加重试次数
                    conn.execute(
                        "UPDATE indexing_jobs 
                         SET retry_count = retry_count + 1,
                             last_error = ?1,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?2",
                        params![e.to_string(), id],
                    )?;

                    // 检查是否超过最大重试次数
                    let retry_count: i32 = conn.query_row(
                        "SELECT retry_count FROM indexing_jobs WHERE id = ?1",
                        params![id],
                        |row| row.get(0),
                    )?;

                    let max_retries: i32 = conn.query_row(
                        "SELECT max_retries FROM indexing_jobs WHERE id = ?1",
                        params![id],
                        |row| row.get(0),
                    )?;

                    if retry_count >= max_retries {
                        conn.execute(
                            "UPDATE indexing_jobs 
                             SET status = 'failed',
                                 updated_at = CURRENT_TIMESTAMP
                             WHERE id = ?1",
                            params![id],
                        )?;
                        eprintln!("⚠️ [索引Worker] 任务 ID={} 已标记为失败", id);
                    }
                } else {
                    // 成功后删除任务
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

/// 持久化失败的任务到数据库
/// 持久化失败的任务到数据库
fn persist_failed_job_to_db(
    db_pool: &Pool<SqliteConnectionManager>,
    job: &IndexingJob,
    error_msg: &str,
) -> Result<()> {
    let conn = db_pool.get()?;
    let payload_json = serde_json::to_string(&job.payload)?;

    if let Some(id) = job.db_id {
        // 更新现有任务
        conn.execute(
            "UPDATE indexing_jobs 
             SET retry_count = retry_count + 1,
                 last_error = ?1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?2",
            params![error_msg, id],
        )?;
    } else {
        // 插入新任务
        conn.execute(
            "INSERT INTO indexing_jobs (payload, status, last_error)
             VALUES (?1, 'pending', ?2)",
            params![payload_json, error_msg],
        )?;
    }

    Ok(())
}

/// 从数据库删除已完成的任务
fn delete_job_from_db(
    db_pool: &Pool<SqliteConnectionManager>,
    job_id: i64,
) -> Result<()> {
    let conn = db_pool.get()?;
    conn.execute("DELETE FROM indexing_jobs WHERE id = ?1", params![job_id])?;
    Ok(())
}

// ============================================================================
// 8. 公共 API：发送索引任务
// ============================================================================

/// 发送更新/保存任务
pub fn dispatch_update_job(root_path: String, relative_path: String) -> Result<()> {
    let payload = JobPayload::UpdateOrSave {
        root_path,
        relative_path,
    };
    
    // [关键修改] 先持久化到数据库
    let job_id = persist_job_to_db(&payload)?;
    
    // 然后发送到内存通道
    let job = IndexingJob {
        db_id: Some(job_id),
        payload,
    };
    
    JOB_CHANNEL
        .0
        .send(ControlSignal::Job(job))
        .map_err(|e| anyhow::anyhow!("发送索引任务失败: {}", e))?;

    Ok(())
}

/// 发送重命名任务
pub fn dispatch_rename_job(
    root_path: String,
    old_relative_path: String,
    new_relative_path: String,
) -> Result<()> {
    let payload = JobPayload::RenameOrMove {
        root_path,
        old_relative_path,
        new_relative_path,
    };
    
    // [关键修改] 先持久化到数据库
    let job_id = persist_job_to_db(&payload)?;
    
    // 然后发送到内存通道
    let job = IndexingJob {
        db_id: Some(job_id),
        payload,
    };

    JOB_CHANNEL
        .0
        .send(ControlSignal::Job(job))
        .map_err(|e| anyhow::anyhow!("发送重命名任务失败: {}", e))?;

    Ok(())
}

/// 发送删除任务
pub fn dispatch_delete_job(relative_path: String) -> Result<()> {
    let payload = JobPayload::Delete { relative_path };
    
    // [关键修改] 先持久化到数据库
    let job_id = persist_job_to_db(&payload)?;
    
    // 然后发送到内存通道
    let job = IndexingJob {
        db_id: Some(job_id),
        payload,
    };

    JOB_CHANNEL
        .0
        .send(ControlSignal::Job(job))
        .map_err(|e| anyhow::anyhow!("发送删除任务失败: {}", e))?;

    Ok(())
}
// ============================================================================
// [新增] 持久化函数
// ============================================================================

/// 立即持久化任务到数据库，返回任务ID
fn persist_job_to_db(payload: &JobPayload) -> Result<i64> {
    let db_pool_lock = DB_POOL_REF.lock().unwrap();
    let db_pool = db_pool_lock.as_ref()
        .ok_or_else(|| anyhow::anyhow!("数据库连接池未初始化"))?;
    
    let conn = db_pool.get()?;
    let payload_json = serde_json::to_string(payload)?;
    
    conn.execute(
        "INSERT INTO indexing_jobs (payload, status, retry_count)
         VALUES (?1, 'pending', 0)",
        params![payload_json],
    )?;
    
    let job_id = conn.last_insert_rowid();
    Ok(job_id)
}
