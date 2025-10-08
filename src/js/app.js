// src/js/app.js
// CheetahNote - 应用入口、状态管理与初始化 (支持工作区版本)

'use strict';
console.log('📜 app.js 开始加载...');

const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;

const SEARCH_INACTIVITY_TIMEOUT = 5 * 60 * 1000;
const VIRTUAL_SCROLL_CONFIG = { ITEM_HEIGHT: 28, BUFFER_SIZE: 3, THROTTLE_DELAY: 16 };

const appState = {
    rootPath: null,
    activeFilePath: null,
    dbInitialized: false,
    searchQuery: '',
    currentViewMode: 'edit',
    hasUnsavedChanges: false,
    isSearching: false,
    contextTarget: null,
    expandedFolders: new Set(),
    indexInitialized: false,
    fileTreeRoot: [],
    fileTreeMap: new Map(),
    currentFileTags: [],
    allTags: [],
    activeTagFilter: null,
    searchInactivityTimer: null,
    isLoading: false,
    virtualScroll: {
        visibleItems: [],
        renderedRange: { start: 0, end: 0 },
        scrollTop: 0,
        containerHeight: 0
    }
};

var openFolderBtn, searchBox, searchInput, clearSearchBtn, fileListContainer, fileListElement,
    fileListSpacer, searchResultsList, markdownEditor, htmlPreview,
    saveBtn, contextMenu, newNoteBtn, newFolderBtn,
    deleteFileBtn, customConfirmDialog, viewToggleBtn, pinNoteBtn, unpinNoteBtn, editorContainer, renameItemBtn,
	newNoteRootBtn, newFolderRootBtn;


document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 app.js DOMContentLoaded');
    const startTime = performance.now();
    
    try {
        initDOMElements();
        setupVirtualScroll();
        bindEvents();
        
        const loadTime = performance.now() - startTime;
        console.log(`✅ DOM 和事件初始化完成，耗时: ${loadTime.toFixed(2)}ms`);

        initializeHomepage();

        // [核心修改] 新的启动流程
        setTimeout(async () => {
            await startupWithWorkspace();
        }, 100);
		

    } catch (error) {
        console.error('❌ 应用初始化失败:', error);
        alert('应用初始化失败: ' + error.message);
    }
});



/**
 * 显示欢迎界面
 */
function showWelcomeScreen() {
    // 显示首页
    if (window.tabManager && tabManager.switchToTab) {
        tabManager.switchToTab('home');
    }
    
    // 清空文件列表
    if (fileListElement) {
        fileListElement.innerHTML = '';
    }
    
    // 隐藏搜索框
    if (searchBox) {
        searchBox.style.display = 'none';
    }
}

function initDOMElements() {
    console.log('🔍 初始化 DOM 元素...');
    const getElement = (id) => {
        const el = document.getElementById(id);
        if (!el) throw new Error(`初始化失败：未在 HTML 中找到 ID 为 "${id}" 的元素。`);
        return el;
    };

    try {
        openFolderBtn = getElement('open-folder-btn');
        searchBox = getElement('search-box');
        searchInput = getElement('search-input');
        clearSearchBtn = getElement('clear-search-btn');
        fileListContainer = document.querySelector('.file-list-container');
        if (!fileListContainer) throw new Error("初始化失败：未找到 .file-list-container 元素。");

        fileListElement = getElement('file-list');
        searchResultsList = getElement('search-results-list');
        markdownEditor = getElement('markdown-editor');
        htmlPreview = getElement('html-preview');
        saveBtn = getElement('save-btn');
        contextMenu = getElement('context-menu');
        newNoteBtn = getElement('new-note-btn');
        newFolderBtn = getElement('new-folder-btn');
        deleteFileBtn = getElement('delete-file-btn');
        customConfirmDialog = getElement('custom-confirm-dialog');
        viewToggleBtn = getElement('view-toggle-btn');
        pinNoteBtn = getElement('pin-note-btn');
        unpinNoteBtn = getElement('unpin-note-btn');
        editorContainer = getElement('editor-container');
        renameItemBtn = getElement('rename-item-btn');
		newNoteRootBtn = getElement('new-note-root-btn'); // [新增]
		newFolderRootBtn = getElement('new-folder-root-btn'); // [新增]

    } catch (error) {
        throw error;
    }
    console.log('✅ DOM 元素已初始化');
}

