// src-tauri/src/commands/fs.rs
use crate::commands::history::record_file_event;
use crate::commands::links::update_links_for_file;
use crate::commands::path_utils::{to_absolute_path, to_relative_path};
use crate::search_core::{delete_document, index_documents, update_document_index};
use crate::AppState;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::fs;
use std::path::Path; // [修复] 移除了未使用的 PathBuf
use tauri::State;

// ... (顶部 FileNode 等结构体和函数保持不变) ...
#[derive(Debug, Serialize)]
pub struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    has_children: bool,
}

fn directory_has_children(dir: &Path) -> bool {
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if name.starts_with('.') { continue; }
            }
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_dir() { return true; }
                if metadata.is_file() && entry.path().extension().and_then(|s| s.to_str()) == Some("md") {
                    return true;
                }
            }
        }
    }
    false
}

#[tauri::command]
pub async fn list_dir_lazy(root_path: String, relative_path: String) -> Result<Vec<FileNode>, String> {
    let base_path = Path::new(&root_path);
    let dir_to_read = to_absolute_path(base_path, Path::new(&relative_path));
    if !dir_to_read.is_dir() { return Ok(vec![]); }
    let mut nodes = Vec::new();
    let entries = fs::read_dir(&dir_to_read).map_err(|e| format!("读取目录失败: {}", e))?;
    for entry in entries.flatten() {
        let absolute_path = entry.path();
        if let Some(name) = absolute_path.file_name().and_then(|s| s.to_str()) {
            if name.starts_with('.') { continue; }
        }
        if let Ok(metadata) = entry.metadata() {
            if let Some(relative_node_path) = to_relative_path(base_path, &absolute_path) {
                let node = if metadata.is_dir() {
                    FileNode {
                        name: entry.file_name().to_string_lossy().to_string(),
                        path: relative_node_path.to_string_lossy().to_string(),
                        is_dir: true,
                        has_children: directory_has_children(&absolute_path),
                    }
                } else if absolute_path.extension().and_then(|s| s.to_str()) == Some("md") {
                    FileNode {
                        name: entry.file_name().to_string_lossy().to_string(),
                        path: relative_node_path.to_string_lossy().to_string(),
                        is_dir: false,
                        has_children: false,
                    }
                } else { continue; };
                nodes.push(node);
            }
        }
    }
    nodes.sort_by(|a, b| {
        if a.is_dir == b.is_dir { a.name.cmp(&b.name) } 
        else if a.is_dir { std::cmp::Ordering::Less } 
        else { std::cmp::Ordering::Greater }
    });
    Ok(nodes)
}

#[tauri::command]
pub async fn read_file_content(root_path: String, relative_path: String) -> Result<String, String> {
    let absolute_path = to_absolute_path(Path::new(&root_path), Path::new(&relative_path));
    fs::read_to_string(&absolute_path).map_err(|e| format!("读取文件失败: {}", e))
}


