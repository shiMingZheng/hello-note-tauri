// src/js/app.js
// CheetahNote - 应用入口、状态管理与初始化 (支持工作区版本)
// 在现有 import 语句后添加：
// 注意：由于 plugin-manager.js 和 plugin-context.js 不是模块，
// 它们通过 <script> 标签加载，所以不需要 import

'use strict';
console.log('📜 app.js 开始加载...');

const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;

const SEARCH_INACTIVITY_TIMEOUT = 2 * 60 * 1000;
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
	fileTreeCache: null, // 【改动】改为 LRUCache 实例，在 DOMContentLoaded 中初始化
   
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

// 【新增】辅助函数：确保状态初始化
function ensureAppStateInitialized() {
    if (!appState.fileTreeCache && window.LRUCache) {
        console.log('🔧 [ensureAppState] 初始化 fileTreeCache');
        appState.fileTreeCache = new window.LRUCache(500);
    }
    
    if (!appState.expandedFolders) {
        console.log('🔧 [ensureAppState] 初始化 expandedFolders');
        appState.expandedFolders = new Set();
    }
}

const globalEventHandlers = {
    keydown: null,
    beforeunload: null
};


var openFolderBtn, searchBox, searchInput, clearSearchBtn, fileListContainer, fileListElement,
    fileListSpacer, searchResultsList, 
    saveBtn, contextMenu, newNoteBtn, newFolderBtn,
    deleteFileBtn, customConfirmDialog, viewToggleBtn, pinNoteBtn, unpinNoteBtn, editorContainer, renameItemBtn,
    newNoteRootBtn, newFolderRootBtn;

// ⚠️ 移除 htmlPreview 的声明，它已经在 editor.js 中声明


// 位置：app.js DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 app.js DOMContentLoaded');
    const startTime = performance.now();
    
    try {
        // 【新增】确保 LRUCache 已加载
        if (!window.LRUCache) {
            console.warn('⚠️ LRUCache 未加载，等待...');
            await new Promise(resolve => setTimeout(resolve, 100));
            
            if (!window.LRUCache) {
                throw new Error('LRUCache 加载失败');
            }
        }
        
        // 【新增】初始化 LRU 缓存
        appState.fileTreeCache = new window.LRUCache(500);
        console.log('✅ LRU 缓存已初始化');
        
        // 【新增】确保 expandedFolders 已初始化
        if (!appState.expandedFolders) {
            appState.expandedFolders = new Set();
        }
        
        initDOMElements();
        setupVirtualScroll();
        bindEvents();
        
        const loadTime = performance.now() - startTime;
        console.log(`✅ DOM 和事件初始化完成，耗时: ${loadTime.toFixed(2)}ms`);

        initializeHomepage();

        setTimeout(async () => {
            await initializeMilkdownEditor();
            await startupWithWorkspace();
            
            // 启动窗口管理器
            if (window.windowManager) {
                await window.windowManager.init();
                console.log('✅ 窗口管理器已启动');
            }
        }, 100);

    } catch (error) {
        console.error('❌ 应用初始化失败:', error);
        alert('应用初始化失败: ' + error.message);
    }
});

/**
 * ⭐ 初始化 Milkdown 编辑器
 */
async function initializeMilkdownEditor() {
    console.log('🎯 [initializeMilkdownEditor] 准备初始化...');
    
    if (!window.milkdownEditor) {
        console.warn('⚠️ [initializeMilkdownEditor] 等待模块加载...');
        
        let attempts = 0;
        while (!window.milkdownEditor && attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!window.milkdownEditor) {
            throw new Error('Milkdown 模块加载超时');
        }
    }
    
    try {
        await window.milkdownEditor.init('#milkdown-editor', (markdown) => {
            if (appState.activeFilePath && !appState.activeFilePath.startsWith('untitled-')) {
                appState.hasUnsavedChanges = true;
                console.log('📝 [回调] 编辑器内容已变更');
            }
        });
        
        const currentTheme = window.themeManager?.getCurrent() || 'light';
        window.milkdownEditor.applyTheme(currentTheme);
        
        console.log('✅ [initializeMilkdownEditor] 编辑器初始化成功');
    } catch (error) {
        console.error('❌ [initializeMilkdownEditor] 初始化失败:', error);
        showError('编辑器初始化失败: ' + error.message);
        throw error;
    }
}

/**
 * 启用备用编辑器（传统 textarea）
 */