function bindEvents() {
    console.log('🔗 开始绑定事件...');
    
    // [修改] 打开文件夹现在使用工作区管理器
    openFolderBtn.addEventListener('click', handleOpenWorkspace);
    
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    clearSearchBtn.addEventListener('click', clearSearch);
    viewToggleBtn.addEventListener('click', toggleViewMode);
    saveBtn.addEventListener('click', handleSaveFile);
    
    newNoteBtn.addEventListener('click', handleCreateNote);
    newFolderBtn.addEventListener('click', handleCreateFolder);
    deleteFileBtn.addEventListener('click', handleDeleteFile);
    document.addEventListener('click', () => hideContextMenu());
    renameItemBtn.addEventListener('click', handleRenameItem);
	// [新增] 绑定根目录新建按钮事件
    newNoteRootBtn.addEventListener('click', handleCreateNoteInRoot);
    newFolderRootBtn.addEventListener('click', handleCreateFolderInRoot);
    
    markdownEditor.addEventListener('input', () => {
        appState.hasUnsavedChanges = true;
    });
    
    document.addEventListener('keydown', (e) => {
		 // Ctrl+N 新建笔记
        if (e.ctrlKey && e.key === 'n' && !e.shiftKey) {
            e.preventDefault();
            handleCreateNoteInRoot();
        }
        
        // Ctrl+Shift+N 新建文件夹
        if (e.ctrlKey && e.shiftKey && e.key === 'N') {
            e.preventDefault();
            handleCreateFolderInRoot();
        }
        
        // Ctrl+S 保存
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            handleSaveFile();
        }
    });
    
    fileListElement.addEventListener('click', handleFileListClick);
    fileListElement.addEventListener('contextmenu', handleFileListContextMenu);
    
    pinNoteBtn.addEventListener('click', handlePinNote);
    unpinNoteBtn.addEventListener('click', handleUnpinNote);
    
    console.log('✅ 事件绑定完成');
}

/**
 * [新增] 处理打开工作区
 */
async function handleOpenWorkspace() {
    const workspacePath = await workspaceManager.selectWorkspace();
    
    if (workspacePath) {
        // 设置 rootPath
        appState.rootPath = workspacePath;
        appState.fileTreeRoot = [];
        appState.fileTreeMap.clear();
        appState.activeTagFilter = null;
        
        try {
            // 数据库迁移（如果需要）
            await invoke('migrate_paths_to_relative', { rootPath: workspacePath });
        } catch (e) {
            console.error("数据库迁移失败:", e);
        }
        
        // 刷新文件树
        await refreshFileTree("");
        searchBox.style.display = 'block';
        
        if (window.refreshAllTagsList) {
            await refreshAllTagsList();
        }
    }
}



// 在 app.js 的 startupWithWorkspace 函数中添加清理逻辑

/**
 * [新增] 支持工作区的启动流程 (带清理)
 */
async function startupWithWorkspace() {
    console.log('🏁 开始启动流程...');

    // 尝试恢复上次的工作区
    const restored = await workspaceManager.restoreLastWorkspace();

    if (restored) {
        console.log('✅ 成功恢复上次的工作区');
        
        // 获取当前工作区路径
        const currentWorkspace = await invoke('get_current_workspace');
        
        if (currentWorkspace) {
            // 设置 rootPath
            appState.rootPath = currentWorkspace;
            
            // [新增] 清理无效的历史记录和置顶
            try {
                console.log('🧹 清理无效的历史记录...');
                const cleanupCount = await invoke('cleanup_invalid_history', { 
                    rootPath: currentWorkspace 
                });
                
                if (cleanupCount > 0) {
                    console.log(`✅ 清理了 ${cleanupCount} 个无效记录`);
                }
            } catch (error) {
                console.warn('清理历史记录失败:', error);
            }
            
            // 刷新文件树
            await refreshFileTree("");
            searchBox.style.display = 'block';
            
            if (window.refreshAllTagsList) {
                await refreshAllTagsList();
            }
            
            // 恢复上次打开的文件
            await restoreLastFileInWorkspace();
        }
    } else {
        console.log('📝 显示欢迎界面');
        showWelcomeScreen();
    }

    console.log('✅ 应用启动完成');
}

/**
 * [新增] 在工作区内恢复上次打开的文件 (带验证)
 */
async function restoreLastFileInWorkspace() {
    try {
        const lastFile = localStorage.getItem('cheetah_last_file');
        const expandedStr = localStorage.getItem('cheetah_expanded_folders');
        
        if (expandedStr) {
            try {
                const expanded = JSON.parse(expandedStr);
                appState.expandedFolders = new Set(expanded);
            } catch (e) {
                console.warn('恢复展开状态失败:', e);
            }
        }
        
        // [修复] 验证文件是否存在再打开
        if (lastFile) {
            try {
                await invoke('read_file_content', {
                    rootPath: appState.rootPath,
                    relativePath: lastFile
                });
                // 文件存在，打开它
                tabManager.openTab(lastFile);
            } catch (error) {
                console.warn('上次打开的文件不存在:', lastFile);
                // 清除无效的记录
                localStorage.removeItem('cheetah_last_file');
            }
        }
    } catch (error) {
        console.warn('恢复文件会话失败:', error);
    }
}



// 导出必要的函数和变量
window.appState = appState;
window.showWelcomeScreen = showWelcomeScreen;
window.handleOpenWorkspace = handleOpenWorkspace;

console.log('✅ app.js 加载完成');