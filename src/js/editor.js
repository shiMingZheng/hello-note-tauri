// src/js/editor.js
// CheetahNote - 编辑器与搜索逻辑 (索引生命周期优化版)

'use strict';
console.log('📜 editor.js 开始加载...');

// ========================================
// 索引生命周期管理 (新增)
// ========================================

/**
 * 重置索引释放的计时器。每次用户进行搜索操作时调用。
 */
function resetSearchInactivityTimer() {
    // 清除上一个计时器
    if (appState.searchInactivityTimer) {
        clearTimeout(appState.searchInactivityTimer);
    }

    // 设置新的计时器
    appState.searchInactivityTimer = setTimeout(() => {
        console.log(`搜索功能闲置已达 ${SEARCH_INACTIVITY_TIMEOUT / 1000 / 60} 分钟，准备释放索引内存。`);
        invoke('release_index').catch(err => {
            console.error('释放索引失败:', err);
        });
    }, SEARCH_INACTIVITY_TIMEOUT);
}


// ========================================
// 文件编辑操作 (保持上次的优化)
// ========================================

async function loadFileToEditor(path) {
    console.log('📄 加载文件:', path);
    
    if (htmlPreview) {
        htmlPreview.innerHTML = '';
    }

    try {
        const content = await invoke('read_file_content', { path });
        
        markdownEditor.value = content;
        appState.activeFilePath = path;
        appState.hasUnsavedChanges = false;
        
        saveLastFile(path);
        
        const fileName = path.split(/[/\\]/).pop();
        document.getElementById('file-title').textContent = fileName;
        
        welcomeScreen.style.display = 'none';
        editorWrapper.style.display = 'flex';
        
        if (appState.currentViewMode === 'preview') {
            updatePreview();
        }
        
        handleVirtualScroll();
        
        console.log('✅ 文件加载成功');
        
    } catch (error) {
        console.error('❌ 加载文件失败:', error);
        showError('加载文件失败: ' + error);
    }
}

function switchViewMode(mode) {
    appState.currentViewMode = mode;
    
    if (mode === 'edit') {
        markdownEditor.style.display = 'block';
        htmlPreview.style.display = 'none';
        editModeBtn.classList.add('active');
        previewModeBtn.classList.remove('active');

        if (htmlPreview) {
            htmlPreview.innerHTML = '';
        }
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
    if (!appState.activeFilePath) {
        showError('没有打开的文件');
        return;
    }
    
    try {
        const content = markdownEditor.value;
        await invoke('save_file', { 
            path: appState.activeFilePath, 
            content 
        });
        
        appState.hasUnsavedChanges = false;
        showSuccessMessage('保存成功');
        
        saveLastFile(appState.activeFilePath);
        
        if (appState.indexInitialized) {
            // 注意：这里 index_files 会在后台重建索引，如果索引未加载，它会报错，
            // 但这是一个后台操作，我们可以接受。更优化的方案是让 index_files 也先确保索引加载。
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
// 搜索功能 (核心修改)
// ========================================

async function handleSearch() {
    // [修改] 每次搜索都重置计时器
    resetSearchInactivityTimer();

    const query = searchInput.value.trim();
    
    if (!query) {
        clearSearch();
        return;
    }
    
    // indexInitialized 只表示首次索引是否完成，不代表当前是否在内存中
    if (!appState.indexInitialized) {
        showError('索引尚未建立完成，请稍候再试');
        return;
    }
    
    appState.searchQuery = query;
    clearSearchBtn.style.display = 'block';
    
    try {
        appState.isSearching = true;

        // [修改] 在搜索前，确保索引已加载到内存
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
    // [修改] 清空搜索也算一次“操作”，重置计时器
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