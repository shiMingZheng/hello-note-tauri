// src/js/main.js
'use strict';

console.log('🚀 CheetahNote 主入口开始加载...');
import { eventBus } from './core/EventBus.js';

// 核心模块
import { appState } from './core/AppState.js';
import { TauriAPI } from './core/TauriAPI.js';

// 工具模块
import { showError, showSuccessMessage, showCustomConfirm } from './ui-utils.js';
import { themeManager } from './theme.js';
import { sidebarControl } from './sidebar-control.js';

// 功能模块
import { setupVirtualScroll, updateVirtualScrollData } from './virtual-scroll.js';
import { TabManager } from './tab_manager.js';
import { initializeLinks, updateBacklinksUI } from './links.js';
import { tagModal } from './tag_modal.js';
import { sidebar } from './sidebar.js';
import { initializeHomepage, loadPinnedNotes, loadHistory } from './homepage.js';
import { handleSearch, clearSearch, handleSaveFile, toggleViewMode, loadFileToEditor } from './editor.js';
import * as fileManager from './file-manager.js';
import { uiActions } from './ui_actions.js';
import { graphView } from './graph.js';
import { WorkspaceManager } from './workspace.js';

// ⭐ 新增：编辑器和插件系统
import { milkdownEditor } from './milkdown-editor.js';
import { dragDropManager } from './drag-drop.js';
import { pluginManager } from './plugin-manager.js';
import { pluginContext } from './plugin-context.js';

/**
 * 初始化 Milkdown 编辑器
 */
/**
 * 初始化 Milkdown 编辑器
 */
async function initializeMilkdownEditor() {
    console.log('🎨 [main.js] 开始初始化 Milkdown 编辑器...');
    console.log('🔍 [main.js] 检查 milkdownEditor 对象:', window.milkdownEditor);
    
    if (!window.milkdownEditor) {
        throw new Error('milkdownEditor 模块未加载');
    }
    
    try {
        console.log('📡 [main.js] 调用 milkdownEditor.init()...');
        
        await milkdownEditor.init('#milkdown-editor', (content) => {
            appState.hasUnsavedChanges = true;
        });
        
        console.log('✅ [main.js] Milkdown 编辑器初始化完成');
        console.log('🔍 [main.js] 编辑器实例:', window.milkdownEditor.editor);
        
        if (!window.milkdownEditor.editor) {
            throw new Error('编辑器实例创建失败 (editor 为 null)');
        }
        
    } catch (error) {
        console.error('❌ [main.js] Milkdown 编辑器初始化失败:', error);
        console.error('❌ [main.js] 错误堆栈:', error.stack);
        showError('编辑器初始化失败: ' + error.message);
        
        // ⭐ 关键: 重新抛出错误,让调用者知道失败了
        throw error;
    }
}

/**
 * 应用初始化
 */
async function initApp() {
    console.log('🎯 初始化应用...');
    
    try {
		// 导出事件总线到全局（供插件和调试使用）
		window.eventBus = eventBus;
		console.log('✅ EventBus 已导出到全局');
		 // 1. 初始化 UI 组件（显式调用）
        sidebarControl.init();
        sidebar.init();
        themeManager.init();
        tagModal.init();
        uiActions.init();
        graphView.init();
        dragDropManager.init();
        
        // 1. 初始化虚拟滚动
        setupVirtualScroll();
        
        // 2. 创建管理器实例
        window.tabManager = new TabManager();
        window.tabManager.init();
        window.workspaceManager = new WorkspaceManager();
        
        // 3. 初始化功能模块
        initializeLinks();
        
        // 4. 初始化 Milkdown 编辑器
        await initializeMilkdownEditor();
        
        // 5. 初始化插件系统
        await pluginManager.init(pluginContext);
        
        // 🆕 导出 editor.js 的函数到全局
		window.loadFileToEditor = loadFileToEditor;
		window.handleSearch = handleSearch;
		window.clearSearch = clearSearch;
		window.handleSaveFile = handleSaveFile;
		window.toggleViewMode = toggleViewMode;
		
		console.log('✅ Editor 函数已导出到全局');
        
        // 导出 file-manager 函数到全局
        Object.assign(window, fileManager);
        
        
        // 7. 启动工作区
        await window.workspaceManager.startup();
        
        console.log('✅ 应用初始化完成');
    } catch (error) {
        console.error('❌ 应用初始化失败:', error);
        showError('应用初始化失败: ' + error);
    }
}

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);

// 导出必要的对象到全局（用于插件系统）
window.appState = appState;
window.TauriAPI = TauriAPI;

console.log('✅ 主入口模块加载完成');