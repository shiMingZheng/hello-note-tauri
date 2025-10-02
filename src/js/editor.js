// src/js/editor.js
// CheetahNote - 编辑器与搜索逻辑

'use strict';
console.log('📜 editor.js 开始加载...');

// ========================================
// 文件编辑操作
// ========================================

async function loadFileToEditor(path) {
    console.log('📄 加载文件:', path);
    
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
        
        // 更新高亮（重新渲染当前视口）
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
            invoke('index_files', { basePath: appState.rootPath }).catch(err => {
                console.warn('后台索引失败:', err);
            });
        }
        
    } catch (error) {
        console.error('❌ 保存文件失败:', error);
        showError('保存文件失败: ' + error);
    }
}

// ========================================
// 搜索功能
// ========================================

async function handleSearch() {
    const query = searchInput.value.trim();
    
    if (!query) {
        clearSearch();
        return;
    }
    
    if (!appState.indexInitialized) {
        showError('索引尚未建立完成，请稍候再试');
        return;
    }
    
    appState.searchQuery = query;
    clearSearchBtn.style.display = 'block';
    
    try {
        appState.isSearching = true;
        
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
    fileListContainer.style.display = 'none';
    searchResultsList.style.display = 'block';
    searchResultsList.innerHTML = '';
    
    if (results.length === 0) {
        searchResultsList.innerHTML = '<li style="text-align: center; color: rgba(255,255,255,0.5);">没有找到相关笔记</li>';
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
    searchInput.value = '';
    appState.searchQuery = '';
    clearSearchBtn.style.display = 'none';
    
    fileListContainer.style.display = 'block';
    searchResultsList.style.display = 'none';
    searchResultsList.innerHTML = '';
}

console.log('✅ editor.js 加载完成');