// src/js/core/AppState.js
// CheetahNote 全局状态管理 (单例模式)

'use strict';

class AppState {
    constructor() {
        if (AppState.instance) {
            return AppState.instance;
        }

        // 工作区状态
        this.rootPath = null;
        this.rootName = null;
        this.activeFilePath = null;
        this.dbInitialized = false;

        // 搜索状态
        this.searchQuery = '';
        this.isSearching = false;
        this.searchInactivityTimer = null;

        // 编辑器状态，todo代删除
        this.currentViewMode = 'preview';
		// 编辑器模式: 'wysiwyg' | 'source' | 'preview'
		this.editorMode = 'preview';
        this.hasUnsavedChanges = false;
        this.isFirstFileLoad = true;  // ✅ 新增:标记是否首次加载文件

        // 文件树状态
        this.fileTreeRoot = [];
        this.fileTreeMap = new Map();
        this.expandedFolders = new Set();

        // 标签状态
        this.currentFileTags = [];
        this.allTags = [];
        this.activeTagFilter = null;

        // UI 状态
        this.contextTarget = null;
        this.isLoading = false;

        // 虚拟滚动状态
        this.virtualScroll = {
            visibleItems: [],
            renderedRange: { start: 0, end: 0 },
            scrollTop: 0,
            containerHeight: 0
        };

        // 索引状态
        this.indexInitialized = false;

        AppState.instance = this;
    }

    // 重置状态
    reset() {
        this.rootPath = null;
        this.activeFilePath = null;
        this.fileTreeRoot = [];
        this.fileTreeMap.clear();
        this.expandedFolders.clear();
        this.isLoading = false;
    }
}

// 导出单例实例
export const appState = new AppState();