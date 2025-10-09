// src/js/editor.js
// CheetahNote - 编辑器与搜索逻辑 (Milkdown 版本 - 修复)

'use strict';
console.log('📜 editor.js 开始加载...');

// ========================================
// 搜索相关函数
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
// 编辑器相关函数（Milkdown）
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
        
        console.log('📝 文件内容长度:', content.length);
        
        // 2. 加载到 Milkdown 编辑器
        if (window.milkdownEditor && window.milkdownEditor.editor) {
            await window.milkdownEditor.loadContent(content);
        } else {
            console.warn('⚠️ Milkdown 编辑器未初始化，等待初始化...');
            
            // 等待编辑器初始化
            let attempts = 0;
            while ((!window.milkdownEditor || !window.milkdownEditor.editor) && attempts < 10) {
                await new Promise(resolve => setTimeout(resolve, 200));
                attempts++;
            }
            
            if (window.milkdownEditor && window.milkdownEditor.editor) {
                await window.milkdownEditor.loadContent(content);
            } else {
                throw new Error('编辑器初始化超时');
            }
        }
        
        // 3. 更新应用状态
        appState.activeFilePath = relativePath;
        appState.hasUnsavedChanges = false;
        
        console.log('✅ 文件加载成功');
    } catch (error) {
        console.error('❌ 加载文件失败:', error);
        showError('加载文件失败: ' + error);
        
        // 如果加载失败，尝试关闭标签
        if (window.tabManager) {
            tabManager.closeTab(relativePath);
        }
    }
}

/**
 * 保存文件
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
        const content = window.milkdownEditor?.getMarkdown() || '';
        
        if (!content && appState.hasUnsavedChanges) {
            console.warn('⚠️ 内容为空但有未保存变更');
        }
        
        console.log('📝 保存内容长度:', content.length);
        
        // 2. 调用 Rust 后端保存
        await invoke('save_file', {
            rootPath: appState.rootPath,
            relativePath: relativePath,
            content
        });
        
        // 3. 更新状态
        appState.hasUnsavedChanges = false;
        if (window.milkdownEditor) {
            window.milkdownEditor.hasUnsavedChanges = false;
        }
        
        showSuccessMessage('保存成功');
        saveLastFile(relativePath);
        
        console.log('✅ 文件保存成功');
    } catch (error) {
        console.error('❌ 保存文件失败:', error);
        showError('保存文件失败: ' + error);
    }
}

/**
 * 切换视图模式
 */
function toggleViewMode() {
    // Milkdown 本身就是所见即所得，这里可以保留用于只读模式
    const newMode = appState.currentViewMode === 'edit' ? 'preview' : 'edit';
    appState.currentViewMode = newMode;
    
    if (newMode === 'edit') {
        viewToggleBtn.innerHTML = '👁️ 预览';
    } else {
        viewToggleBtn.innerHTML = '📝 编辑';
    }
    
    console.log(`🔄 切换视图模式: ${newMode}`);
}

// ========================================
// 初始化
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 editor.js DOM 已加载');
});

// 导出函数到全局
window.handleSearch = handleSearch;
window.clearSearch = clearSearch;
window.handleSaveFile = handleSaveFile;
window.toggleViewMode = toggleViewMode;
window.loadFileToEditor = loadFileToEditor;

console.log('✅ editor.js 加载完成');