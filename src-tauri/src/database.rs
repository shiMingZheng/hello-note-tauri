// src-tauri/src/database.rs
use r2d2_sqlite::SqliteConnectionManager;
use std::path::Path;
use std::fs;
use anyhow::{Context, Result};
use rusqlite::Connection;

pub type DbPool = r2d2::Pool<SqliteConnectionManager>;

/// 运行数据库迁移
fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    // 迁移 1: 添加 is_pinned 字段
    let mut stmt = conn.prepare("PRAGMA table_info(files)")?;
    let columns: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .filter_map(Result::ok)
        .collect();
    
    if !columns.contains(&"is_pinned".to_string()) {
        println!("🔀 添加 is_pinned 字段...");
        conn.execute("ALTER TABLE files ADD COLUMN is_pinned INTEGER DEFAULT 0", [])?;
    }
    
    // 迁移 2: 添加 is_dir 字段
    if !columns.contains(&"is_dir".to_string()) {
        println!("🔀 添加 is_dir 字段...");
        conn.execute("ALTER TABLE files ADD COLUMN is_dir INTEGER DEFAULT 0", [])?;
    }
    
    Ok(())
}

/// 初始化数据库
pub fn init_database(app_data_dir: &Path) -> Result<DbPool> {
    let db_path = app_data_dir.join("metadata.sqlite");
    
    fs::create_dir_all(app_data_dir)
        .with_context(|| format!("创建目录失败: {}", app_data_dir.display()))?;
    
    println!("🗃️ 数据库: {}", db_path.display());
    
    let manager = SqliteConnectionManager::file(&db_path);
    let pool = r2d2::Pool::builder()
        .max_size(3)
        .min_idle(Some(1))
        .build(manager)
        .with_context(|| "连接池创建失败")?;
    
    let conn = pool.get().with_context(|| "获取连接失败")?;
    
    // 启用外键约束
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    
    // 步骤 1: 创建基础 files 表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            title TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    
    // 步骤 2: 执行迁移
    run_migrations(&conn)?;
    
    // 步骤 3: 创建其他表（一个一个执行，便于定位错误）
    create_tables_step_by_step(&conn)?;
    
    println!("✅ 数据库初始化完成");
    Ok(pool)
}

/// 逐步创建表和索引
fn create_tables_step_by_step(conn: &Connection) -> Result<(), rusqlite::Error> {
    // files 表索引
    conn.execute("CREATE INDEX IF NOT EXISTS idx_files_path ON files(path)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_files_pinned ON files(is_pinned)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_files_is_dir ON files(is_dir)", [])?;
    
    // tags 表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        )",
        [],
    )?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)", [])?;
    
    // file_tags 表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS file_tags (
            file_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (file_id, tag_id),
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )",
        [],
    )?;
    
    // history 表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY,
            file_id INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            event_date TEXT NOT NULL,
            event_datetime TEXT NOT NULL,
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
        )",
        [],
    )?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_history_datetime ON history(event_datetime)", [])?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_history_file_id ON history(file_id)", [])?;
    
    // links 表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS links (
            source_file_id INTEGER NOT NULL,
            target_file_id INTEGER NOT NULL,
            PRIMARY KEY (source_file_id, target_file_id),
            FOREIGN KEY (source_file_id) REFERENCES files(id) ON DELETE CASCADE,
            FOREIGN KEY (target_file_id) REFERENCES files(id) ON DELETE CASCADE
        )",
        [],
    )?;
    
    // indexing_jobs 表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS indexing_jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            payload TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            retry_count INTEGER NOT NULL DEFAULT 0,
            max_retries INTEGER NOT NULL DEFAULT 3,
            last_error TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_indexing_jobs_status ON indexing_jobs(status, created_at)",
        [],
    )?;
    
    Ok(())
}