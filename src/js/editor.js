// src/js/editor.js
// CheetahNote - 编辑器与搜索逻辑 (Milkdown 版本)

'use strict';
console.log('📜 editor.js 开始加载...');

let htmlPreview; // 保留用于兼容性

// ========================================
// 搜索相关函数（保持不变）
// ========================================
function resetSearchInactivityTimer() {
    if (appState.searchInactivityTimer) {
        clearTimeout(appState.searchInactivityTimer);
    }
    appState.searchInactivityTimer = setTimeout(() => {
        invoke('release_index').catch(err => console.error('释放索引失败:', err));
    }, SEARCH_INACTIVITY_TIMEOUT);
}

async function handleSearch() {
    resetSearchInactivityTimer();
    const query = searchInput.value.trim();
    if (!query) { clearSearch(); return; }
    if (!appState.rootPath) {
        showError('请先打开一个文件夹再进行搜索。');
        return;
    }
    clearSearchBtn.style.display = 'block';
    try {
        await invoke('ensure_index_is_loaded', { rootPath: appState.rootPath });
        const results = await invoke('search_notes', { query });
        displaySearchResults(results);
    } catch (error) {
        showError('搜索失败: ' + error);
    }
}

function displaySearchResults(results) {
    searchResultsList.innerHTML = '';
    if (results.length === 0) {
        searchResultsList.innerHTML = '<li>没有找到相关笔记</li>';
    } else {
        results.forEach(result => {
            const li = document.createElement('li');
            const snippetHTML = result.snippet || '';
            li.innerHTML = `<div class="search-result-title">${result.title}</div><div class="search-result-snippet">${snippetHTML}</div>`;
            li.addEventListener('click', () => {
                tabManager.openTab(result.path);
                clearSearch();
            });
            searchResultsList.appendChild(li);
        });
    }
    
    fileListElement.style.display = 'none';
    searchResultsList.style.display = 'block';
}

function clearSearch() {
    resetSearchInactivityTimer();
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    searchResultsList.style.display = 'none';
    fileListElement.style.display = 'block';
}

// ========================================
// 编辑器相关函数（重写以使用 Milkdown）
// ========================================

/**
 * 加载文件到 Milkdown 编辑器
 */
async function loadFileToEditor(relativePath) {
    console.log('📄 加载文件到编辑器:', relativePath);
    
    try {
        // 1. 从 Rust 后端读取文件内容
        const content = await invoke('read_file_content', { 
            rootPath: appState.rootPath,
            relativePath: relativePath
        });
        
        // 2. 加载到 Milkdown 编辑器
        if (window.milkdownEditor && window.milkdownEditor.editor) {
            await window.milkdownEditor.loadContent(content);
        }
        
        // 3. 更新应用状态
        appState.activeFilePath = relativePath;
        appState.hasUnsavedChanges = false;
        
        console.log('✅ 文件加载成功');
    } catch (error) {
        console.error('❌ 加载文件失败:', error);
        showError('加载文件失败: ' + error);
        tabManager.closeTab(relativePath);
    }
}

/**
 * 保存文件（从 Milkdown 导出）
 */
async function handleSaveFile() {
    const relativePath = appState.activeFilePath;
    if (!relativePath) { 
        showError('没有打开的文件'); 
        return; 
    }
    
    console.log('💾 保存文件:', relativePath);
    
    try {
        // 1. 从 Milkdown 编辑器导出 Markdown
        const content = window.milkdownEditor.getMarkdown();
        
        // 2. 调用 Rust 后端保存
        await invoke('save_file', {
            rootPath: appState.rootPath,
            relativePath: relativePath,
            content
        });
        
        // 3. 更新状态
        appState.hasUnsavedChanges = false;
        window.milkdownEditor.hasUnsavedChanges = false;
        
        showSuccessMessage('保存成功');
        saveLastFile(relativePath);
        
        console.log('✅ 文件保存成功');
    } catch (error) {
        console.error('❌ 保存文件失败:', error);
        showError('保存文件失败: ' + error);
    }
}

/**
 * 切换视图模式（编辑/预览）
 * 注意：Milkdown 本身就是所见即所得，这个功能可以保留用于切换到纯预览模式
 */
function toggleViewMode() {
    const newMode = appState.currentViewMode === 'edit' ? 'preview' : 'edit';
    appState.currentViewMode = newMode;
    
    if (newMode === 'edit') {
        // 编辑模式：显示 Milkdown 编辑器
        document.getElementById('milkdown-editor').style.display = 'block';
        if (htmlPreview) htmlPreview.style.display = 'none';
        viewToggleBtn.innerHTML = '👁️ 预览';
        
        // 设置编辑器为可编辑
        if (window.milkdownEditor) {
            window.milkdownEditor.setReadonly(false);
        }
    } else {
        // 预览模式：显示只读的 Milkdown 或传统预览
        viewToggleBtn.innerHTML = '📝 编辑';
        
        // 设置编辑器为只读
        if (window.milkdownEditor) {
            window.milkdownEditor.setReadonly(true);
        }
    }
}

/**
 * 传统预览功能（可选保留）
 */
async function updatePreview() {
    if (!htmlPreview) return;
    
    const content = window.milkdownEditor ? 
                    window.milkdownEditor.getMarkdown() : '';
    
    try {
        const html = await invoke('parse_markdown', { content });
        htmlPreview.innerHTML = html;
        
        // 处理内部链接
        htmlPreview.querySelectorAll('a.internal-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetPath = link.getAttribute('data-path');
                if (targetPath) {
                    tabManager.openTab(targetPath);
                }
            });
        });
    } catch (error) {
        htmlPreview.innerHTML = '<p style="color: red;">Markdown 解析失败</p>';
    }
}

// ========================================
// 初始化编辑器
// ========================================
async function initializeEditor() {
    console.log('🎯 初始化 Milkdown 编辑器...');
    
    htmlPreview = document.getElementById('html-preview');
    
    try {
        // 初始化 Milkdown
        await window.milkdownEditor.init('#milkdown-editor', (markdown) => {
            // 内容变更回调
            appState.hasUnsavedChanges = true;
            console.log('📝 编辑器内容已变更');
        });
        
        console.log('✅ Milkdown 编辑器初始化完成');
    } catch (error) {
        console.error('❌ Milkdown 编辑器初始化失败:', error);
        showError('编辑器初始化失败: ' + error);
    }
}

// 在 DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    // 等待 Milkdown 模块加载
    if (window.milkdownEditor) {
        initializeEditor();
    } else {
        // 如果模块还未加载，等待一下
        setTimeout(initializeEditor, 500);
    }
});

// 导出函数到全局
window.handleSearch = handleSearch;
window.clearSearch = clearSearch;
window.handleSaveFile = handleSaveFile;
window.toggleViewMode = toggleViewMode;
window.loadFileToEditor = loadFileToEditor;

console.log('✅ editor.js 加载完成');