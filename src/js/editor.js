// src/js/editor.js
// CheetahNote - 编辑器与搜索逻辑 (显示逻辑修复版)

'use strict';
console.log('📜 editor.js 开始加载...');

function resetSearchInactivityTimer() {
    if (appState.searchInactivityTimer) {
        clearTimeout(appState.searchInactivityTimer);
    }
    appState.searchInactivityTimer = setTimeout(() => {
        invoke('release_index').catch(err => console.error('释放索引失败:', err));
    }, SEARCH_INACTIVITY_TIMEOUT);
}

async function loadFileToEditor(relativePath) {
    try {
        const content = await invoke('read_file_content', { 
            rootPath: appState.rootPath,
            relativePath: relativePath
        });
        markdownEditor.value = content;
        appState.activeFilePath = relativePath;
        appState.hasUnsavedChanges = false;
        
        if (appState.currentViewMode === 'preview') {
            updatePreview();
        }
    } catch (error) {
        showError('加载文件失败: ' + error);
        tabManager.closeTab(relativePath);
    }
}

function toggleViewMode() {
    const newMode = appState.currentViewMode === 'edit' ? 'preview' : 'edit';
    appState.currentViewMode = newMode;
    if (newMode === 'edit') {
        editorContainer.classList.remove('preview-mode');
        viewToggleBtn.innerHTML = '👁️ 预览';
    } else {
        editorContainer.classList.add('preview-mode');
        viewToggleBtn.innerHTML = '📝 编辑';
        updatePreview();
    }
}

async function updatePreview() {
    const content = markdownEditor.value;
    try {
        const html = await invoke('parse_markdown', { content });
        htmlPreview.innerHTML = html;
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

async function handleSaveFile() {
    const relativePath = appState.activeFilePath;
    if (!relativePath) { showError('没有打开的文件'); return; }
    try {
        const content = markdownEditor.value;
        await invoke('save_file', {
            rootPath: appState.rootPath,
            relativePath: relativePath,
            content
        });
        appState.hasUnsavedChanges = false;
        showSuccessMessage('保存成功');
        saveLastFile(relativePath);
    } catch (error) {
        showError('保存文件失败: ' + error);
    }
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

// ▼▼▼【核心修改】在这里 ▼▼▼
function displaySearchResults(results) {
    searchResultsList.innerHTML = '';
    if (results.length === 0) {
        searchResultsList.innerHTML = '<li>没有找到相关笔记</li>';
    } else {
        results.forEach(result => {
            const li = document.createElement('li');
            // 修复：确保 snippet 存在且为字符串，防止 innerHTML 错误
            const snippetHTML = result.snippet || '';
            li.innerHTML = `<div class="search-result-title">${result.title}</div><div class="search-result-snippet">${snippetHTML}</div>`;
            li.addEventListener('click', () => {
                tabManager.openTab(result.path);
                clearSearch();
            });
            searchResultsList.appendChild(li);
        });
    }
    
    // [修复] 隐藏文件列表本身，而不是它的父容器
    fileListElement.style.display = 'none';
    searchResultsList.style.display = 'block';
}

function clearSearch() {
    resetSearchInactivityTimer();
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';

    // [修复] 恢复文件列表本身的显示
    searchResultsList.style.display = 'none';
    fileListElement.style.display = 'block';
}
// ▲▲▲【核心修改】结束 ▲▲▲

window.handleSearch = handleSearch;
window.clearSearch = clearSearch;
window.handleSaveFile = handleSaveFile;
window.toggleViewMode = toggleViewMode;