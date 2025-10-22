// src/js/editor.js
// CheetahNote - 编辑器逻辑（事件驱动版本）

'use strict';
import { appState } from './core/AppState.js';
import { eventBus } from './core/EventBus.js';
import { invoke } from './core/TauriApi.js';
import { showError, showSuccessMessage } from './ui-utils.js';
// ✅ 在文件顶部添加导入
import { milkdownEditor } from './milkdown-editor.js';

console.log('📜 editor.js 开始加载...');

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
        
        // 2. 确保编辑器已初始化（懒加载）
        if (!milkdownEditor || !milkdownEditor.editor) {
            console.log('🎨 [loadFileToEditor] 编辑器未初始化，开始初始化...');
            
            try {
                await milkdownEditor.init('#milkdown-editor', (content) => {
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
        await milkdownEditor.loadContent(content);
        
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
        const content = milkdownEditor?.getMarkdown() || '';
        
        console.log('✅ [handleSaveFile] 内容导出成功，长度:', content.length);
        
        // 2. 调用 Rust 后端保存
        console.log('📡 [handleSaveFile] 调用 Rust 后端保存...');
        await invoke('save_file', {
            rootPath: appState.rootPath,
            relativePath: relativePath,
            content: content
        });
        
        // 3. 更新状态
        appState.hasUnsavedChanges = false;
        if (milkdownEditor) {
            milkdownEditor.hasUnsavedChanges = false;
        }
        
        showSuccessMessage('保存成功');
        
        console.log('✅ [handleSaveFile] 文件保存成功');
        
        // ✅ 发布保存成功事件
        eventBus.emit('file:saved', {
            path: appState.activeFilePath,
            content: content
        });
    } catch (error) {
        console.error('❌ [handleSaveFile] 保存文件失败:', error);
        showError('保存文件失败: ' + error);
    }
}

/**
 * 切换视图模式
 */
function toggleViewMode() {
    const newMode = appState.currentViewMode === 'edit' ? 'preview' : 'edit';
    appState.currentViewMode = newMode;
    
    const viewToggleBtn = document.getElementById('view-toggle-btn');
    
    if (newMode === 'edit') {
        if (viewToggleBtn) viewToggleBtn.innerHTML = '👁️ 预览';
        if (milkdownEditor) {
            milkdownEditor.setReadonly(false);
        }
    } else {
        if (viewToggleBtn) viewToggleBtn.innerHTML = '📝 编辑';
        if (milkdownEditor) {
            milkdownEditor.setReadonly(true);
        }
    }
    
    console.log(`🔄 切换视图模式: ${newMode}`);
}

// ========================================
// 事件订阅（新增）
// ========================================

// 订阅文件加载事件
eventBus.on('editor:load-file', async (filePath) => {
    console.log('📥 [editor.js] 收到 editor:load-file 事件:', filePath);
    await loadFileToEditor(filePath);
});

// 订阅保存事件
eventBus.on('editor:save', async () => {
    console.log('💾 [editor.js] 收到 editor:save 事件');
    await handleSaveFile();
});

// 订阅视图切换事件
eventBus.on('editor:toggle-view', () => {
    console.log('👁️ [editor.js] 收到 editor:toggle-view 事件');
    toggleViewMode();
});

console.log('✅ editor.js 已订阅编辑器事件');

// ========================================
// ES Module 导出（供内部模块使用）
// ========================================
export {
    loadFileToEditor,
    handleSaveFile,
    toggleViewMode
};

console.log('✅ editor.js 加载完成');