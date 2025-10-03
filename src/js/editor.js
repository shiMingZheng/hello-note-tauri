// src/js/editor.js
// CheetahNote - 编辑器与搜索逻辑 (标签功能版)

'use strict';
console.log('📜 editor.js 开始加载...');

// ========================================
// 索引生命周期管理 (保持不变)
// ========================================

function resetSearchInactivityTimer() {
    if (appState.searchInactivityTimer) {
        clearTimeout(appState.searchInactivityTimer);
    }
    appState.searchInactivityTimer = setTimeout(() => {
        console.log(`搜索功能闲置已达 ${SEARCH_INACTIVITY_TIMEOUT / 1000 / 60} 分钟，准备释放索引内存。`);
        invoke('release_index').catch(err => console.error('释放索引失败:', err));
    }, SEARCH_INACTIVITY_TIMEOUT);
}

// ========================================
// 标签功能 (新增)
// ========================================


// ========================================
// 文件编辑操作 (已修改)
// ========================================


// 找到 loadFileToEditor 函数并用下面代码替换
async function loadFileToEditor(path) {
    console.log('📄 加载文件内容到编辑器:', path);
    if (appState.activeFilePath === path && !appState.hasUnsavedChanges) {
        // 如果文件已加载且无改动，则无需重复加载
        return;
    }
    
    try {
        const content = await invoke('read_file_content', { path });
        markdownEditor.value = content;
        
        appState.activeFilePath = path;
        appState.hasUnsavedChanges = false;
        
        
        // 如果当前是预览模式，则刷新预览
        if (appState.currentViewMode === 'preview') {
            updatePreview();
        }
        
    } catch (error) {
        console.error('❌ 加载文件内容失败:', error);
        showError('加载文件失败: ' + error);
        tabManager.closeTab(path); // 加载失败，关闭页签
    }
}

// 移除 switchToTab 函数，因为它已移入 tabManager

// ... (switchViewMode, updatePreview, handleSaveFile 保持不变) ...

function switchViewMode(mode) {
    appState.currentViewMode = mode;
    if (mode === 'edit') {
        markdownEditor.style.display = 'block';
        htmlPreview.style.display = 'none';
        editModeBtn.classList.add('active');
        previewModeBtn.classList.remove('active');
        if (htmlPreview) htmlPreview.innerHTML = '';
    } else { 
        markdownEditor.style.display = 'none';
        htmlPreview.style.display = 'block';
        editModeBtn.classList.remove('active');
        previewModeBtn.classList.add('active');
        updatePreview();
    }
}

async function updatePreview() {
    const content = markdownEditor.value;
    try {
        const html = await invoke('parse_markdown', { content });
        htmlPreview.innerHTML = html;
    } catch (error) {
        console.error('❌ Markdown 解析失败:', error);
        htmlPreview.innerHTML = '<p style="color: red;">Markdown 解析失败</p>';
    }
}

async function handleSaveFile() {
    if (!appState.activeFilePath) { showError('没有打开的文件'); return; }
    try {
        const content = markdownEditor.value;
        await invoke('save_file', { path: appState.activeFilePath, content });
        appState.hasUnsavedChanges = false;
        showSuccessMessage('保存成功');
        saveLastFile(appState.activeFilePath);
        if (appState.indexInitialized) {
            invoke('index_files', { basePath: appState.rootPath }).catch(err => {
                console.warn('后台索引失败 (可能因为索引已释放):', err);
            });
        }
    } catch (error) {
        console.error('❌ 保存文件失败:', error);
        showError('保存文件失败: ' + error);
    }
}

// ========================================
// 搜索功能 (保持不变)
// ========================================

async function handleSearch() {
    resetSearchInactivityTimer();
    const query = searchInput.value.trim();
    if (!query) { clearSearch(); return; }
    if (!appState.indexInitialized) { showError('索引尚未建立完成，请稍候再试'); return; }
    appState.searchQuery = query;
    clearSearchBtn.style.display = 'block';
    try {
        appState.isSearching = true;
        await invoke('ensure_index_is_loaded');
        const results = await invoke('search_notes', { query });
        displaySearchResults(results);
    } catch (error) {
        console.error('❌ 搜索失败:', error);
        showError('搜索失败: ' + error);
    } finally {
        appState.isSearching = false;
    }
}

function displaySearchResults(results) {
    fileListElement.style.display = 'none';
    if (fileListSpacer) fileListSpacer.style.display = 'none'; 
    searchResultsList.style.display = 'block';
    searchResultsList.innerHTML = '';
    if (results.length === 0) {
        const li = document.createElement('li');
        li.textContent = '没有找到相关笔记';
        li.style.textAlign = 'center';
        li.style.color = 'var(--text-secondary)';
        searchResultsList.appendChild(li);
        return;
    }
    results.forEach(result => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="search-result-title">${result.title}</div>
            <div class="search-result-snippet">${result.snippet}</div>
        `;
        li.addEventListener('click', () => {
            loadFileToEditor(result.path);
            clearSearch();
        });
        searchResultsList.appendChild(li);
    });
}

function clearSearch() {
    resetSearchInactivityTimer();
    searchInput.value = '';
    appState.searchQuery = '';
    clearSearchBtn.style.display = 'none';
    fileListElement.style.display = 'block';
    if (fileListSpacer) fileListSpacer.style.display = 'block'; 
    searchResultsList.style.display = 'none';
    searchResultsList.innerHTML = '';
}
console.log('✅ editor.js 加载完成');


// [最终修复] 将核心函数显式挂载到全局 window 对象上
window.handleSearch = handleSearch;
window.clearSearch = clearSearch;
window.switchViewMode = switchViewMode;
window.handleSaveFile = handleSaveFile;
window.handleAddTag = handleAddTag;