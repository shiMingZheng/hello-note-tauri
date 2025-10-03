// src/js/app.js
// CheetahNote - 应用入口、状态管理与初始化 (最终修复版 v3)

'use strict';
console.log('📜 app.js 开始加载...');

const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;

const SEARCH_INACTIVITY_TIMEOUT = 5 * 60 * 1000;
const VIRTUAL_SCROLL_CONFIG = { ITEM_HEIGHT: 28, BUFFER_SIZE: 3, THROTTLE_DELAY: 16 };
const STORAGE_KEYS = { LAST_FOLDER: 'cheetah_last_folder', LAST_FILE: 'cheetah_last_file', EXPANDED_FOLDERS: 'cheetah_expanded_folders' };

const appState = {
    rootPath: null, activeFilePath: null, dbInitialized: false, searchQuery: '', currentViewMode: 'edit',
    hasUnsavedChanges: false, isSearching: false, contextTarget: null, expandedFolders: new Set(),
    indexInitialized: false, fileTreeRoot: [], fileTreeMap: new Map(), currentFileTags: [],
    allTags: [], activeTagFilter: null, searchInactivityTimer: null, isLoading: false,
    virtualScroll: { visibleItems: [], renderedRange: { start: 0, end: 0 }, scrollTop: 0, containerHeight: 0 }
};

let openFolderBtn, searchBox, searchInput, clearSearchBtn, fileListContainer, fileListElement,
    fileListSpacer, searchResultsList,  markdownEditor, htmlPreview, 
    editModeBtn, previewModeBtn, saveBtn, contextMenu, newNoteBtn, newFolderBtn, 
    deleteFileBtn, customConfirmDialog;


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

        setTimeout(async () => {
            await restoreLastSession();
            console.log('✅ 应用会话恢复完成');
        }, 100);

    } catch (error) {
        console.error('❌ 应用初始化失败:', error);
        alert('应用初始化失败: ' + error.message);
    }
});

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
        editModeBtn = getElement('edit-mode-btn');
        previewModeBtn = getElement('preview-mode-btn');
        saveBtn = getElement('save-btn');
        contextMenu = getElement('context-menu');
        newNoteBtn = getElement('new-note-btn');
        newFolderBtn = getElement('new-folder-btn');
        deleteFileBtn = getElement('delete-file-btn');
        customConfirmDialog = getElement('custom-confirm-dialog');

    } catch (error) {
        throw error;
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

    markdownEditor.addEventListener('input', () => { appState.hasUnsavedChanges = true; });
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

window.switchToTab = switchToTab;