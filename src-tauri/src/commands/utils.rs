// src-tauri/src/commands/utils.rs

use crate::AppState;
use pulldown_cmark::{html, Parser};
use regex::Regex;
use rusqlite::{params, OptionalExtension};
use tauri::{command, State};

#[command]
pub async fn parse_markdown(
    content: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db_pool_lock = state.db_pool.lock().unwrap();
    let db_pool = db_pool_lock.as_ref().ok_or("数据库未初始化")?;
    let conn = db_pool.get().map_err(|e| e.to_string())?;

    let re = Regex::new(r"\[\[([^\]]+)\]\]").unwrap();
    let processed_content = re.replace_all(&content, |caps: &regex::Captures| {
        let link_target = caps[1].trim();
        let mut final_path: Option<String> = None;

        if let Ok(Some(path)) = conn.query_row(
            "SELECT path FROM files WHERE title = ?1 LIMIT 1",
            params![link_target],
            |row| row.get(0),
        ).optional() {
            final_path = path;
        }

        if final_path.is_none() {
            let path_pattern = format!("%{}.md", link_target);
            if let Ok(Some(path)) = conn.query_row(
                "SELECT path FROM files WHERE path LIKE ?1 LIMIT 1",
                params![path_pattern],
                |row| row.get(0),
            ).optional() {
                final_path = path;
            }
        }

        // ▼▼▼ 【核心修改】将 r#""# 替换为带 \" 转义的普通字符串 ▼▼▼
        match final_path {
            Some(path) => format!(
                "<a href=\"#\" class=\"internal-link\" data-path=\"{}\">{}</a>",
                path, link_target
            ),
            None => format!(
                "<span class=\"internal-link-broken\">{}</span>",
                link_target
            ),
        }
    });

    let parser = Parser::new(&processed_content);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);

    Ok(html_output)
}