#[tauri::command]
pub async fn save_file(
    root_path: String,
    relative_path: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let base_path = Path::new(&root_path);
    let absolute_path = to_absolute_path(base_path, Path::new(&relative_path));
    fs::write(&absolute_path, &content).map_err(|e| format!("保存文件失败: {}", e))?;
    let _ = record_file_event(root_path.clone(), relative_path.clone(), "edited".to_string(), state.clone()).await;
    let search_index_lock = state.search_index.lock().unwrap();
    let db_pool_lock = state.db_pool.lock().unwrap();
    if let (Some(index), Some(db_pool)) = (search_index_lock.as_ref(), db_pool_lock.as_ref()) {
        let relative_path_p = Path::new(&relative_path);
        if let Err(e) = update_document_index(index, db_pool, base_path, relative_path_p) {
            eprintln!("更新索引和数据库失败: {}", e);
        }
        let mut conn = db_pool.get().map_err(|e| e.to_string())?;
        if let Err(e) = update_links_for_file(&mut conn, &root_path, &relative_path) {
            eprintln!("更新文件链接失败: {}", e);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn create_new_file(
    root_path: String,
    relative_dir_path: String,
    file_name: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let base_path = Path::new(&root_path);
    let absolute_dir_path = to_absolute_path(base_path, Path::new(&relative_dir_path));
    if !absolute_dir_path.exists() || !absolute_dir_path.is_dir() {
        return Err(format!("目录不存在: {}", absolute_dir_path.display()));
    }
    let mut file_name_str = file_name;
    if !file_name_str.ends_with(".md") { file_name_str.push_str(".md"); }
    let absolute_file_path = absolute_dir_path.join(&file_name_str);
    if absolute_file_path.exists() {
        return Err(format!("文件已存在: {}", absolute_file_path.display()));
    }
    let initial_content = format!("# {}\n\n", file_name_str.trim_end_matches(".md"));
    fs::write(&absolute_file_path, &initial_content).map_err(|e| format!("创建文件失败: {}", e))?;
    let new_relative_path = to_relative_path(base_path, &absolute_file_path).unwrap();
    let new_relative_path_str = new_relative_path.to_string_lossy().to_string();
    let _ = record_file_event(root_path.clone(), new_relative_path_str.clone(), "created".to_string(), state.clone()).await; 
    let search_index_lock = state.search_index.lock().unwrap();
    let db_pool_lock = state.db_pool.lock().unwrap();
    if let (Some(index), Some(db_pool)) = (search_index_lock.as_ref(), db_pool_lock.as_ref()) {
        if let Err(e) = update_document_index(index, db_pool, base_path, &new_relative_path) {
            eprintln!("为新文件更新索引和数据库失败: {}", e);
        }
    }
    Ok(new_relative_path_str)
}

#[tauri::command]
pub async fn create_new_folder(root_path: String, relative_parent_path: String, folder_name: String) -> Result<String, String> {
    let base_path = Path::new(&root_path);
    let absolute_parent_path = to_absolute_path(base_path, Path::new(&relative_parent_path));
    if !absolute_parent_path.exists() || !absolute_parent_path.is_dir() {
        return Err(format!("目录不存在: {}", absolute_parent_path.display()));
    }
    let absolute_folder_path = absolute_parent_path.join(&folder_name);
    if absolute_folder_path.exists() {
        return Err(format!("文件夹已存在: {}", absolute_folder_path.display()));
    }
    fs::create_dir(&absolute_folder_path).map_err(|e| format!("创建文件夹失败: {}", e))?;
    let new_relative_path = to_relative_path(base_path, &absolute_folder_path).unwrap();
    Ok(new_relative_path.to_string_lossy().to_string())
}


#[tauri::command]
pub async fn delete_item(root_path: String, relative_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let base_path = Path::new(&root_path);
    let absolute_path = to_absolute_path(base_path, Path::new(&relative_path));
    if !absolute_path.exists() {
        return Err(format!("路径不存在: {}", absolute_path.display()));
    }

    let db_pool_lock = state.db_pool.lock().unwrap();
    let search_index_lock = state.search_index.lock().unwrap();

    if let Some(pool) = db_pool_lock.as_ref() {
        let conn = pool.get().map_err(|e| e.to_string())?;
        
        let paths_to_delete = if absolute_path.is_dir() {
            let mut stmt = conn.prepare("SELECT path FROM files WHERE path = ?1 OR path LIKE ?2").map_err(|e| e.to_string())?;
            let mut paths = Vec::new();
            let separator = if cfg!(windows) { "\\" } else { "/" };
            let path_iter = stmt.query_map(params![&relative_path, format!("{}{}%", &relative_path, separator)], |row| row.get(0))
                .map_err(|e| e.to_string())?;
            for path in path_iter {
                paths.push(path.map_err(|e| e.to_string())?);
            }
            paths
        } else {
            vec![relative_path.clone()]
        };

        let separator = if cfg!(windows) { "\\" } else { "/" };
        conn.execute("DELETE FROM files WHERE path = ?1 OR path LIKE ?2", params![&relative_path, format!("{}{}%", &relative_path, separator)])
            .map_err(|e| e.to_string())?;

        if let Some(index) = search_index_lock.as_ref() {
            for path in paths_to_delete {
                if let Err(e) = delete_document(index, &path) {
                    eprintln!("从索引中删除文档 '{}' 失败: {}", path, e);
                }
            }
        }
    }

    if absolute_path.is_file() {
        fs::remove_file(&absolute_path).map_err(|e| format!("删除文件失败: {}", e))?;
    } else {
        fs::remove_dir_all(&absolute_path).map_err(|e| format!("删除文件夹失败: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_folder(root_path: String, relative_path: String, state: State<'_, AppState>) -> Result<(), String> {
    delete_item(root_path, relative_path, state).await
}

// ▼▼▼ 【核心修改】在这里 ▼▼▼
fn update_paths_in_db(
    conn: &mut Connection,
    old_prefix: &str,
    new_prefix: &str,
) -> Result<(), rusqlite::Error> {
    let separator = if cfg!(windows) { "\\" } else { "/" };
    let pattern = format!("{}{}%", old_prefix, separator);

    // 步骤 1: 查询所有需要更新的路径，并将它们收集到一个 Vec 中。
    // 使用一个独立的块 `{...}` 来确保 `stmt` 在我们开始事务之前被销毁。
    let updates = {
        let mut stmt = conn.prepare("SELECT id, path FROM files WHERE path = ?1 OR path LIKE ?2")?;
        let rows = stmt.query_map(params![old_prefix, pattern], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?;

        let mut updates_vec = Vec::new();
        for row in rows {
            let (id, old_path) = row?;
            let new_path = old_path.replacen(old_prefix, new_prefix, 1);
            updates_vec.push((new_path, id));
        }
        updates_vec
    }; // `stmt` 在这里超出作用域，不可变借用结束。

    // 步骤 2: 现在可以安全地开始一个事务来进行修改。
    let tx = conn.transaction()?;
    for (new_path, id) in updates {
        tx.execute(
            "UPDATE files SET path = ?1 WHERE id = ?2",
            params![new_path, id],
        )?;
    }
    tx.commit()
}

#[derive(Debug, Serialize)]
pub struct RenameResult {
    new_path: String,
    old_path: String,
    is_dir: bool,
}

#[tauri::command]
pub async fn rename_item(
    root_path: String,
    old_relative_path: String,
    new_name: String,
    state: State<'_, AppState>,
) -> Result<RenameResult, String> {
    let base_path = Path::new(&root_path);
    let old_abs_path = to_absolute_path(base_path, Path::new(&old_relative_path));
    if !old_abs_path.exists() {
        return Err(format!("目标不存在: {}", old_abs_path.display()));
    }
    if new_name.contains('/') || new_name.contains('\\') {
        return Err("新名称不能包含路径分隔符".to_string());
    }
    let mut new_abs_path = old_abs_path.clone();
    new_abs_path.set_file_name(&new_name);
    if old_abs_path.is_file() && new_abs_path.extension().is_none() {
        new_abs_path.set_extension("md");
    }
    if new_abs_path.exists() {
        return Err("同名文件或文件夹已存在".to_string());
    }

    fs::rename(&old_abs_path, &new_abs_path)
        .map_err(|e| format!("文件系统重命名失败: {}", e))?;

    let new_relative_path = to_relative_path(base_path, &new_abs_path)
        .unwrap()
        .to_string_lossy()
        .to_string();

    let is_dir = new_abs_path.is_dir();
    let db_pool_lock = state.db_pool.lock().unwrap();
    let search_index_lock = state.search_index.lock().unwrap();

    if let (Some(pool), Some(index)) = (db_pool_lock.as_ref(), search_index_lock.as_ref()) {
        let mut conn = pool.get().map_err(|e| e.to_string())?;
        update_paths_in_db(&mut conn, &old_relative_path, &new_relative_path)
            .map_err(|e| format!("数据库批量更新路径失败: {}", e))?;
        
        if let Err(e) = index_documents(index, pool, base_path) {
            eprintln!("重命名后重新索引失败: {}", e);
        }
    }

    Ok(RenameResult {
        new_path: new_relative_path,
        old_path: old_relative_path,
        is_dir,
    })
}