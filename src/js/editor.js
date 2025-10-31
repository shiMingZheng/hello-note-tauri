// src/js/editor.js
// CheetahNote - 编辑器逻辑（事件驱动版本）

'use strict';
import { appState } from './core/AppState.js';
import { eventBus } from './core/EventBus.js';
import { invoke } from './core/TauriApi.js';
import { showError, showSuccessMessage } from './ui-utils.js';
// ✅ 在文件顶部添加导入
import { milkdownEditor } from './milkdown-editor.js';
import { codemirrorEditor } from './codemirror-editor.js';

console.log('📜 editor.js 开始加载...');

// ========================================
// 编辑器相关函数（Milkdown）
// ========================================

/**
 * 加载文件到编辑器
 * @param {string} relativePath - 文件相对路径
 */
// src/js/editor.js

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
        // [修复] 步骤 1: 确保编辑器已初始化（必须在所有操作之 前）
        if (!milkdownEditor || !milkdownEditor.editor) {
            console.log('🎨 [loadFileToEditor] 编辑器未初始化，开始初始化...');
            await milkdownEditor.init('#milkdown-editor', (content) => {
                appState.hasUnsavedChanges = true;
            });
            console.log('✅ [loadFileToEditor] 编辑器初始化完成');
        }

        // [修复] 步骤 2: 检查是否为 "空白页签"
        if (relativePath.startsWith('untitled-')) {
             // 【关键】先清空编辑器内容,避免显示上一个文件的内容
           
            console.log('📄 [loadFileToEditor] 检测到空白页签, 加载空白状态...');

            // 加载空白内容
            await milkdownEditor.loadContent("# 空白页签\n\n您可以在左侧文件树中新建或打开一个笔记进行编辑。");
            
            // 设置为只读
            milkdownEditor.setReadonly(true);
            
            // 更新应用状态
            appState.activeFilePath = null; // 保持与 tab_manager 一致
            appState.hasUnsavedChanges = false;
            
            console.log('✅ [loadFileToEditor] 空白页签加载完成');
            return; // 退出函数，不执行后续的文件读取
        }

        // [修复] 步骤 3: 如果不是空白页签，则执行真实文件加载
        
        console.log('📡 [loadFileToEditor] 调用 Rust 后端读取文件...');
        const content = await invoke('read_file_content', { 
            rootPath: appState.rootPath,
            relativePath: relativePath
        });
        
        console.log('✅ [loadFileToEditor] 文件读取成功，内容长度:', content.length);

        // [修复] 确保编辑器是可编辑的
        milkdownEditor.setReadonly(false);
        
        console.log('📝 [loadFileToEditor] 加载内容到 Milkdown...');
    
        
        // 更新应用状态
        appState.activeFilePath = relativePath;
        appState.hasUnsavedChanges = false;

        // ✅ 关键修复: 只在首次加载文件时,强制切换到默认模式
        // 之后保持用户选择的模式
        if (appState.isFirstFileLoad) {
            console.log('🎬 [loadFileToEditor] 首次加载文件,切换到默认模式:', appState.editorMode);
            
            // 先加载内容到对应编辑器
            if (appState.editorMode === 'source') {
                await codemirrorEditor.loadContent(content);
            } else {
                await milkdownEditor.loadContent(content);
            }
            
            // 触发模式切换,确保UI正确更新.
            //eventBus.emit('editor:switch-mode', appState.editorMode);
            switchEditorMode(appState.editorMode);
            
            // 标记已完成首次加载
            appState.isFirstFileLoad = false;
            console.log('✅ [loadFileToEditor] 首次模式切换完成,后续将保持用户选择的模式');
        } else {
            console.log('📝 [loadFileToEditor] 非首次加载,使用当前模式:', appState.editorMode);
            
            // 直接加载内容到当前激活的编辑器
            if (appState.editorMode === 'source') {
                await codemirrorEditor.loadContent(content);
            } else {
                await milkdownEditor.loadContent(content);
            }
        }
        
        
        console.log('✅ [loadFileToEditor] 文件加载完成');
        
    } catch (error) {
        // catch 块现在只会捕获真实文件的读取错误
        console.error('❌ [loadFileToEditor] 加载文件失败:', error);
        showError('加载文件失败: ' + error.message);
        
        // [修复] 加载失败时，也应清空编辑器
        if (milkdownEditor && milkdownEditor.editor) {
            await milkdownEditor.loadContent(`# 加载失败\n\n错误: ${error.message}`);
            milkdownEditor.setReadonly(true);
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
		
		// 修改为:
		// 根据当前模式从对应编辑器获取内容
		let content = '';
		if (appState.editorMode === 'source') {
			content = codemirrorEditor?.getContent() || '';
		} else {
			content = milkdownEditor?.getMarkdown() || '';
		}
        
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
 * 切换编辑器模式
 * @param {string} mode - 'wysiwyg' | 'source' | 'preview'
 */
function switchEditorMode(mode) {
    console.log(`🔄 切换编辑器模式: ${mode}`);
    
    const milkdownContainer = document.getElementById('milkdown-editor');
    const codemirrorContainer = document.getElementById('codemirror-editor');
    const viewToggleBtn = document.getElementById('view-toggle-btn');
    
    // 获取当前激活的编辑器内容
    let currentContent = '';
    if (appState.editorMode === 'wysiwyg' || appState.editorMode === 'preview') {
        currentContent = milkdownEditor?.getMarkdown() || '';
    } else if (appState.editorMode === 'source') {
        currentContent = codemirrorEditor?.getContent() || '';
    }
    
    // 更新状态
    appState.editorMode = mode;
    appState.currentViewMode = mode === 'preview' ? 'preview' : 'edit';
    
    // 隐藏所有编辑器
    if (milkdownContainer) milkdownContainer.classList.remove('active');
    if (codemirrorContainer) codemirrorContainer.classList.remove('active');
    
    // 根据模式显示对应编辑器
    switch (mode) {
        case 'wysiwyg':
            if (milkdownContainer) milkdownContainer.classList.add('active');
            if (milkdownEditor) {
                milkdownEditor.setReadonly(false);
                milkdownEditor.loadContent(currentContent);
            }
            if (viewToggleBtn) viewToggleBtn.innerHTML = '📝 所见即所得';
            break;
            
        case 'source':
            if (codemirrorContainer) codemirrorContainer.classList.add('active');
            if (codemirrorEditor) {
                codemirrorEditor.setReadonly(false);
                codemirrorEditor.loadContent(currentContent);
                codemirrorEditor.focus();
            }
            if (viewToggleBtn) viewToggleBtn.innerHTML = '💻 源码模式';
            break;
            
        case 'preview':
            if (milkdownContainer) milkdownContainer.classList.add('active');
            if (milkdownEditor) {
                milkdownEditor.setReadonly(true);
                milkdownEditor.loadContent(currentContent);
            }
            if (viewToggleBtn) viewToggleBtn.innerHTML = '👁️ 预览';
            break;
    }
    
    console.log(`✅ 已切换到 ${mode} 模式`);
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
// 订阅模式切换事件
eventBus.on('editor:switch-mode', (mode) => {
    console.log('🔄 [editor.js] 收到 editor:switch-mode 事件:', mode);
    switchEditorMode(mode);
});

console.log('✅ editor.js 已订阅编辑器事件');

// ========================================
// ES Module 导出（供内部模块使用）
// ========================================
export {
    loadFileToEditor,
    handleSaveFile,
    switchEditorMode  // 替换 toggleViewMode
};

console.log('✅ editor.js 加载完成');