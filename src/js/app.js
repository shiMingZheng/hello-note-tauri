// src/js/app.js
// CheetahNote - 应用入口、状态管理与初始化

'use strict';

console.log('📜 app.js 开始加载...');

// ========================================
// 导入 Tauri API
// ========================================
const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;
// ... (在 const { invoke } ... 下方)
const SEARCH_INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5分钟

// ========================================
// 虚拟滚动配置
// ========================================
const VIRTUAL_SCROLL_CONFIG = {
    ITEM_HEIGHT: 28,           // 每个列表项的固定高度（像素）
    BUFFER_SIZE: 5,            // 上下缓冲区的额外渲染项数
    THROTTLE_DELAY: 16         // 滚动事件节流延迟（约60fps）
};

// ========================================
// 本地存储键名
// ========================================
const STORAGE_KEYS = {
    LAST_FOLDER: 'cheetah_last_folder',
    LAST_FILE: 'cheetah_last_file',
    EXPANDED_FOLDERS: 'cheetah_expanded_folders'
};

// ========================================
// 全局状态管理
// ========================================
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
    //fullFileTree: [],          // 完整文件树缓存
	 // 新增: 用于懒加载的数据结构
    fileTreeRoot: [],          // 只存储顶层文件/目录
    fileTreeMap: new Map(),    // 存储已加载的目录内容 { 'path': [children] }
	// 新增: 用于索引释放的计时器
    searchInactivityTimer: null,
    isLoading: false,
    // 虚拟滚动状态
    virtualScroll: {
        visibleItems: [],      // 当前应该可见的所有项（扁平化）
        renderedRange: { start: 0, end: 0 },  // 当前渲染的范围
        scrollTop: 0,          // 当前滚动位置
        containerHeight: 0     // 容器可视高度
    }
};

// ========================================
// DOM 元素引用
// ========================================
let openFolderBtn;
let searchBox;
let searchInput;
let clearSearchBtn;
let fileListContainer;         // 滚动容器
let fileListElement;           // 实际的 ul 列表
let fileListSpacer;            // 撑开滚动条的哨兵元素
let searchResultsList;
let welcomeScreen;
let editorWrapper;
let markdownEditor;
let htmlPreview;
let editModeBtn;
let previewModeBtn;
let saveBtn;
let contextMenu;
let newNoteBtn;
let newFolderBtn;
let deleteFileBtn;
let customConfirmDialog;

// ========================================
// 初始化应用
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 app.js DOMContentLoaded');
    const startTime = performance.now();
    
    try {
        await initializeApp();
        const loadTime = performance.now() - startTime;
        console.log(`✅ 前端加载完成，耗时: ${loadTime.toFixed(2)}ms`);
    } catch (error) {
        console.error('❌ 初始化失败:', error);
        alert('应用初始化失败: ' + error.message);
    }
});

/**
 * 初始化应用
 */
async function initializeApp() {
    console.log('⚙️ 开始初始化...');
    
    initDOMElements();
    setupVirtualScroll();
    bindEvents();
    
    await restoreLastSession();
    
    console.log('✅ CheetahNote 初始化完成');
}

/**
 * 初始化 DOM 元素引用
 */
function initDOMElements() {
    console.log('🔍 初始化 DOM 元素...');
    
    openFolderBtn = document.getElementById('open-folder-btn');
    searchBox = document.getElementById('search-box');
    searchInput = document.getElementById('search-input');
    clearSearchBtn = document.getElementById('clear-search-btn');
    fileListContainer = document.querySelector('.file-list-container');
    fileListElement = document.getElementById('file-list');
    searchResultsList = document.getElementById('search-results-list');
    welcomeScreen = document.getElementById('welcome-screen');
    editorWrapper = document.getElementById('editor-wrapper');
    markdownEditor = document.getElementById('markdown-editor');
    htmlPreview = document.getElementById('html-preview');
    editModeBtn = document.getElementById('edit-mode-btn');
    previewModeBtn = document.getElementById('preview-mode-btn');
    saveBtn = document.getElementById('save-btn');
    contextMenu = document.getElementById('context-menu');
    newNoteBtn = document.getElementById('new-note-btn');
    newFolderBtn = document.getElementById('new-folder-btn');
    deleteFileBtn = document.getElementById('delete-file-btn');
    customConfirmDialog = document.getElementById('custom-confirm-dialog');
    
    if (!openFolderBtn || !fileListElement || !fileListContainer) {
        throw new Error('必要的 DOM 元素未找到');
    }
    
    console.log('✅ DOM 元素已初始化');
}

/**
 * 绑定事件处理器
 */
function bindEvents() {
    console.log('🔗 开始绑定事件...');
    
    openFolderBtn.addEventListener('click', handleOpenFolder);
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    clearSearchBtn.addEventListener('click', clearSearch);
    editModeBtn.addEventListener('click', () => switchViewMode('edit'));
    previewModeBtn.addEventListener('click', () => switchViewMode('preview'));
    saveBtn.addEventListener('click', handleSaveFile);
    newNoteBtn.addEventListener('click', handleCreateNote);
    newFolderBtn.addEventListener('click', handleCreateFolder);
    deleteFileBtn.addEventListener('click', handleDeleteFile);
    document.addEventListener('click', () => hideContextMenu());
    
    markdownEditor.addEventListener('input', () => {
        appState.hasUnsavedChanges = true;
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            handleSaveFile();
        }
    });
    
    // 使用事件委托处理文件列表点击
    fileListElement.addEventListener('click', handleFileListClick);
    fileListElement.addEventListener('contextmenu', handleFileListContextMenu);
    
    console.log('✅ 事件绑定完成');
}

console.log('✅ app.js 加载完成');