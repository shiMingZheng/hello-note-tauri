// src-tauri/src/search.rs
// Tantivy 全文搜索引擎模块 - 最终修复版 v3

use anyhow::{Context, Result};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tantivy::collector::TopDocs;
use tantivy::directory::MmapDirectory;
use tantivy::query::QueryParser;
use tantivy::schema::{Field, IndexRecordOption, Schema, TextFieldIndexing, TextOptions, Value};
use tantivy::tokenizer::{LowerCaser, RemoveLongFilter, TextAnalyzer};
use tantivy::{doc, Index, IndexWriter, ReloadPolicy, TantivyDocument};
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::params;


// (全局静态 Jieba 分词器等部分保持不变)
static JIEBA_TOKENIZER: Lazy<tantivy_jieba::JiebaTokenizer> = Lazy::new(|| {
    tantivy_jieba::JiebaTokenizer {}
});

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub title: String,
    pub snippet: String,
}

pub struct SchemaFields {
    pub path: Field,
    pub title: Field,
    pub content: Field,
}

pub fn build_schema() -> (Schema, SchemaFields) {
    let mut schema_builder = Schema::builder();
    let path = schema_builder.add_text_field("path", tantivy::schema::STRING | tantivy::schema::STORED);
    let text_field_indexing = TextFieldIndexing::default()
        .set_tokenizer("jieba")
        .set_index_option(IndexRecordOption::WithFreqsAndPositions);
    let title_options = TextOptions::default()
        .set_indexing_options(text_field_indexing.clone())
        .set_stored();
    let title = schema_builder.add_text_field("title", title_options);
    let content_options = TextOptions::default().set_indexing_options(text_field_indexing);
    let content = schema_builder.add_text_field("content", content_options);
    let schema = schema_builder.build();
    let fields = SchemaFields { path, title, content };
    (schema, fields)
}

pub fn initialize_index(base_path: &Path) -> Result<Arc<Index>> {
    let index_path = base_path.join(".cheetah_index");
    if !index_path.exists() {
        fs::create_dir_all(&index_path)?;
    }
    let (schema, _) = build_schema();
    let dir = MmapDirectory::open(&index_path)?;
    let index = Index::open_or_create(dir, schema.clone())?;
    let analyzer = TextAnalyzer::builder(JIEBA_TOKENIZER.clone())
        .filter(RemoveLongFilter::limit(40))
        .filter(LowerCaser)
        .build();
    index.tokenizers().register("jieba", analyzer);
    println!("✅ Tantivy 索引已初始化: {}", index_path.display());
    Ok(Arc::new(index))
}

// =================================================================
// [核心修改区域]
// =================================================================

fn scan_disk_files_recursive(dir: &Path, files_on_disk: &mut HashSet<String>) -> Result<()> {
    if !dir.is_dir() { return Ok(()); }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if let Some(name) = path.file_name() {
            if name.to_string_lossy().starts_with('.') { continue; }
        }
        if path.is_dir() {
            scan_disk_files_recursive(&path, files_on_disk)?;
        } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
            files_on_disk.insert(path.to_string_lossy().into_owned());
        }
    }
    Ok(())
}

pub fn index_documents(
    index: &Index,
    db_pool: &Pool<SqliteConnectionManager>,
    base_path: &Path,
) -> Result<()> {
    let (_, fields) = build_schema();
    let mut conn = db_pool.get().context("从池中获取数据库连接失败")?;
    let mut index_writer: IndexWriter = index.writer(50_000_000).context("创建索引写入器失败")?;
    
    // --- 步骤 1: 获取数据库和磁盘的当前状态 ---
    let (files_in_db, files_on_disk) = {
        let mut files_in_db = HashSet::new();
        let mut stmt = conn.prepare("SELECT path FROM files")?;
        let paths_iter = stmt.query_map([], |row| row.get(0))?;
        for path in paths_iter { files_in_db.insert(path?); }
        
        let mut files_on_disk = HashSet::new();
        scan_disk_files_recursive(base_path, &mut files_on_disk)?;

        println!("🗃️ 数据库中存在 {} 条文件记录", files_in_db.len());
        println!("💿 磁盘上扫描到 {} 个 .md 文件", files_on_disk.len());
        (files_in_db, files_on_disk)
    };

    // --- 步骤 2: 同步数据库 (只增删，不修改) ---
    let tx = conn.transaction()?;
    // 找出并删除数据库中多余的记录
    let files_to_delete = files_in_db.difference(&files_on_disk).cloned().collect::<Vec<_>>();
    if !files_to_delete.is_empty() {
        println!("➖ 从数据库移除 {} 个已删除文件的记录", files_to_delete.len());
        for path in files_to_delete {
            tx.execute("DELETE FROM files WHERE path = ?1", params![path])?;
        }
    }

    // 找出并向数据库添加新文件
    let files_to_add = files_on_disk.difference(&files_in_db).cloned().collect::<Vec<_>>();
    if !files_to_add.is_empty() {
        println!("➕ 向数据库新增 {} 个文件", files_to_add.len());
        for path_str in files_to_add {
            let path = Path::new(&path_str);
            let title = extract_title_from_path(path)?;
            tx.execute("INSERT INTO files (path, title) VALUES (?1, ?2)", params![path_str, title])?;
        }
    }
    tx.commit()?;


    // --- 步骤 3: 重建全文索引 (保证内容最新) ---
    println!("🔄 正在重建全文索引...");
    index_writer.delete_all_documents().context("清空旧索引失败")?;

    for file_path_str in &files_on_disk {
        let file_path = Path::new(file_path_str);
        let content = fs::read_to_string(file_path)?;
        let title = extract_title_from_content(&content)
            .unwrap_or_else(|| extract_title_from_path(file_path).unwrap_or_else(|_| "无标题".to_string()));

        let doc = doc!(
            fields.path => file_path_str.clone(),
            fields.title => title,
            fields.content => content
        );
        index_writer.add_document(doc)?;
    }
    
    index_writer.commit().context("提交新索引失败")?;
    println!("✅ 文件索引与数据库同步完成，共处理 {} 个文件", files_on_disk.len());
    Ok(())
}


