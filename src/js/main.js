// src/js/main.js
'use strict';

console.log('🚀 CheetahNote 主入口开始加载...');

// 核心模块
import { appState } from './core/AppState.js';
import { TauriAPI } from './core/TauriAPI.js';

// 工具模块
import { showError, showSuccessMessage, showCustomConfirm } from './ui-utils.js';
import { initializeTheme } from './theme.js';
import { initializeSidebarControl } from './sidebar-control.js';

// 功能模块
import { setupVirtualScroll, updateVirtualScrollData } from './virtual-scroll.js';
import { TabManager } from './tab_manager.js';
import { initializeLinks, updateBacklinksUI } from './links.js';
import { initializeTagModal } from './tag_modal.js';
import { initializeSidebar } from './sidebar.js';
import { initializeHomepage, loadPinnedNotes, loadHistory } from './homepage.js';
import { handleSearch, clearSearch, handleSaveFile, toggleViewMode, loadFileToEditor } from './editor.js';
import * as fileManager from './file-manager.js';
import { initializeUIActions } from './ui_actions.js';
import { initializeGraph } from './graph.js';
import { WorkspaceManager } from './workspace.js';

// 应用初始化
async function initApp() {
    console.log('🎯 初始化应用...');
    
    try {
        // 1. 初始化主题
        initializeTheme();
        
        // 2. 初始化 UI 组件
        initializeSidebarControl();
        setupVirtualScroll();
        
        // 3. 创建管理器实例
        window.tabManager = new TabManager();
		window.tabManager.init();  // 别忘了调用 init()
        window.workspaceManager = new WorkspaceManager();
        
        // 4. 初始化功能模块
		// 初始化链接
		initializeLinks();
		
		// 导出到全局
		window.updateBacklinksUI = updateBacklinksUI;
        initializeTagModal();
        initializeSidebar();
		// 导出 homepage 函数到全局
		window.initializeHomepage = initializeHomepage;
		window.loadPinnedNotes = loadPinnedNotes;
		window.loadHistory = loadHistory;
        initializeEditor();
        // 导出 file-manager 函数到全局
		Object.assign(window, fileManager);
        initializeUIActions();
        initializeGraph();// 初始化图谱

        
        // 5. 启动工作区
        await window.workspaceManager.startup();
        
        console.log('✅ 应用初始化完成');
    } catch (error) {
        console.error('❌ 应用初始化失败:', error);
        showError('应用初始化失败: ' + error);
    }
}

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);

// 导出必要的对象到全局(用于插件系统)
window.appState = appState;
window.TauriAPI = TauriAPI;

console.log('✅ 主入口模块加载完成');