function enableFallbackEditor() {
    const editorContainer = document.getElementById('milkdown-editor');
    if (!editorContainer) return;
    
    console.log('🔄 启用备用编辑器模式');
    
    // 隐藏 Milkdown 容器
    editorContainer.style.display = 'none';
    
    // 创建传统 textarea
    const textarea = document.createElement('textarea');
    textarea.id = 'markdown-editor-fallback';
    textarea.className = 'markdown-editor';
    textarea.style.cssText = `
        width: 100%;
        height: 100%;
        padding: 20px;
        border: none;
        outline: none;
        resize: none;
        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
        font-size: 14px;
        line-height: 1.8;
        background: var(--bg-primary);
        color: var(--text-primary);
    `;
    
    editorContainer.parentElement.appendChild(textarea);
    
    // 更新全局引用
    window.markdownEditor = textarea;
    
    // 重写加载和保存函数
    window.loadFileToEditor = async function(relativePath) {
        try {
            const content = await invoke('read_file_content', { 
                rootPath: appState.rootPath,
                relativePath: relativePath
            });
            textarea.value = content;
            appState.activeFilePath = relativePath;
            appState.hasUnsavedChanges = false;
        } catch (error) {
            showError('加载文件失败: ' + error);
        }
    };
    
    window.handleSaveFile = async function() {
        const relativePath = appState.activeFilePath;
        if (!relativePath) { 
            showError('没有打开的文件'); 
            return; 
        }
        
        try {
            const content = textarea.value;
            await invoke('save_file', {
                rootPath: appState.rootPath,
                relativePath: relativePath,
                content
            });
            appState.hasUnsavedChanges = false;
            showSuccessMessage('保存成功');
            saveLastFile(relativePath);
        } catch (error) {
            showError('保存文件失败: ' + error);
        }
    };
    
    // 监听输入
    textarea.addEventListener('input', () => {
        appState.hasUnsavedChanges = true;
    });
    
    console.log('✅ 备用编辑器已启用');
}

function showWelcomeScreen() {
    if (window.tabManager && tabManager.switchToTab) {
        tabManager.switchToTab('home');
    }
    
    if (fileListElement) {
        fileListElement.innerHTML = '';
    }
    
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
        
        // ⚠️ 不再初始化 markdownEditor 和 htmlPreview，由 editor.js 处理
        
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
        newNoteRootBtn = getElement('new-note-root-btn');
        newFolderRootBtn = getElement('new-folder-root-btn');

    } catch (error) {
        throw error;
    }
    console.log('✅ DOM 元素已初始化');
}

function bindEvents() {
    console.log('🔗 开始绑定事件...');
    
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
    newNoteRootBtn.addEventListener('click', handleCreateNoteInRoot);
    newFolderRootBtn.addEventListener('click', handleCreateFolderInRoot);
    
	// 【新增】保存全局快捷键处理器
    const keydownHandler = (e) => {
        if (e.ctrlKey && e.key === 'n' && !e.shiftKey) {
            e.preventDefault();
            handleCreateNoteInRoot();
        }
        
        if (e.ctrlKey && e.shiftKey && e.key === 'N') {
            e.preventDefault();
            handleCreateFolderInRoot();
        }
        
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            handleSaveFile();
        }
    };
	document.addEventListener('keydown', keydownHandler);
    globalEventHandlers.keydown = keydownHandler;

       
    // 【新增】未保存提示
    const beforeunloadHandler = (e) => {
        if (appState.hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    };
	
	

    fileListElement.addEventListener('click', handleFileListClick);
    fileListElement.addEventListener('contextmenu', handleFileListContextMenu);
    
    pinNoteBtn.addEventListener('click', handlePinNote);
    unpinNoteBtn.addEventListener('click', handleUnpinNote);
	
	window.addEventListener('beforeunload', beforeunloadHandler);
    globalEventHandlers.beforeunload = beforeunloadHandler;

    
    console.log('✅ 事件绑定完成');
}