// --- 辅助函数，从路径提取标题 ---
fn extract_title_from_path(file_path: &Path) -> Result<String> {
    Ok(file_path.file_stem().and_then(|s| s.to_str()).unwrap_or("无标题").to_string())
}


// =================================================================
// 以下是单个文件操作和搜索功能
// =================================================================

pub fn update_document_index(index: &Index, db_pool: &Pool<SqliteConnectionManager>, file_path: &Path) -> Result<()> {
    let (_, fields) = build_schema();
    let mut writer: IndexWriter = index.writer(20_000_000)?;
    
    let content = fs::read_to_string(file_path).with_context(|| format!("读取文件失败: {}", file_path.display()))?;
    let title = extract_title_from_content(&content).unwrap_or_else(|| extract_title_from_path(file_path).unwrap_or_else(|_| "无标题".to_string()));
    let path_str = file_path.to_string_lossy().to_string();

    // 更新全文索引
    let path_term = tantivy::Term::from_field_text(fields.path, &path_str);
    writer.delete_term(path_term);
    let doc = doc!(
        fields.path => path_str.clone(),
        fields.title => title.clone(),
        fields.content => content
    );
    writer.add_document(doc)?;
    writer.commit()?;

    // 更新或插入数据库记录
    let conn = db_pool.get()?;
    conn.execute(
        "INSERT INTO files (path, title, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)
         ON CONFLICT(path) DO UPDATE SET title=excluded.title, updated_at=CURRENT_TIMESTAMP",
        params![path_str, title],
    )?;

    Ok(())
}

pub fn delete_document(index: &Index, file_path: &str) -> Result<()> {
    let (_, fields) = build_schema();
    let mut writer: IndexWriter = index.writer(20_000_000).context("创建索引写入器失败")?;
    let path_term = tantivy::Term::from_field_text(fields.path, file_path);
    writer.delete_term(path_term);
    writer.commit().context(format!("从全文索引删除文档 {} 失败", file_path))?;
    println!("✅ 已从全文索引中删除: {}", file_path);
    Ok(())
}

fn safe_truncate(s: &str, max_chars: usize) -> String {
    s.chars().take(max_chars).collect()
}

pub fn search(index: &Index, query: &str) -> Result<Vec<SearchResult>> {
    if query.trim().is_empty() { return Ok(Vec::new()); }
    let (_, fields) = build_schema();
    let reader = index.reader_builder().reload_policy(ReloadPolicy::OnCommitWithDelay).try_into()?;
    let searcher = reader.searcher();
    let query_parser = QueryParser::for_index(index, vec![fields.title, fields.content]);
    let parsed_query = query_parser.parse_query(query)?;
    let top_docs = searcher.search(&parsed_query, &TopDocs::with_limit(10))?;
    let mut results = Vec::new();
    for (_score, doc_address) in top_docs {
        let retrieved_doc: TantivyDocument = searcher.doc(doc_address)?;
        let path = retrieved_doc.get_first(fields.path).and_then(|v| v.as_str()).unwrap_or("").to_string();
        let title = retrieved_doc.get_first(fields.title).and_then(|v| v.as_str()).unwrap_or("无标题").to_string();
        if path.is_empty() { continue; }
        let content = fs::read_to_string(&path).unwrap_or_else(|_| "".to_string());
        let snippet = if content.chars().count() > 150 {
            format!("{}...", safe_truncate(&content, 150))
        } else {
            content
        };
        results.push(SearchResult { path, title, snippet });
    }
    println!("🔍 搜索完成，找到 {} 个结果", results.len());
    Ok(results)
}

fn extract_title_from_content(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("# ") {
            return Some(trimmed[2..].trim().to_string());
        }
    }
    None
}