#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use pulldown_cmark::{html, Parser};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Builder, Manager};

// ========================================
// 简单的内存搜索索引
// ========================================

#[derive(Default)]
struct SearchIndex {
    documents: Vec<Document>,
}

#[derive(Clone, Debug)]
struct Document {
    path: String,
    title: String,
    content: String,
}

impl SearchIndex {
    fn clear(&mut self) {
        self.documents.clear();
    }

    fn add_document(&mut self, path: String, title: String, content: String) {
        self.documents.push(Document { path, title, content });
    }

    fn search(&self, query: &str) -> Vec<SearchResult> {
        let query_lower = query.to_lowercase();
        let mut results = Vec::new();

        for doc in &self.documents {
            let content_lower = doc.content.to_lowercase();
            let title_lower = doc.title.to_lowercase();

            if title_lower.contains(&query_lower) || content_lower.contains(&query_lower) {
                let snippet = self.generate_snippet(&doc.content, &query_lower);

                results.push(SearchResult {
                    path: doc.path.clone(),
                    title: doc.title.clone(),
                    snippet,
                });
            }
        }
        results
    }

    // ==================================================================
    // 修正后的 generate_snippet 函数
    // ==================================================================
    fn generate_snippet(&self, content: &str, query: &str) -> String {
        let content_lower = content.to_lowercase();
        
        // 查找匹配项的起始字节位置
        if let Some(pos) = content_lower.find(query) {
            // --- 关键修改：安全地查找字符边界 ---
            let snippet_start_byte = pos.saturating_sub(50);
            let snippet_end_byte = (pos + query.len() + 50).min(content.len());

            // 找到`snippet_start_byte`之后最近的字符边界作为安全的起始点
            let mut safe_start = snippet_start_byte;
            while !content.is_char_boundary(safe_start) && safe_start < content.len() {
                safe_start += 1;
            }

            // 找到`snippet_end_byte`之后最近的字符边界作为安全的结束点
            let mut safe_end = snippet_end_byte;
            while !content.is_char_boundary(safe_end) && safe_end < content.len() {
                safe_end += 1;
            }
            // --- 修改结束 ---

            let mut snippet = String::new();
            if safe_start > 0 {
                snippet.push_str("...");
            }

            // 现在可以安全地截取字符串了
            let fragment = &content[safe_start..safe_end];
            let fragment_lower = fragment.to_lowercase();
            let query_len = query.len();

            let mut last_end = 0;
            for (match_start, _) in fragment_lower.match_indices(query) {
                // 追加匹配项之前的部分
                snippet.push_str(&fragment[last_end..match_start]);
                // 追加高亮标签和匹配项
                snippet.push_str("<b>");
                snippet.push_str(&fragment[match_start..match_start + query_len]);
                snippet.push_str("</b>");
                last_end = match_start + query_len;
            }
            // 追加最后一个匹配项之后的部分
            snippet.push_str(&fragment[last_end..]);

            if safe_end < content.len() {
                snippet.push_str("...");
            }

            snippet
        } else {
            // 如果没找到，安全地截取前100个字符作为摘要
            let end_char_index = content.char_indices().nth(100).map_or(content.len(), |(i, _)| i);
            format!("{}...", &content[..end_char_index])
        }
    }
}

// ========================================
// 数据结构定义
// ========================================

#[derive(Default)]
struct AppState {
    current_path: Mutex<Option<String>>,
    search_index: Mutex<SearchIndex>,
}

#[derive(Serialize, Deserialize, Debug)]
struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

