// src/js/main.js
'use strict';

console.log('🚀 CheetahNote 主入口开始加载...');
import { eventBus } from './core/EventBus.js';
import { fileChangeListener } from './file-change-listener.js';

// 核心模块
import { appState } from './core/AppState.js';
import { TauriAPI } from './core/TauriAPI.js';
import { domElements, initializeDOMElements } from './dom-init.js';

// 工具模块
import { showError, showSuccessMessage, showCustomConfirm } from './ui-utils.js';
import { themeManager } from './theme.js';
import { sidebarControl } from './sidebar-control.js';

// 功能模块
import { setupVirtualScroll, updateVirtualScrollData } from './virtual-scroll.js';
import { TabManager } from './tab_manager.js';
import { initializeLinks } from './links.js';
import { tagModal } from './tag_modal.js';
import { sidebar } from './sidebar.js';
import { initializeHomepage, loadPinnedNotes, loadHistory } from './homepage.js';
import * as fileManager from './file-manager.js';
import { uiActions } from './ui_actions.js';
import { WorkspaceManager } from './workspace.js';

// ⭐ 唯一的编辑器和插件系统
import { dragDropManager } from './drag-drop.js';
import { pluginManager } from './plugin-manager.js';
import { pluginContext } from './plugin-context.js';
import { searchManager } from './search.js';
import { contextMenuManager } from './context-menu.js';
import { handleSaveFile, loadFileToEditor } from './editor.js'; // 保留编辑器相关
import { tabManager } from './tab_manager.js';
import { outlineManager } from './outline.js';
import { codemirrorEditor } from './codemirror-editor.js'; // 唯一的编辑器

/**
 * 初始化 CodeMirror 编辑器
 */
async function initializeCodeMirrorEditor() {
    console.log('🎨 [main.js] 开始初始化 CodeMirror 编辑器...');
    
    if (!codemirrorEditor) {
        throw new Error('codemirrorEditor 模块未加载');
    }
    
    try {
        codemirrorEditor.init('#codemirror-editor');
        console.log('✅ [main.js] CodeMirror 编辑器初始化完成');
    } catch (error) {
        console.error('❌ [main.js] CodeMirror 编辑器初始化失败:', error);
        throw error;
    }
}

/**
 * 应用初始化
 */
async function initApp() {
    console.log('🎯 初始化应用...');
    
    try {
        // 1. 初始化 DOM 和无依赖的模块
        initializeDOMElements(); 
        window.eventBus = eventBus;
        console.log('✅ EventBus 已导出到全局');
        
        themeManager.init(); 

        // 2. 初始化虚拟滚动
        setupVirtualScroll();

        // 3. 初始化其他“预加载”模块
        searchManager.init();
        contextMenuManager.init();
        sidebarControl.init();
        tagModal.init();
        uiActions.init();
        dragDropManager.init();
        initializeLinks();
        initializeHomepage();
		outlineManager.init();

        // 4. 实例化并初始化 TabManager
        tabManager.init();
       
        // 5. 调整初始化顺序
        sidebar.init();

        // 6. ⭐ 初始化唯一的编辑器：CodeMirror
        await initializeCodeMirrorEditor();

        // 7. 实例化并启动 WorkspaceManager
        const workspaceManager = new WorkspaceManager();
        workspaceManager.subscribeToEvents(); 

        if (domElements.openFolderBtn) {
            domElements.openFolderBtn.addEventListener('click', () => {
                console.log('📂 "打开文件夹"按钮被点击');
                eventBus.emit('workspace:select-new');
            });
            console.log('✅ "打开文件夹"按钮事件已绑定');
        } else {
             console.warn('⚠️ 未找到 "打开文件夹" 按钮');
        }
		
        if (domElements.outlineBtn) {
            domElements.outlineBtn.addEventListener('click', () => {
				sidebar.hideTagsPopover();
                eventBus.emit('outline:toggle-visibility');
            });
            console.log('✅ 大纲按钮事件已绑定');
        } else {
             console.warn('⚠️ 未找到大纲按钮 (outlineBtn)');
        }
		
        await workspaceManager.startup();
        console.log('✅ 工作区加载完毕');
		
        // 8. 绑定剩余的事件
        bindRootActions();
        
		// 9. 封装原生 window 事件
		window.addEventListener('resize', () => {
			eventBus.emit('browser:resize');
		});
        console.log('✅ 已设置全局 resize 事件监听');
		
        console.log('✅ 应用初始化完成');
        
    } catch (error) {
        console.error('❌ 应用初始化失败:', error);
        showError('应用初始化失败: ' + error.message);
    }
}

/**
 * 绑定根目录和全局操作按钮
 */
function bindRootActions() {
    if (domElements.newNoteRootBtn) {
        domElements.newNoteRootBtn.addEventListener('click', () => {
			outlineManager.hide();
			sidebar.hideTagsPopover();
            eventBus.emit('root-action:create-note');
        });
    }
    
    if (domElements.newFolderRootBtn) {
        domElements.newFolderRootBtn.addEventListener('click', () => {
			outlineManager.hide();
			sidebar.hideTagsPopover();
            eventBus.emit('root-action:create-folder');
        });
    }
	
	// ⭐ 改造：模式切换按钮逻辑
	const viewToggleBtn = document.getElementById('view-toggle-btn');
	if (viewToggleBtn) {
		viewToggleBtn.addEventListener('click', () => {
            // 循环切换: live-preview (实时预览) -> source (源码)
			const nextMode = appState.editorMode === 'live-preview' ? 'source' : 'live-preview';
			eventBus.emit('editor:switch-mode', nextMode);
		});
	}

    // 绑定保存按钮
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            console.log('🖱️ [保存按钮] 被点击');
            eventBus.emit('editor:save');
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

console.log('✅ 主入口模块加载完成');