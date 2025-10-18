// src/js/editor.js
// CheetahNote - 编辑器逻辑（最终修复版）

'use strict';
import { appState } from './core/AppState.js';
import { invoke } from './core/TauriApi.js';
import { showError, showSuccessMessage } from './ui-utils.js';
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
 * 加载文件到编辑器
 * @param {string} relativePath - 文件相对路径
 */
async function loadFileToEditor(relativePath) {
    console.log('📂 [loadFileToEditor] 开始加载文件:', relativePath);
    console.log('📂 [loadFileToEditor] 当前 rootPath:', appState.rootPath);
    
    if (!relativePath) {
        console.error('❌ [loadFileToEditor] 文件路径为空');
        return;
    }
    
    try {
        // 1. 从 Rust 后端读取文件内容
        console.log('📡 [loadFileToEditor] 调用 Rust 后端读取文件...');
        const content = await invoke('read_file_content', { 
            rootPath: appState.rootPath,
            relativePath: relativePath
        });
        
        console.log('✅ [loadFileToEditor] 文件读取成功，内容长度:', content.length);
        console.log('📝 [loadFileToEditor] 内容预览:', content.substring(0, 100));
        
        // 2. 检查编辑器是否已初始化
        if (!window.milkdownEditor || !window.milkdownEditor.editor) {
            console.warn('⚠️ [loadFileToEditor] 编辑器未初始化，等待...');
            
            let attempts = 0;
            while ((!window.milkdownEditor || !window.milkdownEditor.editor) && attempts < 20) {
                await new Promise(resolve => setTimeout(resolve, 200));
                attempts++;
                console.log(`⏳ [loadFileToEditor] 等待编辑器初始化... (${attempts}/20)`);
            }
            
            if (!window.milkdownEditor || !window.milkdownEditor.editor) {
                throw new Error('编辑器初始化超时');
            }
        }
        
        // 3. 加载内容到编辑器
        console.log('📝 [loadFileToEditor] 加载内容到 Milkdown...');
        await window.milkdownEditor.loadContent(content);
        
        // 4. 更新应用状态
        appState.activeFilePath = relativePath;
        appState.hasUnsavedChanges = false;
        
        console.log('✅ [loadFileToEditor] 文件加载完成');
    } catch (error) {
        console.error('❌ [loadFileToEditor] 加载文件失败:', error);
        console.error('❌ [loadFileToEditor] 错误详情:', error.stack);
        showError('加载文件失败: ' + error);
        
        // 加载失败时关闭标签
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
    
    console.log('💾 [handleSaveFile] 开始保存文件:', relativePath);
    
    if (!relativePath) { 
        console.error('❌ [handleSaveFile] 没有打开的文件');
        showError('没有打开的文件'); 
        return; 
    }
    
    // 跳过临时标签页
    if (relativePath.startsWith('untitled-')) {
        console.warn('⚠️ [handleSaveFile] 跳过临时标签页');
        showError('请先在文件树中创建或打开一个真实文件');
        return;
    }
    
    try {
        // 1. 从编辑器导出 Markdown
        console.log('📝 [handleSaveFile] 从编辑器导出内容...');
        const content = window.milkdownEditor?.getMarkdown() || '';
        
        console.log('✅ [handleSaveFile] 内容导出成功，长度:', content.length);
        console.log('📝 [handleSaveFile] 内容预览:', content.substring(0, 100));
        
        // 2. 调用 Rust 后端保存
        console.log('📡 [handleSaveFile] 调用 Rust 后端保存...');
        await invoke('save_file', {
            rootPath: appState.rootPath,
            relativePath: relativePath,
            content: content
        });
        
        // 3. 更新状态
        appState.hasUnsavedChanges = false;
        if (window.milkdownEditor) {
            window.milkdownEditor.hasUnsavedChanges = false;
        }
        
        showSuccessMessage('保存成功');
        saveLastFile(relativePath);
        
        console.log('✅ [handleSaveFile] 文件保存成功');
    } catch (error) {
        console.error('❌ [handleSaveFile] 保存文件失败:', error);
        console.error('❌ [handleSaveFile] 错误详情:', error.stack);
        showError('保存文件失败: ' + error);
    }
}

/**
 * 切换视图模式
 */
function toggleViewMode() {
    const newMode = appState.currentViewMode === 'edit' ? 'preview' : 'edit';
    appState.currentViewMode = newMode;
    
    if (newMode === 'edit') {
        viewToggleBtn.innerHTML = '👁️ 预览';
        if (window.milkdownEditor) {
            window.milkdownEditor.setReadonly(false);
        }
    } else {
        viewToggleBtn.innerHTML = '📝 编辑';
        if (window.milkdownEditor) {
            window.milkdownEditor.setReadonly(true);
        }
    }
    
    console.log(`🔄 切换视图模式: ${newMode}`);
}

// ========================================
// 初始化
// ========================================
// ES Module 导出
export {
    handleSearch,
    clearSearch,
    handleSaveFile,
    toggleViewMode,
    loadFileToEditor
};


console.log('✅ editor.js 加载完成');