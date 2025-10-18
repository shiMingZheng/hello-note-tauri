// src/js/main.js
'use strict';

console.log('🚀 CheetahNote 主入口开始加载...');
import { eventBus } from './core/EventBus.js';

// 核心模块
import { appState } from './core/AppState.js';
import { TauriAPI } from './core/TauriAPI.js';

// ⭐ 添加这一行：
import { domElements, initializeDOMElements } from './dom-init.js';

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

import * as fileManager from './file-manager.js';
import { uiActions } from './ui_actions.js';
import { graphView } from './graph.js';
import { WorkspaceManager } from './workspace.js';

// ⭐ 新增：编辑器和插件系统
import { milkdownEditor } from './milkdown-editor.js';
import { dragDropManager } from './drag-drop.js';
import { pluginManager } from './plugin-manager.js';
import { pluginContext } from './plugin-context.js';

import { searchManager } from './search.js';  // ⭐ 新增
import { contextMenuManager } from './context-menu.js';  // ⭐ 新增
import { handleSaveFile, toggleViewMode, loadFileToEditor } from './editor.js';  // ⭐ 保留编辑器相关


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
        // ⭐ 1. 首先初始化所有 DOM 元素引用
        initializeDOMElements();
        
        // 导出事件总线到全局（供插件和调试使用）
        window.eventBus = eventBus;
        console.log('✅ EventBus 已导出到全局');
        
        // ⭐ 2. 初始化核心功能模块
        searchManager.init();           // 搜索模块
        contextMenuManager.init();      // 右键菜单模块
        
        // 3. 初始化 UI 组件（显式调用）
        sidebarControl.init();
        sidebar.init();
        themeManager.init();
        tagModal.init();
        uiActions.init();
        graphView.init();
        dragDropManager.init();
        
        // 4. 初始化虚拟滚动
        setupVirtualScroll();
        
        // 5. 初始化标签管理器
        const tabManager = new TabManager();
        tabManager.init();
        window.tabManager = tabManager;
        
        // 6. 初始化链接系统
        initializeLinks();
        
        // 7. 初始化首页
        initializeHomepage();
        
        // 8. 绑定根目录操作按钮事件
        bindRootActions();  // ⭐ 新增函数
        
        // 9. 绑定工作区按钮
        if (domElements.openFolderBtn) {
            domElements.openFolderBtn.addEventListener('click', async () => {
                const workspaceManager = new WorkspaceManager();
                await workspaceManager.handleOpenWorkspace();
            });
        }
        
        // 10. 初始化插件系统
        if (window.pluginManager && window.pluginContext) {
            await window.pluginManager.init(window.pluginContext);
        }
        
        // 11. 延迟初始化编辑器和工作区
        setTimeout(async () => {
            await initializeMilkdownEditor();
            
            const workspaceManager = new WorkspaceManager();
            await workspaceManager.startupWithWorkspace();
        }, 100);
        
        console.log('✅ 应用初始化完成');
        
    } catch (error) {
        console.error('❌ 应用初始化失败:', error);
        showError('应用初始化失败: ' + error.message);
    }
}
// ⭐ 新增：绑定根目录操作按钮
function bindRootActions() {
    if (domElements.newNoteRootBtn) {
        domElements.newNoteRootBtn.addEventListener('click', () => {
            eventBus.emit('root-action:create-note');
        });
    }
    
    if (domElements.newFolderRootBtn) {
        domElements.newFolderRootBtn.addEventListener('click', () => {
            eventBus.emit('root-action:create-folder');
        });
    }
    
    // 快捷键
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'n' && !e.shiftKey) {
            e.preventDefault();
            eventBus.emit('root-action:create-note');
        }
        
        if (e.ctrlKey && e.shiftKey && e.key === 'N') {
            e.preventDefault();
            eventBus.emit('root-action:create-folder');
        }
        
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            eventBus.emit('editor:save');
        }
    });
    
    console.log('✅ 根目录操作按钮已绑定');
}

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);

// 导出必要的对象到全局（用于插件系统）
window.appState = appState;
window.TauriAPI = TauriAPI;

console.log('✅ 主入口模块加载完成');