// 位置：app.js handleOpenWorkspace 函数
async function handleOpenWorkspace() {
    const workspacePath = await workspaceManager.selectWorkspace();
    
    if (workspacePath) {
        console.log('📂 选择的工作区:', workspacePath);
        
        // 【修复】确保状态对象已初始化
        if (!appState.fileTreeCache) {
            console.warn('⚠️ fileTreeCache 未初始化，正在创建...');
            if (window.LRUCache) {
                appState.fileTreeCache = new window.LRUCache(500);
            } else {
                console.error('❌ LRUCache 未定义');
                showError('应用初始化失败，请刷新页面');
                return;
            }
        }
        
        if (!appState.expandedFolders) {
            console.warn('⚠️ expandedFolders 未初始化，正在创建...');
            appState.expandedFolders = new Set();
        }
        
        // 设置工作区路径
        appState.rootPath = workspacePath;
        appState.fileTreeRoot = [];
        appState.fileTreeCache.clear();
        appState.expandedFolders.clear();
        appState.activeTagFilter = null;
        
        try {
            // 路径迁移（如果需要）
            await invoke('migrate_paths_to_relative', { rootPath: workspacePath });
        } catch (e) {
            console.error("数据库迁移失败:", e);
        }
        
        // 刷新文件树
        await refreshFileTree("");
        
        // 显示搜索框
        if (searchBox) {
            searchBox.style.display = 'block';
        }
        
        // 刷新标签列表
        if (window.refreshAllTagsList) {
            await refreshAllTagsList();
        }
        
        console.log('✅ 工作区加载完成');
    }
}

// 位置：app.js startupWithWorkspace 函数
async function startupWithWorkspace() {
    console.log('🏁 开始启动流程...');

    // 【新增】确保基础状态已初始化
    if (!appState.fileTreeCache && window.LRUCache) {
        console.log('🔧 初始化 LRU 缓存...');
        appState.fileTreeCache = new window.LRUCache(500);
    }
    
    if (!appState.expandedFolders) {
        console.log('🔧 初始化 expandedFolders...');
        appState.expandedFolders = new Set();
    }

    const restored = await workspaceManager.restoreLastWorkspace();

    if (restored) {
        console.log('✅ 成功恢复上次的工作区');
        
        const currentWorkspace = await invoke('get_current_workspace');
        
        if (currentWorkspace) {
            appState.rootPath = currentWorkspace;
            
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
            
            await refreshFileTree("");
            
            if (searchBox) {
                searchBox.style.display = 'block';
            }
            
            if (window.refreshAllTagsList) {
                await refreshAllTagsList();
            }
            
            await restoreLastFileInWorkspace();
        }
    } else {
        console.log('📝 显示欢迎界面');
        showWelcomeScreen();
    }

    console.log('✅ 应用启动完成');
}

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
        
        if (lastFile) {
            try {
                await invoke('read_file_content', {
                    rootPath: appState.rootPath,
                    relativePath: lastFile
                });
                tabManager.openTab(lastFile);
            } catch (error) {
                console.warn('上次打开的文件不存在:', lastFile);
                localStorage.removeItem('cheetah_last_file');
            }
        }
    } catch (error) {
        console.warn('恢复文件会话失败:', error);
    }
}

// 位置：app.js 末尾
// 改造点：新增清理函数

/**
 * 全局资源清理
 */
function globalCleanup() {
    console.log('🧹 开始全局资源清理...');
    
    // 1. 清理文件树缓存
    if (appState.fileTreeCache) {
        appState.fileTreeCache.clear();
        console.log('  ✅ 文件树缓存已清空');
    }
    
    // 2. 清理编辑器
    if (window.milkdownEditor && window.milkdownEditor.destroy) {
        window.milkdownEditor.destroy();
        console.log('  ✅ Milkdown 编辑器已销毁');
    }
    
    // 3. 清理图谱
    if (window.closeGraphView) {
        window.closeGraphView();
        console.log('  ✅ 图谱资源已释放');
    }
    
    // 4. 释放搜索索引
    invoke('release_index').catch(err => console.warn('索引释放失败:', err));
    
     // 5. 【改进】清理事件监听器
    if (globalEventHandlers.keydown) {
        document.removeEventListener('keydown', globalEventHandlers.keydown);
        globalEventHandlers.keydown = null;
    }
    
    if (globalEventHandlers.beforeunload) {
        window.removeEventListener('beforeunload', globalEventHandlers.beforeunload);
        globalEventHandlers.beforeunload = null;
    }
    
    // 6. 【新增】清理虚拟滚动监听器
    if (fileListContainer) {
        fileListContainer.removeEventListener('scroll', handleVirtualScroll);
    }

    
    console.log('✅ 全局资源清理完成');
}


// 【新增】在工作区关闭时调用
async function handleCloseWorkspace() {
    globalCleanup();
    await workspaceManager.closeWorkspace();
}

// 导出清理函数
window.globalCleanup = globalCleanup;

window.handleCloseWorkspace = handleCloseWorkspace;
// 导出必要的函数和变量
window.appState = appState;
window.showWelcomeScreen = showWelcomeScreen;
window.handleOpenWorkspace = handleOpenWorkspace;
window.initializeMilkdownEditor = initializeMilkdownEditor;
window.enableFallbackEditor = enableFallbackEditor;

console.log('✅ app.js 加载完成');