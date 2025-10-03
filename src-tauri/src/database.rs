// src-tauri/src/database.rs

use r2d2_sqlite::SqliteConnectionManager;
use std::path::Path;
use std::fs;
use anyhow::{Context, Result};

// 定义一个类型别名，方便使用
pub type DbPool = r2d2::Pool<SqliteConnectionManager>;

/// 初始化数据库并创建表结构
pub fn init_database(app_data_dir: &Path) -> Result<DbPool> {
    // 将数据库文件放在应用的数据目录中
    let db_path = app_data_dir.join("metadata.sqlite");

    // 确保目录存在
    fs::create_dir_all(app_data_dir)
        .with_context(|| format!("创建应用数据目录失败: {}", app_data_dir.display()))?;
    
    println!("🗃️ 数据库路径: {}", db_path.display());

    // 创建连接池
    let manager = SqliteConnectionManager::file(db_path);
    let pool = r2d2::Pool::new(manager)
        .with_context(|| "创建数据库连接池失败")?;

    // 获取一个连接并初始化表
    let conn = pool.get().with_context(|| "获取数据库连接失败")?;

    // 创建 files 表，用于存储文件元数据
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS files (
            id          INTEGER PRIMARY KEY,
            path        TEXT NOT NULL UNIQUE,
            title       TEXT,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_files_path ON files (path);
        "
    ).with_context(|| "创建 'files' 表失败")?;

    // 创建 tags 表
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS tags (
            id      INTEGER PRIMARY KEY,
            name    TEXT NOT NULL UNIQUE
        );
        CREATE INDEX IF NOT EXISTS idx_tags_name ON tags (name);
        "
    ).with_context(|| "创建 'tags' 表失败")?;

    // 创建 file_tags 关联表 (多对多关系)
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS file_tags (
            file_id     INTEGER,
            tag_id      INTEGER,
            FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
            PRIMARY KEY (file_id, tag_id)
        );
        "
    ).with_context(|| "创建 'file_tags' 表失败")?;
	
	// [新增] 创建 history 表，用于记录文件编辑历史
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS history (
    id              INTEGER PRIMARY KEY,
    file_path       TEXT NOT NULL,
    event_type      TEXT NOT NULL, -- 'created' 或 'edited'
    snippet         TEXT,          -- 概要 (非空第一行)
    event_date      TEXT NOT NULL, -- 事件发生的日期 'YYYY-MM-DD'
    event_datetime  TEXT NOT NULL  -- [新增] 精确的日期时间
);
CREATE INDEX IF NOT EXISTS idx_history_datetime ON history (event_datetime); -- [修改] 索引新的时间戳字段
        "
    ).with_context(|| "创建 'history' 表失败")?;

    println!("✅ 数据库表结构初始化/验证完成");
    
    Ok(pool)
}