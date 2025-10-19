// src/js/main.js
'use strict';

console.log('🚀 CheetahNote 主入口开始加载...');
import { eventBus } from './core/EventBus.js';
import { fileChangeListener } from './file-change-listener.js';

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
// src/js/main.js

// src/js/main.js

async function initApp() {
    console.log('🎯 初始化应用...');
    
    try {
        // ⭐ 1. 初始化 DOM 和无依赖的模块
        initializeDOMElements(); 
        window.eventBus = eventBus;
        console.log('✅ EventBus 已导出到全局');
        
        themeManager.init(); 

        // ⭐ 2. 初始化虚拟滚动系统 (startup 依赖它)
        setupVirtualScroll();

        // 3. 初始化其他“预加载”模块 (不依赖工作区数据)
        searchManager.init();
        contextMenuManager.init();
        sidebarControl.init();
        tagModal.init();
        uiActions.init();
        dragDropManager.init();
        initializeLinks();
        initializeHomepage(); // 初始化首页（欢迎页）

        // ⭐ 4. 【关键修复】实例化并初始化 TabManager
        // 必须在 workspaceManager.startup() 之前完成
        // 因为 startup() 会调用 openLastFile() 来使用 tabManager
        const tabManager = new TabManager();
        tabManager.init();
        window.tabManager = tabManager;
        
        // ⭐ 5. 实例化并启动 WorkspaceManager
        // (这会加载数据, 并使用已就绪的 tabManager 切换视图)
        const workspaceManager = new WorkspaceManager();
        await workspaceManager.startup();
        console.log('✅ 工作区加载完毕');

        // ⭐ 6. 【关键修复】最后初始化编辑器
        // 此时 startup() 应该已经切换了 Tab，使编辑器容器可见
        await initializeMilkdownEditor();
        console.log('✅ 编辑器初始化完毕');

        // ⭐ 7. 初始化依赖“数据”和“编辑器”的模块
        sidebar.init();           
        graphView.init();         
        
        // 8. 绑定剩余的事件
        bindRootActions();
        
        // 绑定打开工作区按钮 (复用已创建的 manager 实例)
        if (domElements.openFolderBtn) {
            domElements.openFolderBtn.addEventListener('click', async () => {
                await workspaceManager.selectWorkspace();
            });
        }
        
        // 9. 初始化插件系统
        if (window.pluginManager && window.pluginContext) {
            await window.pluginManager.init(window.pluginContext);
        }
        
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

// 导出到全局（供 TabManager 等模块使用）
window.loadFileToEditor = loadFileToEditor;
window.handleSaveFile = handleSaveFile;
window.toggleViewMode = toggleViewMode;


console.log('✅ 主入口模块加载完成');