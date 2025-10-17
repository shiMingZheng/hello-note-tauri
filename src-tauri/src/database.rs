// src-tauri/src/database.rs

use r2d2_sqlite::SqliteConnectionManager;
use std::path::Path;
use std::fs;
use anyhow::{Context, Result};
use rusqlite::Connection;

pub type DbPool = r2d2::Pool<SqliteConnectionManager>;

/// 运行数据库迁移的函数
fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    // === 迁移 1: 为 files 表添加 is_pinned 字段 ===
    let mut stmt = conn.prepare("PRAGMA table_info(files)")?;
    let column_exists = stmt.query_map([], |row| {
        let column_name: String = row.get(1)?;
        Ok(column_name)
    })?.any(|col| col.as_deref() == Ok("is_pinned"));

    if !column_exists {
        println!("🔀 迁移数据库：正在为 'files' 表添加 'is_pinned' 字段...");
        conn.execute(
            "ALTER TABLE files ADD COLUMN is_pinned INTEGER DEFAULT 0",
            [],
        )?;
        println!("✅ 'is_pinned' 字段添加完成！");
    }

    // === 迁移 2: 为 files 表添加 is_dir 字段 ===
    let mut stmt = conn.prepare("PRAGMA table_info(files)")?;
    let has_is_dir = stmt.query_map([], |row| {
        let column_name: String = row.get(1)?;
        Ok(column_name)
    })?.any(|col| col.as_deref() == Ok("is_dir"));

    if !has_is_dir {
        println!("🔀 迁移数据库：正在为 'files' 表添加 'is_dir' 字段...");
        conn.execute(
            "ALTER TABLE files ADD COLUMN is_dir INTEGER DEFAULT 0",
            [],
        )?;
        println!("✅ 'is_dir' 字段添加完成！");
    }
	
	    // === 迁移 3: 为 files 表添加 last_modified 字段.文件修改时间戳(秒级Unix时间戳) ===
    let mut stmt = conn.prepare("PRAGMA table_info(files)")?;
    let column_exists = stmt.query_map([], |row| {
        let column_name: String = row.get(1)?;
        Ok(column_name)
    })?.any(|col| col.as_deref() == Ok("last_modified"));

    if !column_exists {
        println!("🔀 迁移数据库：正在为 'files' 表添加 'last_modified' 字段...");
        conn.execute(
            "ALTER TABLE files ADD COLUMN last_modified INTEGER DEFAULT 0;",
            [],
        )?;
        println!("✅ 'last_modified' 字段添加完成！");
    }
	
		    // === 迁移 4: 为 files 表添加 last_modified 字段 ===
    let mut stmt = conn.prepare("PRAGMA table_info(files)")?;
    let column_exists = stmt.query_map([], |row| {
        let column_name: String = row.get(1)?;
        Ok(column_name)
    })?.any(|col| col.as_deref() == Ok("indexed"));

    if !column_exists {
		//-- 字段2: 索引完成标记(0=未索引, 1=已索引)
        println!("🔀 迁移数据库：正在为 'files' 表添加 'indexed' 字段...");
        conn.execute(
            "ALTER TABLE files ADD COLUMN indexed INTEGER DEFAULT 0;",
            [],
        )?;
        println!("✅ 'indexed' 字段添加完成！");
    }

	

    Ok(())
}


/// 初始化数据库并创建表结构
pub fn init_database(app_data_dir: &Path) -> Result<DbPool> {
    let db_path = app_data_dir.join("metadata.sqlite");

    fs::create_dir_all(app_data_dir)
        .with_context(|| format!("创建应用数据目录失败: {}", app_data_dir.display()))?;
    
    println!("🗃️ 数据库路径: {}", db_path.display());

    let manager = SqliteConnectionManager::file(db_path);
    let pool = r2d2::Pool::new(manager)
        .with_context(|| "创建数据库连接池失败")?;

    let conn = pool.get().with_context(|| "获取数据库连接失败")?;

    // --- 采用最安全的、分步的初始化流程 ---

    // 步骤 1: 总是先尝试创建不带新字段的旧版 `files` 表
    // 这对于新老数据库都是安全的
    conn.execute(
        "CREATE TABLE IF NOT EXISTS files (
            id          INTEGER PRIMARY KEY,
            path        TEXT NOT NULL UNIQUE,
            title       TEXT,
            created_at  TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at  TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    ).with_context(|| "创建 'files' 基础表失败")?;

    // 步骤 2: 执行迁移逻辑，确保新字段存在
    run_migrations(&conn).with_context(|| "数据库迁移失败")?;

    // 步骤 3: 现在，表结构已确定，再统一创建所有的表和索引
    conn.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_files_path ON files (path);
        CREATE INDEX IF NOT EXISTS idx_files_pinned ON files (is_pinned);
        CREATE INDEX IF NOT EXISTS idx_files_is_dir ON files (is_dir);
		CREATE INDEX IF NOT EXISTS idx_files_indexed ON files (indexed);

        CREATE TABLE IF NOT EXISTS tags (
            id      INTEGER PRIMARY KEY,
            name    TEXT NOT NULL UNIQUE
        );
        CREATE INDEX IF NOT EXISTS idx_tags_name ON tags (name);

        CREATE TABLE IF NOT EXISTS file_tags (
            file_id     INTEGER,
            tag_id      INTEGER,
            FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE,
            PRIMARY KEY (file_id, tag_id)
        );
         CREATE TABLE IF NOT EXISTS history (
            id              INTEGER PRIMARY KEY,
            file_id         INTEGER NOT NULL,
            event_type      TEXT NOT NULL,
            event_date      TEXT NOT NULL,
            event_datetime  TEXT NOT NULL,
            FOREIGN KEY (file_id) REFERENCES files (id) ON DELETE CASCADE
        );
		CREATE INDEX IF NOT EXISTS idx_history_datetime ON history (event_datetime);
        CREATE INDEX IF NOT EXISTS idx_history_file_id ON history (file_id);
		
		/* links 表 */
        CREATE TABLE IF NOT EXISTS links (
            source_file_id  INTEGER,
            target_file_id  INTEGER,
            FOREIGN KEY (source_file_id) REFERENCES files (id) ON DELETE CASCADE,
            FOREIGN KEY (target_file_id) REFERENCES files (id) ON DELETE CASCADE,
            PRIMARY KEY (source_file_id, target_file_id)
        );
		
        /* [新增] 索引任务队列表 */
		CREATE TABLE IF NOT EXISTS indexing_jobs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			payload TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			retry_count INTEGER NOT NULL DEFAULT 0,
			max_retries INTEGER NOT NULL DEFAULT 3,
			last_error TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		
		CREATE INDEX IF NOT EXISTS idx_indexing_jobs_status 
			ON indexing_jobs (status, created_at);
				"
			).with_context(|| "创建索引和其他表结构失败")?;
		

    println!("✅ 数据库表结构初始化/验证完成");
    
    Ok(pool)
}