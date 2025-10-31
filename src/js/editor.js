// src/js/editor.js
// CheetahNote - 编辑器逻辑 (统一 CodeMirror 版本)

'use strict';
import { appState } from './core/AppState.js';
import { eventBus } from './core/EventBus.js';
import { invoke } from './core/TauriApi.js';
import { showError, showSuccessMessage } from './ui-utils.js';
// ✅ 唯一的编辑器核心
import { codemirrorEditor } from './codemirror-editor.js';

console.log('📜 editor.js (重构版) 开始加载...');

/**
 * 加载文件到编辑器
 * @param {string} relativePath - 文件相对路径 (或 "untitled-..." 标识符)
 */
async function loadFileToEditor(relativePath) {
    console.log('📂 [loadFileToEditor] 开始加载:', relativePath);
    
    if (!relativePath) {
        console.error('❌ [loadFileToEditor] 文件路径为空');
        return;
    }

    try {
        // 步骤 1: 确保 CodeMirror 编辑器已初始化 (在 main.js 中完成)
        if (!codemirrorEditor || !codemirrorEditor.view) {
            // 这个错误不应该发生，因为 main.js 会先初始化
            console.error('❌ [loadFileToEditor] CodeMirror 编辑器未初始化!');
            showError('编辑器核心未加载');
            return;
        }

        // 步骤 2: 检查是否为 "空白页签"
        if (relativePath.startsWith('untitled-')) {
            console.log('📄 [loadFileToEditor] 检测到空白页签, 加载空白状态...');

            // 加载空白内容
            await codemirrorEditor.loadContent("# 空白页签\n\n您可以在左侧文件树中新建或打开一个笔记进行编辑。");
            
            // 设置为只读
            codemirrorEditor.setReadonly(true);
            
            // 更新应用状态
            appState.activeFilePath = null; // 保持与 tab_manager 一致
            appState.hasUnsavedChanges = false;
            
            console.log('✅ [loadFileToEditor] 空白页签加载完成');
            return; // 退出函数
        }

        // 步骤 3: 执行真实文件加载
        console.log('📡 [loadFileToEditor] 调用 Rust 后端读取文件...');
        const content = await invoke('read_file_content', { 
            rootPath: appState.rootPath,
            relativePath: relativePath
        });
        
        console.log('✅ [loadFileToEditor] 文件读取成功，内容长度:', content.length);

        // 步骤 4: 确保编辑器是可编辑的
        codemirrorEditor.setReadonly(false);
        
        console.log('📝 [loadFileToEditor] 加载内容到 CodeMirror...');
        
        // 更新应用状态
        appState.activeFilePath = relativePath;
        appState.hasUnsavedChanges = false;

        // 步骤 5: 加载内容并设置模式
        // (无论是否首次加载，逻辑都一样了)
        console.log('📝 [loadFileToEditor] 加载内容并设置模式:', appState.editorMode);
            
        // 1. 先加载内容
        await codemirrorEditor.loadContent(content);
        
        // 2. 触发模式切换,确保UI和编辑器内部扩展正确
        switchEditorMode(appState.editorMode);
        
        // 标记已完成首次加载 (如果还需要)
        appState.isFirstFileLoad = false;
        
        console.log('✅ [loadFileToEditor] 文件加载完成');
        
    } catch (error) {
        console.error('❌ [loadFileToEditor] 加载文件失败:', error);
        showError('加载文件失败: ' + error.message);
        
        // 加载失败时，也应清空编辑器
        if (codemirrorEditor && codemirrorEditor.view) {
            await codemirrorEditor.loadContent(`# 加载失败\n\n错误: ${error.message}`);
            codemirrorEditor.setReadonly(true);
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
    
    if (relativePath.startsWith('untitled-')) {
        console.warn('⚠️ [handleSaveFile] 跳过临时标签页');
        showError('请先在文件树中创建或打开一个真实文件');
        return;
    }
    
    try {
        // 1. 从 CodeMirror 导出 Markdown
        console.log('📝 [handleSaveFile] 从 CodeMirror 导出内容...');
		
		// 改造：始终从 CodeMirror 获取内容
		let content = codemirrorEditor?.getContent() || '';
        
		console.log('📄 [handleSaveFile] 导出的 Markdown 内容 (片段):', content.substring(0, 100));
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
        if (codemirrorEditor) {
            codemirrorEditor.hasUnsavedChanges = false;
        }
        
        showSuccessMessage('保存成功');
        console.log('✅ [handleSaveFile] 文件保存成功');
        
        // 4. 发布保存成功事件
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
 * 切换编辑器模式
 * @param {string} mode - 'live-preview' | 'source'
 */
function switchEditorMode(mode) {
    console.log(`🔄 切换编辑器模式: ${mode}`);
    
    // 改造：不再需要获取容器，因为只有一个容器
    const viewToggleBtn = document.getElementById('view-toggle-btn');
    const cmWrapper = document.getElementById('codemirror-editor');
    
    // 改造：不再需要同步内容，CM 内部自己管理
    
    // 更新状态
    appState.editorMode = mode;
    // appState.currentViewMode = mode === 'preview' ? 'preview' : 'edit'; // (已废弃)
    
    // 改造：不再隐藏/显示容器，而是调用 CM 内部的模式切换
    try {
        codemirrorEditor.setMode(mode);
        
        // 切换 UI 提示
        if (viewToggleBtn) {
            if (mode === 'source') {
                viewToggleBtn.innerHTML = '💻 源码模式';
                cmWrapper?.classList.add('cm-source-mode-active'); // 添加辅助 class
            } else {
                // 默认为 live-preview
                viewToggleBtn.innerHTML = '📝 实时预览';
                cmWrapper?.classList.remove('cm-source-mode-active'); // 移除辅助 class
            }
        }
        
        // 切换到源码模式时自动聚焦
        if (mode === 'source') {
            codemirrorEditor.focus();
        }

    } catch (error) {
        console.error('❌ [switchEditorMode] 切换模式失败:', error);
        showError('切换编辑器模式失败');
    }
    
    console.log(`✅ 已切换到 ${mode} 模式`);
}

// ========================================
// 事件订阅
// ========================================

eventBus.on('editor:load-file', async (filePath) => {
    console.log('📥 [editor.js] 收到 editor:load-file 事件:', filePath);
    await loadFileToEditor(filePath);
});

eventBus.on('editor:save', async () => {
    console.log('💾 [editor.js] 收到 editor:save 事件');
    await handleSaveFile();
});

eventBus.on('editor:switch-mode', (mode) => {
    console.log('🔄 [editor.js] 收到 editor:switch-mode 事件:', mode);
    switchEditorMode(mode);
});

console.log('✅ editor.js (重构版) 已订阅编辑器事件');

// ========================================
// ES Module 导出
// ========================================
export {
    loadFileToEditor,
    handleSaveFile,
    switchEditorMode
};

console.log('✅ editor.js (重构版) 加载完成');