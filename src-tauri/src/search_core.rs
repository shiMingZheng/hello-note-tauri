// src-tauri/src/search_core.rs
use crate::commands::path_utils::{to_absolute_path, to_relative_path};
use anyhow::{Context, Result};
use once_cell::sync::Lazy;
use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tantivy::collector::TopDocs;
use tantivy::directory::MmapDirectory;
use tantivy::query::QueryParser;
use tantivy::schema::{
    Field, IndexRecordOption, Schema, TextFieldIndexing, TextOptions, Value, INDEXED, STORED,
};
use tantivy::snippet::SnippetGenerator;
use tantivy::tokenizer::{LowerCaser, RemoveLongFilter, TextAnalyzer};
use tantivy::{doc, Index, IndexWriter, ReloadPolicy, TantivyDocument};

static JIEBA_TOKENIZER: Lazy<tantivy_jieba::JiebaTokenizer> =
    Lazy::new(|| tantivy_jieba::JiebaTokenizer {});

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub title: String,
    pub snippet: String,
}
pub struct SchemaFields {
    pub id: Field,
    pub path: Field,
    pub title: Field,
    pub content: Field,
}

pub fn build_schema() -> (Schema, SchemaFields) {
    let mut schema_builder = Schema::builder();
    let id = schema_builder.add_u64_field("id", INDEXED | STORED);
    let path = schema_builder.add_text_field("path", tantivy::schema::STRING | STORED);
    let text_field_indexing = TextFieldIndexing::default()
        .set_tokenizer("jieba")
        .set_index_option(IndexRecordOption::WithFreqsAndPositions);
    let title_options = TextOptions::default()
        .set_indexing_options(text_field_indexing.clone())
        .set_stored();
    let title = schema_builder.add_text_field("title", title_options);

    let content_options = TextOptions::default()
        .set_indexing_options(text_field_indexing)
        .set_stored();
    let content = schema_builder.add_text_field("content", content_options);

    let schema = schema_builder.build();
    let fields = SchemaFields {
        id,
        path,
        title,
        content,
    };
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
    Ok(Arc::new(index))
}

fn scan_disk_files_recursive(
    dir: &Path,
    base_path: &Path,
    files_on_disk: &mut HashSet<String>,
) -> Result<()> {
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let absolute_path = entry.path();
        if let Some(name) = absolute_path.file_name().and_then(|s| s.to_str()) {
            if name.starts_with('.') {
                continue;
            }
        }
        if absolute_path.is_dir() {
            scan_disk_files_recursive(&absolute_path, base_path, files_on_disk)?;
        } else if absolute_path.extension().and_then(|s| s.to_str()) == Some("md") {
            if let Some(relative_path) = to_relative_path(base_path, &absolute_path) {
                files_on_disk.insert(relative_path);
            }
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
    let conn = db_pool.get().context("从池中获取数据库连接失败")?;
    let mut index_writer: IndexWriter = index.writer(50_000_000)?;

    index_writer.delete_all_documents()?;
    let mut stmt = conn.prepare("SELECT id, path FROM files")?;
    let file_iter =
        stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))?;
    for file_result in file_iter {
        let (id, relative_path_str) = file_result?;
        let absolute_path = to_absolute_path(base_path, Path::new(&relative_path_str));
        let content = fs::read_to_string(absolute_path).unwrap_or_default();
        // [修正] 使用正确的函数名
        let title = extract_title_from_path(&relative_path_str);

        index_writer.add_document(doc!(
            fields.id => id as u64,
            fields.path => relative_path_str,
            fields.title => title,
            fields.content => content
        ))?;
    }
    index_writer.commit()?;
    Ok(())
}

//这个函数只对更新内容有效；重命名他是不会删除旧的路径的索引的，除非传入一个旧的路径
pub fn update_document_index(
    index: &Index,
    db_pool: &Pool<SqliteConnectionManager>,
    base_path: &Path,
    relative_path: &Path,
) -> Result<()> {
    let (_, fields) = build_schema();
    let mut writer: IndexWriter = index.writer(20_000_000)?;
    let conn = db_pool.get()?;
    let absolute_path = to_absolute_path(base_path, relative_path);
    let content = fs::read_to_string(&absolute_path)
        .with_context(|| format!("读取文件失败: {}", absolute_path.display()))?;
    let relative_path_str = relative_path.to_string_lossy().to_string();
    // [修正] 使用正确的函数名
    let title = extract_title_from_path(&relative_path_str);
    let file_id: i64 = conn.query_row(
        "SELECT id FROM files WHERE path = ?1",
        params![relative_path_str],
        |row| row.get(0),
    )?;
    let path_term = tantivy::Term::from_field_text(fields.path, &relative_path_str);
    writer.delete_term(path_term);
    writer.add_document(doc!(
        fields.id => file_id as u64,
        fields.path => relative_path_str.clone(),
        fields.title => title,
        fields.content => content
    ))?;
    writer.commit()?;
    Ok(())
}