impl<T> ApiResponse<T> {
    fn success(data: T) -> Self {
        ApiResponse {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    #[allow(dead_code)]
    fn error(error: String) -> Self {
        ApiResponse {
            success: false,
            data: None,
            error: Some(error),
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
struct FileInfo {
    name: String,
    path: String,
    is_dir: bool,
    level: usize,
    is_expanded: bool,
}

#[derive(Serialize, Deserialize, Debug)]
struct SearchResult {
    path: String,
    title: String,
    snippet: String,
}

// ========================================
// 搜索相关命令
// ========================================

#[tauri::command]
async fn init_or_load_db(_base_path: String, _state: tauri::State<'_, AppState>) -> Result<(), String> {
    println!("✅ 搜索索引已准备就绪 (内存模式)");
    Ok(())
}

#[tauri::command]
async fn index_files(base_path: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let base = PathBuf::from(&base_path);
    if !base.exists() || !base.is_dir() {
        return Err(format!("路径不存在或不是目录: {}", base_path));
    }

    let mut index = state.search_index.lock().expect("无法锁定搜索索引");
    index.clear();

    index_directory(&mut *index, &base)?;
    println!("✅ 文件索引完成，共索引 {} 个文件", index.documents.len());
    Ok(())
}

fn index_directory(index: &mut SearchIndex, dir: &Path) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("读取目录失败: {}", e))?;
    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_dir() {
                    index_directory(index, &path)?;
                } else if path.extension().and_then(|s| s.to_str()) == Some("md") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        let title = extract_title_from_content(&content).unwrap_or_else(|| {
                            path.file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("无标题")
                                .to_string()
                        });
                        index.add_document(path.to_string_lossy().to_string(), title, content);
                    }
                }
            }
        }
    }
    Ok(())
}

fn extract_title_from_content(content: &str) -> Option<String> {
    content
        .lines()
        .next()
        .filter(|line| line.starts_with("# "))
        .map(|line| line[2..].trim().to_string())
}

#[tauri::command]
async fn search_notes(
    query: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let index = state.search_index.lock().expect("无法锁定搜索索引");
    Ok(index.search(&query))
}

// ========================================
// Markdown 处理命令
// ========================================

#[tauri::command]
async fn parse_markdown(content: String) -> Result<String, String> {
    let parser = Parser::new(&content);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    Ok(html_output)
}

#[tauri::command]
async fn save_file(path: String, content: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("保存文件失败: {}", e))?;
    // 重新索引已保存的文件以更新搜索内容
    let base_path = state.current_path.lock().unwrap().clone().unwrap_or_default();
    if !base_path.is_empty() {
        index_files(base_path, state).await?;
    }
    Ok(())
}

// ========================================
// 文件系统命令
// ========================================

#[tauri::command]
async fn list_dir_tree(path: String, max_depth: usize) -> Result<Vec<FileInfo>, String> {
    let dir_path = PathBuf::from(&path);
    if !dir_path.is_dir() {
        return Err("路径不是一个有效的目录".to_string());
    }
    let mut result = Vec::new();
    scan_directory(&dir_path, 0, max_depth.max(10), &mut result)?;
    Ok(result)
}

fn scan_directory(
    dir: &Path,
    level: usize,
    max_depth: usize,
    result: &mut Vec<FileInfo>,
) -> Result<(), String> {
    if level >= max_depth {
        return Ok(());
    }
    let mut items = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        if let Ok(entry) = entry {
            let path = entry.path();
            let metadata = entry.metadata().map_err(|e| e.to_string())?;
            items.push((path, metadata.is_dir()));
        }
    }

    items.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));

    for (path, is_dir) in items {
        result.push(FileInfo {
            name: path.file_name().unwrap().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            is_dir,
            level,
            is_expanded: is_dir,
        });
        if is_dir {
            scan_directory(&path, level + 1, max_depth, result)?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_new_file(dir_path: String, file_name: String) -> Result<String, String> {
    let path = Path::new(&dir_path).join(file_name);
    fs::File::create(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
async fn create_new_folder(parent_path: String, folder_name: String) -> Result<String, String> {
    let path = Path::new(&parent_path).join(folder_name);
    fs::create_dir(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
async fn delete_item(path: String) -> Result<(), String> {
    fs::remove_file(path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_folder(path: String) -> Result<(), String> {
    fs::remove_dir_all(path).map_err(|e| e.to_string())
}

// ========================================
// 主函数
// ========================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            list_dir_tree,
            read_file_content,
            parse_markdown,
            save_file,
            create_new_file,
            create_new_folder,
            delete_item,
            delete_folder,
            init_or_load_db,
            index_files,
            search_notes
        ])
        .setup(|app| {
            println!("🚀 CheetahNote 正在启动...");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("CheetahNote");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("运行Tauri应用时出错");
}

fn main() {
    run();
}