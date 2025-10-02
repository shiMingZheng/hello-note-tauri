// src-tauri/src/search.rs
// Tantivy 全文搜索引擎模块 - 内存优化版

use anyhow::{Context, Result};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Arc;
use tantivy::collector::TopDocs;
use tantivy::directory::MmapDirectory;
use tantivy::query::QueryParser;
// [修改] 移除了 `STORED` 和 `STRING` 的直接导入，因为我们会更精确地使用它们
use tantivy::schema::{Field, IndexRecordOption, Schema, TextFieldIndexing, TextOptions};
use tantivy::tokenizer::{LowerCaser, RemoveLongFilter, TextAnalyzer};
use tantivy::{doc, Index, IndexWriter, ReloadPolicy, TantivyDocument};
//解决这个问题v.as_str())^^^^^^ method not found in `CompactDocValue<'_>`
use tantivy::schema::Value;

// (全局静态 Jieba 分词器保持不变)
static JIEBA_TOKENIZER: Lazy<tantivy_jieba::JiebaTokenizer> = Lazy::new(|| {
    tantivy_jieba::JiebaTokenizer {}
});

// (搜索结果结构体保持不变)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub path: String,
    pub title: String,
    pub snippet: String,
}

// (Schema 字段定义保持不变)
pub struct SchemaFields {
    pub path: Field,
    pub title: Field,
    pub content: Field,
}

/// 创建 Tantivy 索引的 Schema
pub fn build_schema() -> (Schema, SchemaFields) {
    let mut schema_builder = Schema::builder();
    
    // 路径字段：必须被存储，它是文档的唯一ID
    let path = schema_builder.add_text_field("path", tantivy::schema::STRING | tantivy::schema::STORED);
    
    // 创建一个通用的中文分词索引选项
    let text_field_indexing = TextFieldIndexing::default()
        .set_tokenizer("jieba")
        .set_index_option(IndexRecordOption::WithFreqsAndPositions);
    
    // 标题字段：需要被索引和存储（用于在结果列表中直接显示）
    let title_options = TextOptions::default()
        .set_indexing_options(text_field_indexing.clone())
        .set_stored();
    let title = schema_builder.add_text_field("title", title_options);
    
    // [核心优化] 内容字段：只索引，不存储！
    // 这将极大地减小索引文件的大小和内存占用
    let content_options = TextOptions::default()
        .set_indexing_options(text_field_indexing);
    let content = schema_builder.add_text_field("content", content_options);
    
    let schema = schema_builder.build();
    let fields = SchemaFields { path, title, content };
    
    (schema, fields)
}

/// (初始化或打开 Tantivy 索引函数保持不变)
pub fn initialize_index(base_path: &Path) -> Result<Arc<Index>> {
    let index_path = base_path.join(".cheetah_index");
    
    if !index_path.exists() {
        fs::create_dir_all(&index_path)
            .with_context(|| format!("创建索引目录失败: {}", index_path.display()))?;
    }
    
    let (schema, _) = build_schema();
    
    let index = if index_path.join("meta.json").exists() {
        let dir = MmapDirectory::open(&index_path)
            .with_context(|| format!("打开索引目录失败: {}", index_path.display()))?;
        Index::open(dir)
            .with_context(|| "打开现有索引失败")?
    } else {
        let dir = MmapDirectory::open(&index_path)
            .with_context(|| format!("创建索引目录失败: {}", index_path.display()))?;
    
		Index::open_or_create(dir, schema.clone()).with_context(|| "创建索引失败")?
    };
    
    let analyzer = TextAnalyzer::builder(JIEBA_TOKENIZER.clone())
        .filter(RemoveLongFilter::limit(40))
        .filter(LowerCaser)
        .build();
    
    index.tokenizers().register("jieba", analyzer);
    
    println!("✅ Tantivy 索引已初始化: {}", index_path.display());
    
    Ok(Arc::new(index))
}


/// (递归索引所有 Markdown 文件函数保持不变)
pub fn index_documents(index: &Index, base_path: &Path) -> Result<()> {
    let (_, fields) = build_schema();
    
    let mut index_writer: IndexWriter = index
        .writer(50_000_000)
        .with_context(|| "创建索引写入器失败")?;
    
    index_writer.delete_all_documents()
        .with_context(|| "清空索引失败")?;
    
    let mut count = 0;
    index_directory_recursive(&mut index_writer, &fields, base_path, &mut count)?;
    
    index_writer.commit()
        .with_context(|| "提交索引失败")?;
    
    println!("✅ 文件索引完成，共索引 {} 个文件", count);
    Ok(())
}

