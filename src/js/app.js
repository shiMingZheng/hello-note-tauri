// src/js/app.js
// CheetahNote - 应用入口、状态管理与初始化 (onload 修复版)

'use strict';
console.log('📜 app.js 开始加载...');

const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;

const SEARCH_INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5分钟

const VIRTUAL_SCROLL_CONFIG = {
    ITEM_HEIGHT: 28,
    BUFFER_SIZE: 3,
    THROTTLE_DELAY: 16
};

const STORAGE_KEYS = {
    LAST_FOLDER: 'cheetah_last_folder',
    LAST_FILE: 'cheetah_last_file',
    EXPANDED_FOLDERS: 'cheetah_expanded_folders'
};

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

let openFolderBtn, searchBox, searchInput, clearSearchBtn, fileListContainer, fileListElement,
    fileListSpacer, searchResultsList, welcomeScreen, editorWrapper, markdownEditor,
    htmlPreview, editModeBtn, previewModeBtn, saveBtn, contextMenu, newNoteBtn,
    newFolderBtn, deleteFileBtn, customConfirmDialog, tagListElement, tagInputElement;


// ========================================
// 初始化应用
// ========================================

/**
 * [修改] 只执行不依赖其他脚本的初始化任务
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 app.js DOMContentLoaded');
    const startTime = performance.now();
    
    try {
        initDOMElements();
        setupVirtualScroll();

        // 注意：bindEvents() 和 restoreLastSession() 已被移出
        
        const loadTime = performance.now() - startTime;
        console.log(`✅ DOM 初始化完成，耗时: ${loadTime.toFixed(2)}ms`);
    } catch (error) {
        console.error('❌ DOM 初始化失败:', error);
        alert('应用 DOM 初始化失败: ' + error.message);
    }
});

/**
 * [新增] 等待所有资源（包括所有JS文件）加载完毕后，再执行依赖性强的初始化任务
 */
window.onload = async () => {
    console.log('🏁 window.onload: 所有资源已加载完毕，开始绑定事件和恢复会话...');
    try {
        bindEvents(); // 此刻，所有其他JS文件中的函数（如 handleOpenFolder）都已定义
        await restoreLastSession();
        console.log('✅ 应用完全初始化成功');
    } catch (error) {
        console.error('❌ 应用最终初始化失败:', error);
        alert('应用初始化失败: ' + error.message);
    }
};


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
    tagListElement = document.getElementById('tag-list');
    tagInputElement = document.getElementById('tag-input');
    
    if (!openFolderBtn || !fileListElement || !fileListContainer) {
        throw new Error('必要的 DOM 元素未找到');
    }
    
    console.log('✅ DOM 元素已初始化');
}

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
    tagInputElement.addEventListener('keyup', handleAddTag);
    
    markdownEditor.addEventListener('input', () => {
        appState.hasUnsavedChanges = true;
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            handleSaveFile();
        }
    });
    
    fileListElement.addEventListener('click', handleFileListClick);
    fileListElement.addEventListener('contextmenu', handleFileListContextMenu);
    
    console.log('✅ 事件绑定完成');
}