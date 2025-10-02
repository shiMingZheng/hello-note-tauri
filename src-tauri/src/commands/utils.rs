// src/commands/utils.rs

use pulldown_cmark::{html, Parser};

#[tauri::command]
pub async fn parse_markdown(content: String) -> Result<String, String> {
    let parser = Parser::new(&content);
    let mut html_output = String::new();
    html::push_html(&mut html_output, parser);
    Ok(html_output)
}