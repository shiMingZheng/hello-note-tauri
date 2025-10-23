// src/js/core/TauriAPI.js
// Tauri 命令封装

'use strict';

console.log('📜 TauriAPI.js 开始加载...');

// [重构] 步骤 1: 检查 __TAURI__ 是否存在
const isTauri = !!window.__TAURI__;

// [重构] 步骤 2: 创建一个模拟 API，用于浏览器环境
const mockApi = {
    invoke: (command, args) => {
        console.warn(`[Tauri Mock] invoke: ${command}`, args);
        // 根据命令安全地返回空 Promise
        if (command.startsWith('get_') || command.startsWith('list_')) {
            return Promise.resolve([]); // 返回空数组
        }
        if (command.startsWith('check_')) {
            return Promise.resolve({ is_initialized: false }); // 返回默认结构
        }
        return Promise.resolve(null); // 其他命令返回 null
    },
    open: (options) => {
        console.warn('[Tauri Mock] open:', options);
        return Promise.resolve(null); // 返回 null
    },
    listen: (event, handler) => {
        console.warn(`[Tauri Mock] listen: ${event}`);
        return () => { console.warn(`[Tauri Mock] unlisten: ${event}`); }; // 返回一个空的 unlisten 函数
    },
    getCurrentWindow: () => {
        console.warn('[Tauri Mock] getCurrentWindow');
        // 返回一个模拟的 appWindow 对象
        return {
            setTitle: (title) => console.warn(`[Tauri Mock] setTitle: ${title}`)
        };
    }
};

// [重构] 步骤 3: 根据环境条件定义基础函数
// 这些是您对象内部将要使用的“积木”
const invoke = isTauri ? window.__TAURI__.core.invoke : mockApi.invoke;
const open = isTauri ? window.__TAURI__.dialog.open : mockApi.open;
const listen = isTauri ? window.__TAURI__.event.listen : mockApi.listen;

// [重构] 步骤 4: 导出您原有的、组织良好的 TauriAPI 对象
// 它现在会自动使用上面定义的、环境安全的 `invoke` 和 `open` 函数
export const TauriAPI = {
    // 对话框
    dialog: {
        openFolder: () => open({ directory: true, multiple: false, title: '选择笔记仓库文件夹' })
    },

    // 工作区管理
    workspace: {
        check: (workspacePath) => invoke('check_workspace', { workspacePath }),
        initialize: (workspacePath) => invoke('initialize_workspace', { workspacePath }),
        load: (workspacePath) => invoke('load_workspace', { workspacePath }),
        close: () => invoke('close_workspace'),
        getCurrent: () => invoke('get_current_workspace'),
        sync: (rootPath) => invoke('sync_workspace', { rootPath })
    },

    // 文件操作 (根据您项目中的实际使用情况进行了修正)
    file: {
        listDir: (rootPath, relativePath) => invoke('list_dir_lazy', { rootPath, relativePath }),
        read: (rootPath, relativePath) => invoke('read_file_content', { rootPath, relativePath }),
        save: (rootPath, relativePath, content) => invoke('save_file', { rootPath, relativePath, content }),
        create: (rootPath, relativeDirPath, fileName) => invoke('create_new_file', { rootPath, relativeDirPath, fileName }),
        delete: (rootPath, relativePath) => invoke('delete_item', { rootPath, relativePath }),
        rename: (rootPath, oldRelativePath, newName) => invoke('rename_item', { rootPath, oldRelativePath, newName }),
        move: (rootPath, sourcePath, targetDir) => invoke('move_item', { rootPath, sourcePath, targetDir })
    },

    // 文件夹操作 (根据您项目中的实际使用情况进行了修正)
    folder: {
        create: (rootPath, relativeParentPath, folderName) => invoke('create_new_folder', { rootPath, relativeParentPath, folderName }),
        // 注意：删除文件夹用的也是 'delete_item'
        delete: (rootPath, relativePath) => invoke('delete_item', { rootPath, relativePath })
    },

    // 搜索
    search: {
        initialize: (rootPath) => invoke('initialize_index_command', { rootPath }),
        query: (query, rootPath) => invoke('search_notes', { query, rootPath }),
        ensureLoaded: (rootPath) => invoke('ensure_index_is_loaded', { rootPath })
    },

    // 标签
    tags: {
        add: (relativePath, tagName) => invoke('add_tag_to_file', { relativePath, tagName }),
        remove: (relativePath, tagName) => invoke('remove_tag_from_file', { relativePath, tagName }),
        getForFile: (relativePath) => invoke('get_tags_for_file', { relativePath }),
        getAll: () => invoke('get_all_tags'),
        getFilesByTag: (tagName) => invoke('get_files_by_tag', { tagName })
    },

    // 置顶
    pins: {
        pin: (relativePath) => invoke('pin_note', { relativePath }),
        unpin: (relativePath) => invoke('unpin_note', { relativePath }),
        getAll: () => invoke('get_pinned_notes')
    },

    // 历史记录 (根据您项目中的实际使用情况进行了修正)
    history: {
        record: (rootPath, relativePath, eventType) => invoke('record_file_event', { rootPath, relativePath, eventType }),
        get: () => invoke('get_history'),
        cleanup: (rootPath) => invoke('cleanup_invalid_history', { rootPath })
    },

    // 链接
    links: {
        getBacklinks: (relativePath) => invoke('get_backlinks', { relativePath }),
        getGraphData: () => invoke('get_graph_data')
    },

    // 工具
    utils: {
        parseMarkdown: (content) => invoke('parse_markdown', { content }),
        checkIndexingStatus: () => invoke('check_indexing_status')
    }
};

// [重构] 步骤 5: 导出其他需要的模块
export const getCurrentWindow = isTauri ? window.__TAURI__.window.getCurrentWindow : mockApi.getCurrentWindow;
export { listen }; // 导出 listen 供 file-change-listener.js 使用
export const IS_TAURI_APP = isTauri; // 导出一个布尔值，供其他模块判断

// [重构] 步骤 6: 额外导出 invoke，供还在直接使用 invoke 的文件过渡
// 比如 editor.js, file-manager.js 等。
// 理想情况下，它们未来应该使用 TauriAPI.file.read() 等
export { invoke,open };

console.log(`✅ TauriAPI.js 加载完成 (Tauri 环境: ${isTauri})`);