// src/js/app.js
// CheetahNote - 应用入口、状态管理与初始化 (支持工作区版本)
// 在现有 import 语句后添加：
// 注意：由于 plugin-manager.js 和 plugin-context.js 不是模块，
// 它们通过 <script> 标签加载，所以不需要 import

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
    fileListSpacer, searchResultsList, 
    saveBtn, contextMenu, newNoteBtn, newFolderBtn,
    deleteFileBtn, customConfirmDialog, viewToggleBtn, pinNoteBtn, unpinNoteBtn, editorContainer, renameItemBtn,
    newNoteRootBtn, newFolderRootBtn;

// ⚠️ 移除 htmlPreview 的声明，它已经在 editor.js 中声明


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

		// ⭐【新增】初始化插件系统
        if (window.pluginManager && window.pluginContext) {
            await window.pluginManager.init(window.pluginContext);
        }
        // 启动工作区
        setTimeout(async () => {
			// ⭐ 初始化 Milkdown 编辑器
			await initializeMilkdownEditor();
            await startupWithWorkspace();
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
    
    document.addEventListener('keydown', (e) => {
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
    });
    
    fileListElement.addEventListener('click', handleFileListClick);
    fileListElement.addEventListener('contextmenu', handleFileListContextMenu);
    
    pinNoteBtn.addEventListener('click', handlePinNote);
    unpinNoteBtn.addEventListener('click', handleUnpinNote);
    
    console.log('✅ 事件绑定完成');
}

async function handleOpenWorkspace() {
    const workspacePath = await workspaceManager.selectWorkspace();
    
    if (workspacePath) {
        appState.rootPath = workspacePath;
        appState.fileTreeRoot = [];
        appState.fileTreeMap.clear();
        appState.activeTagFilter = null;
        
        // ✅ 第一步:恢复展开状态
        await restoreLastFileInWorkspace();
        
        try {
            await invoke('migrate_paths_to_relative', { rootPath: workspacePath });
        } catch (e) {
            console.error("数据库迁移失败:", e);
        }
        
        // ✅ 第二步:刷新文件树
        await refreshFileTree("");
        searchBox.style.display = 'block';
        
        if (window.refreshAllTagsList) {
            await refreshAllTagsList();
        }
        
        // ✅ 第三步:打开上次的文件
        await openLastFile();
    }
}

async function startupWithWorkspace() {
    console.log('🏁 开始启动流程...');

    const restored = await workspaceManager.restoreLastWorkspace();

    if (restored) {
        console.log('✅ 成功恢复上次的工作区');
        
        const currentWorkspace = await invoke('get_current_workspace');
        
        if (currentWorkspace) {
            appState.rootPath = currentWorkspace;
            
            // ✅ 第一步:只恢复展开状态,不打开文件
            await restoreLastFileInWorkspace();
            
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
            
            // ✅ 第二步:刷新文件树(此时展开状态已恢复)
            await refreshFileTree("");
            searchBox.style.display = 'block';
            
            if (window.refreshAllTagsList) {
                await refreshAllTagsList();
            }
            
            // ✅ 第三步:文件树加载完成后,再打开上次的文件
            await openLastFile();
        }
    } else {
        console.log('📝 显示欢迎界面');
        showWelcomeScreen();
    }

    console.log('✅ 应用启动完成');
}

async function restoreLastFileInWorkspace() {
    try {
        // ✅ 第一步:先恢复展开状态
        const expandedStr = localStorage.getItem('cheetah_expanded_folders');
        if (expandedStr) {
            try {
                const expanded = JSON.parse(expandedStr);
                appState.expandedFolders = new Set(expanded);
				console.log('✅ 恢复展开状态:', expanded.length, '个文件夹');
                // ✅ 调试:显示具体路径
                console.log('📋 展开的文件夹路径列表:', expanded);
            } catch (e) {
                console.warn('⚠️ 恢复展开状态失败:', e);
                appState.expandedFolders = new Set();
            }
        }
        
        // ✅ 第二步:恢复上次打开的文件
        // ⚠️ 注意:不要在这里打开文件,因为文件树还没加载
        // 我们只是验证文件存在,但不打开标签页
        const lastFile = localStorage.getItem('cheetah_last_file');
        if (lastFile) {
            try {
                await invoke('read_file_content', {
                    rootPath: appState.rootPath,
                    relativePath: lastFile
                });
                // ✅ 只是标记,不立即打开
                console.log('✅ 上次打开的文件存在:', lastFile);
            } catch (error) {
                console.warn('⚠️ 上次打开的文件不存在:', lastFile);
                localStorage.removeItem('cheetah_last_file');
            }
        }
    } catch (error) {
        console.warn('⚠️ 恢复文件会话失败:', error);
    }
}
/**
 * 打开上次的文件(在文件树加载完成后调用)
 */
async function openLastFile() {
    try {
        const lastFile = localStorage.getItem('cheetah_last_file');
        if (lastFile) {
            tabManager.openTab(lastFile);
            console.log('✅ 已打开上次的文件:', lastFile);
        }
    } catch (error) {
        console.warn('⚠️ 打开文件失败:', error);
    }
}

// 导出必要的函数和变量

console.log('✅ app.js 加载完成');