// src/js/dom-init.js
// DOM 元素统一初始化和管理

'use strict';

console.log('📜 dom-init.js 开始加载...');

/**
 * DOM 元素引用对象
 * 所有模块通过这个对象访问 DOM 元素
 */
export const domElements = {
	customConfirmDialog: null,
	dialogTitle : null,
	dialogMessage : null,
	dialogConfirmBtn : null,
	dialogCancelBtn : null,
    // 主要容器
    container: null,
    sidebar: null,
    mainContent: null,
    
    // 工具栏
    openFolderBtn: null,
    themeToggleBtn: null,
    
    sidebarCollapseBtn: null,
    
    // 搜索相关
    searchBox: null,
    searchInput: null,
    clearSearchBtn: null,
    searchResultsList: null,
    
    // 文件列表
    fileListContainer: null,
    fileListElement: null,
    fileListSpacer: null,
    
    // 右键菜单
    contextMenu: null,
    newNoteBtn: null,
    newFolderBtn: null,
    deleteFileBtn: null,
    renameItemBtn: null,
    pinNoteBtn: null,
    unpinNoteBtn: null,
    
    // 根目录操作按钮
    newNoteRootBtn: null,
    newFolderRootBtn: null,
    
    // 标签相关
    toggleTagsBtn: null,
    tagsPopover: null,
    tagSidebarList: null,
    clearFilterBtn: null,
    manageTagsBtn: null,
    currentFileTagsList: null,
    
    // 编辑器相关
    editorWrapper: null,
    editorContainer: null,
    saveBtn: null,
    viewToggleBtn: null,
    
    // 标签页
    tabHome: null,
    dynamicTabContainer: null,
    addNewNoteTabBtn: null,
    mainHeaderActions: null,
    
    // 首页
    homepage: null,
    historyList: null,
    pinnedNotesGrid: null,
    
    // 对话框
    customConfirmDialog: null,
    tagModalOverlay: null,
    
    
    // 侧边栏章节
    backLinksList: null,
    fileViewContainer: null
};

/**
 * 初始化所有 DOM 元素引用
 */
export function initializeDOMElements() {
    console.log('🎯 开始初始化 DOM 元素...');
    
    const getElement = (id) => {
        const el = document.getElementById(id);
        if (!el) {
            console.warn(`⚠️ 未找到元素: #${id}`);
        }
        return el;
    };
    
    try {
		//自定义的对话框
		domElements.customConfirmDialog = getElement('custom-confirm-dialog');
		domElements.dialogTitle = getElement('dialog-title');
		domElements.dialogMessage = getElement('dialog-message');
		domElements.dialogConfirmBtn = getElement('dialog-confirm-btn');
		domElements.dialogCancelBtn = getElement('dialog-cancel-btn');
        // 主要容器
        domElements.container = document.querySelector('.container');
        domElements.sidebar = document.querySelector('.sidebar');
        domElements.mainContent = document.querySelector('.main-content');
        
        // 工具栏
        domElements.openFolderBtn = getElement('open-folder-btn');
        domElements.themeToggleBtn = getElement('theme-toggle-btn');
        domElements.sidebarCollapseBtn = getElement('sidebar-collapse-btn');
        
        // 搜索
        domElements.searchBox = getElement('search-box');
        domElements.searchInput = getElement('search-input');
        domElements.clearSearchBtn = getElement('clear-search-btn');
        domElements.searchResultsList = getElement('search-results-list');
        
        // 文件列表
        domElements.fileListContainer = getElement('file-view-container');
        domElements.fileListElement = getElement('file-list');
        
        // 右键菜单
        domElements.contextMenu = getElement('context-menu');
        domElements.newNoteBtn = getElement('new-note-btn');
        domElements.newFolderBtn = getElement('new-folder-btn');
        domElements.deleteFileBtn = getElement('delete-file-btn');
        domElements.renameItemBtn = getElement('rename-item-btn');
        domElements.pinNoteBtn = getElement('pin-note-btn');
        domElements.unpinNoteBtn = getElement('unpin-note-btn');
        
        // 根目录按钮
        domElements.newNoteRootBtn = getElement('new-note-root-btn');
        domElements.newFolderRootBtn = getElement('new-folder-root-btn');
        
        // 标签
        domElements.toggleTagsBtn = getElement('toggle-tags-btn');
        domElements.tagsPopover = getElement('tags-popover');
        domElements.tagSidebarList = getElement('tag-sidebar-list');
        domElements.clearFilterBtn = getElement('clear-filter-btn');
        domElements.manageTagsBtn = getElement('manage-tags-btn');
        domElements.currentFileTagsList = getElement('current-file-tags-list');
        
        // 编辑器
        domElements.editorWrapper = getElement('editor-wrapper');
        domElements.editorContainer = getElement('editor-container');
        domElements.saveBtn = getElement('save-btn');
        domElements.viewToggleBtn = getElement('view-toggle-btn');
        
        // 标签页
        domElements.tabHome = getElement('tab-home');
        domElements.dynamicTabContainer = getElement('dynamic-tab-container');
        domElements.addNewNoteTabBtn = getElement('add-new-note-tab-btn');
        domElements.mainHeaderActions = getElement('main-header-actions');
        
        // 首页
        domElements.homepage = getElement('homepage');
        domElements.historyList = getElement('history-list');
        domElements.pinnedNotesGrid = getElement('pinned-notes-grid');
        
        // 对话框
        domElements.customConfirmDialog = getElement('custom-confirm-dialog');
        domElements.tagModalOverlay = getElement('tag-modal-overlay');
        
        
        // 侧边栏章节
        domElements.backLinksList = getElement('backlinks-list');
        domElements.fileViewContainer = getElement('file-view-container');
        
        console.log('✅ DOM 元素初始化完成');
        
        return true;
    } catch (error) {
        console.error('❌ DOM 元素初始化失败:', error);
        throw error;
    }
}

/**
 * 获取单个 DOM 元素（懒加载）
 */
export function getDOMElement(key) {
    if (!domElements[key]) {
        console.warn(`⚠️ DOM 元素 "${key}" 未初始化`);
    }
    return domElements[key];
}

console.log('✅ dom-init.js 加载完成');