//专门为重命名设计的删除索引
pub fn update_document_index_for_rename(
    index: &Index,
    db_pool: &Pool<SqliteConnectionManager>,
    base_path: &Path,
    relative_path_old: &Path,
	relative_path_new: &Path,
) -> Result<()> {
    let (_, fields) = build_schema();
    let mut writer: IndexWriter = index.writer(20_000_000)?;
    let conn = db_pool.get()?;
    let absolute_path = to_absolute_path(base_path, relative_path_new);
    let content = fs::read_to_string(&absolute_path)
        .with_context(|| format!("读取文件失败: {}", absolute_path.display()))?;
    let relative_path_str_old = relative_path_old.to_string_lossy().to_string();
	let relative_path_str_new = relative_path_new.to_string_lossy().to_string();
    // [修正] 使用正确的函数名
    let title = extract_title_from_path(&relative_path_str_new);
	 println!("🔍 [索引] 查询fileid'，用路径relative_path_str_new: {}", relative_path_str_new);
    let file_id: i64 = conn.query_row(
        "SELECT id FROM files WHERE path = ?1",
        params![relative_path_str_new],
        |row| row.get(0),
    )?;
    let path_term = tantivy::Term::from_field_text(fields.path, &relative_path_str_old);
    writer.delete_term(path_term);
    writer.add_document(doc!(
        fields.id => file_id as u64,
        fields.path => relative_path_str_new.clone(),
        fields.title => title,
        fields.content => content
    ))?;
    writer.commit()?;
    Ok(())
}

pub fn search(index: &Index, query: &str) -> Result<Vec<SearchResult>> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let (_, fields) = build_schema();
    let reader = index
        .reader_builder()
        .reload_policy(ReloadPolicy::OnCommitWithDelay)
        .try_into()?;
    let searcher = reader.searcher();

    let query_parser = QueryParser::for_index(index, vec![fields.title, fields.content]);
    let parsed_query = query_parser.parse_query(query)?;
    let top_docs = searcher.search(&parsed_query, &TopDocs::with_limit(10))?;

    let mut snippet_generator = SnippetGenerator::create(&searcher, &parsed_query, fields.content)?;
    snippet_generator.set_max_num_chars(120);

    let mut results = Vec::new();
    for (_score, doc_address) in top_docs {
        let retrieved_doc: TantivyDocument = searcher.doc(doc_address)?;
        let path = retrieved_doc
            .get_first(fields.path)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        if path.is_empty() {
            continue;
        }
        
        // [修正] 使用正确的函数名和变量名
        let title = extract_title_from_path(&path);

        let snippet = snippet_generator.snippet_from_doc(&retrieved_doc);
        let snippet_html = snippet
            .to_html()
            .replace("<b>", "<mark>")
            .replace("</b>", "</mark>");

        results.push(SearchResult {
            path,
            title,
            snippet: snippet_html,
        });
    }
    Ok(results)
}

pub fn delete_document(index: &Index, relative_path: &str) -> Result<()> {
    let (_, fields) = build_schema();
    let mut writer: IndexWriter = index.writer(20_000_000)?;
    let path_term = tantivy::Term::from_field_text(fields.path, relative_path);
    writer.delete_term(path_term);
    writer.commit()?;
    Ok(())
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

// [修正] 重命名函数，并简化、修正其实现
fn extract_title_from_path(path_str: &str) -> String {
    Path::new(path_str)
        .file_stem() // 获取文件名（不含扩展名），返回 Option<&OsStr>
        .and_then(|s| s.to_str()) // 将 &OsStr 转换为 &str，返回 Option<&str>
        .unwrap_or("") // 如果转换失败，则提供一个默认的空 &str
        .to_string() // 将 &str 转换为拥有的 String 并返回
}