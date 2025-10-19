// src/js/editor.js
// CheetahNote - 编辑器逻辑（最终修复版）

'use strict';
import { appState } from './core/AppState.js';
import { eventBus } from './core/EventBus.js';
import { invoke } from './core/TauriApi.js';
import { showError, showSuccessMessage } from './ui-utils.js';
console.log('📜 editor.js 开始加载...');
// 在文件顶部添加变量声明
let fileListElement;

// 添加初始化函数
export function initEditorDOM() {
    searchInput = document.getElementById('search-input');
    clearSearchBtn = document.getElementById('clear-search-btn');
    searchResultsList = document.getElementById('search-results-list');
    fileListElement = document.getElementById('file-list');
    
    // ⭐ 绑定搜索事件
    if (searchInput) {
        searchInput.addEventListener('input', debounce(handleSearch, 300));
    }
    
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', clearSearch);
    }
    
    console.log('✅ editor DOM 元素已初始化');
}

// 需要一个防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
// ========================================
// 搜索相关函数
// ========================================
//function resetSearchInactivityTimer() {
//    if (appState.searchInactivityTimer) {
//        clearTimeout(appState.searchInactivityTimer);
//    }
//    appState.searchInactivityTimer = setTimeout(() => {
//        invoke('release_index').catch(err => console.error('释放索引失败:', err));
//    }, SEARCH_INACTIVITY_TIMEOUT);
//}
//
//
//
//function displaySearchResults(results) {
//    searchResultsList.innerHTML = '';
//    if (results.length === 0) {
//        searchResultsList.innerHTML = '<li>没有找到相关笔记</li>';
//    } else {
//        results.forEach(result => {
//            const li = document.createElement('li');
//            const snippetHTML = result.snippet || '';
//            li.innerHTML = `<div class="search-result-title">${result.title}</div><div class="search-result-snippet">${snippetHTML}</div>`;
//            li.addEventListener('click', () => {
//                tabManager.openTab(result.path);
//                clearSearch();
//            });
//            searchResultsList.appendChild(li);
//        });
//    }
//    
//    fileListElement.style.display = 'none';
//    searchResultsList.style.display = 'block';
//}
//
//function clearSearch() {
//    resetSearchInactivityTimer();
//    searchInput.value = '';
//    clearSearchBtn.style.display = 'none';
//    searchResultsList.style.display = 'none';
//    fileListElement.style.display = 'block';
//}

// ========================================
// 编辑器相关函数（Milkdown）
// ========================================

/**
 * 加载文件到编辑器，- 在加载文件时按需初始化编辑器
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
        
        // ⭐ 2. 确保编辑器已初始化（懒加载）
        if (!window.milkdownEditor || !window.milkdownEditor.editor) {
            console.log('🎨 [loadFileToEditor] 编辑器未初始化，开始初始化...');
            
            try {
                await window.milkdownEditor.init('#milkdown-editor', (content) => {
                    appState.hasUnsavedChanges = true;
                });
                console.log('✅ [loadFileToEditor] 编辑器初始化完成');
            } catch (error) {
                console.error('❌ [loadFileToEditor] 编辑器初始化失败:', error);
                showError('编辑器初始化失败: ' + error.message);
                return;
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
        showError('加载文件失败: ' + error.message);
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
		// ✅ 发布保存成功事件
		eventBus.emit('file:saved', {
			path: appState.activeFilePath,
			content: content
		});
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
// 事件订阅
// ========================================

// 订阅文件加载事件
eventBus.on('load-file', async (filePath) => {
    console.log('📥 [editor.js] 收到 load-file 事件:', filePath);
    await loadFileToEditor(filePath);
});

// ⭐ 订阅保存事件
eventBus.on('editor:save', async () => {
    console.log('💾 收到保存事件');
    await handleSaveFile();
});

console.log('✅ editor 已订阅保存和 load-file 事件');


// ========================================
// 初始化
// ========================================
// ES Module 导出
export {
    handleSaveFile,
    toggleViewMode,
    loadFileToEditor
};


console.log('✅ editor.js 加载完成');