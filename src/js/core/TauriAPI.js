// src/js/core/TauriAPI.js
// Tauri 命令封装

'use strict';

const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;

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

    // 文件操作
    file: {
        listDir: (rootPath, relativePath) => invoke('list_dir_lazy', { rootPath, relativePath }),
        read: (rootPath, relativePath) => invoke('read_file_content', { rootPath, relativePath }),
        save: (rootPath, relativePath, content) => invoke('save_file', { rootPath, relativePath, content }),
        create: (rootPath, relativePath) => invoke('create_new_file', { rootPath, relativePath }),
        delete: (rootPath, relativePath) => invoke('delete_item', { rootPath, relativePath }),
        rename: (rootPath, oldPath, newPath) => invoke('rename_item', { rootPath, oldPath, newPath })
    },

    // 文件夹操作
    folder: {
        create: (rootPath, relativePath) => invoke('create_new_folder', { rootPath, relativePath }),
        delete: (rootPath, relativePath) => invoke('delete_folder', { rootPath, relativePath })
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

    // 历史记录
    history: {
        record: (relativePath, eventType) => invoke('record_file_event', { relativePath, eventType }),
        get: () => invoke('get_history'),
        cleanup: () => invoke('cleanup_invalid_history')
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