/// (递归遍历目录并索引文件函数保持不变)
fn index_directory_recursive(
    writer: &mut IndexWriter,
    fields: &SchemaFields,
    dir: &Path,
    count: &mut usize,
) -> Result<()> {
    let entries = fs::read_dir(dir)
        .with_context(|| format!("读取目录失败: {}", dir.display()))?;
    
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        
        if let Some(name) = path.file_name() {
            let name_str = name.to_string_lossy();
            if name_str.starts_with('.') {
                continue;
            }
        }
        
        let metadata = entry.metadata()?;
        
        if metadata.is_dir() {
            index_directory_recursive(writer, fields, &path, count)?;
        } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
            index_single_document(writer, fields, &path)?;
            *count += 1;
        }
    }
    
    Ok(())
}

/// (索引单个文档函数保持不变)
pub fn index_single_document(
    writer: &mut IndexWriter,
    fields: &SchemaFields,
    file_path: &Path,
) -> Result<()> {
    let content = fs::read_to_string(file_path)
        .with_context(|| format!("读取文件失败: {}", file_path.display()))?;
    
    let title = extract_title_from_content(&content)
        .unwrap_or_else(|| {
            file_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("无标题")
                .to_string()
        });
    
    let path_str = file_path.to_string_lossy().to_string();
    
    let path_term = tantivy::Term::from_field_text(fields.path, &path_str);
    writer.delete_term(path_term);
    
    let doc = doc!(
        fields.path => path_str,
        fields.title => title,
        fields.content => content
    );
    
    writer.add_document(doc)
        .with_context(|| format!("索引文档失败: {}", file_path.display()))?;
    
    Ok(())
}

/// (更新单个文件的索引函数保持不变)
pub fn update_document_index(index: &Index, file_path: &Path) -> Result<()> {
    let (_, fields) = build_schema();
    
    let mut writer: IndexWriter = index.writer(5_000_000)?;
    index_single_document(&mut writer, &fields, file_path)?;
    writer.commit()?;
    
    Ok(())
}

/// (从索引中删除文档函数保持不变)
pub fn delete_document(index: &Index, file_path: &str) -> Result<()> {
    let (_, fields) = build_schema();
    
    let mut writer: IndexWriter = index.writer(5_000_000)
        .with_context(|| "创建索引写入器失败")?;
    
    let path_term = tantivy::Term::from_field_text(fields.path, file_path);
    writer.delete_term(path_term);
    
    writer.commit()
        .with_context(|| format!("删除文档失败: {}", file_path))?;
    
    println!("✅ 已从索引中删除: {}", file_path);
    Ok(())
}

/// (安全地截取字符串函数保持不变)
fn safe_truncate(s: &str, max_chars: usize) -> String {
    s.chars().take(max_chars).collect()
}


/// 执行搜索 - [核心优化]
pub fn search(index: &Index, query: &str) -> Result<Vec<SearchResult>> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    
    let (_, fields) = build_schema();
    
    let reader = index
        .reader_builder()
        .reload_policy(ReloadPolicy::OnCommitWithDelay)
        .try_into()
        .with_context(|| "创建索引读取器失败")?;
    
    let searcher = reader.searcher();
    
    let query_parser = QueryParser::for_index(
        index,
        vec![fields.title, fields.content],
    );
    
    let parsed_query = query_parser
        .parse_query(query)
        .with_context(|| format!("解析查询失败: {}", query))?;
    
    let top_docs = searcher
        .search(&parsed_query, &TopDocs::with_limit(10))
        .with_context(|| "执行搜索失败")?;
    
    let mut results = Vec::new();
    
    for (_score, doc_address) in top_docs {
         // 安全获取文档
        let retrieved_doc: TantivyDocument = match searcher.doc(doc_address) {
            Ok(doc) => doc,
            Err(e) => {
                eprintln!("获取文档失败: {}", e);
                continue;
            }
        };
        
        // 安全提取路径
        let path = retrieved_doc
            .get_first(fields.path)
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
		
        let title = retrieved_doc.get_first(fields.title).and_then(|v| v.as_str()).unwrap_or("无标题").to_string();
        
        if path.is_empty() {
            continue;
        }
        
        // [核心优化] 按需从磁盘读取文件内容来生成摘要
        // 我们不再从索引中读取内容，因为我们已经不再存储它了
        let content = fs::read_to_string(&path).unwrap_or_else(|_| "".to_string());
        
        // 生成摘要
        let snippet = if content.chars().count() > 150 {
            format!("{}...", safe_truncate(&content, 150))
        } else {
            content
        };
        
        results.push(SearchResult {
            path,
            title,
            snippet,
        });
    }
    
    println!("🔍 搜索完成，找到 {} 个结果", results.len());
    Ok(results)
}

/// (从 Markdown 内容中提取标题函数保持不变)
fn extract_title_from_content(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("# ") {
            return Some(trimmed[2..].trim().to_string());
        }
    }
    None
}