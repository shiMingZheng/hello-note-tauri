// src/js/workspace.js
'use strict';

import { appState } from './core/AppState.js';
import { showError, showSuccessMessage } from './ui-utils.js';
import { initializeHomepage } from './homepage.js';

console.log('📜 workspace.js 开始加载...');

const WORKSPACE_STORAGE_KEY = 'cheetah_workspace_path';
const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;

/**
 * 工作区管理器
 */
export class WorkspaceManager {
    constructor() {
        this.currentWorkspace = null;
    }

    /**
     * 获取上次使用的工作区路径
     * @returns {string|null} 工作区路径
     */
    getLastWorkspace() {
        try {
            return localStorage.getItem(WORKSPACE_STORAGE_KEY);
        } catch (error) {
            console.warn('读取工作区路径失败:', error);
            return null;
        }
    }

    /**
     * 保存工作区路径
     * @param {string} path - 工作区路径
     */
    saveWorkspace(path) {
        try {
            localStorage.setItem(WORKSPACE_STORAGE_KEY, path);
            this.currentWorkspace = path;
        } catch (error) {
            console.warn('保存工作区路径失败:', error);
        }
    }

    /**
     * 清除工作区路径
     */
    clearWorkspace() {
        try {
            localStorage.removeItem(WORKSPACE_STORAGE_KEY);
            this.currentWorkspace = null;
        } catch (error) {
            console.warn('清除工作区路径失败:', error);
        }
    }

    /**
     * 选择并打开工作区
     * @returns {Promise<string|null>} 选择的路径
     */
    async selectWorkspace() {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: '选择笔记仓库文件夹'
            });

            if (!selected || typeof selected !== 'string') {
                return null;
            }

            console.log('📁 用户选择了工作区:', selected);
            return await this.openWorkspace(selected);
        } catch (error) {
            console.error('选择工作区失败:', error);
            showError('选择工作区失败: ' + error);
            return null;
        }
    }

    /**
     * 打开工作区
     * @param {string} path - 工作区路径
     * @returns {Promise<string|null>} 打开的路径
     */
    async openWorkspace(path) {
        console.log('🔍 检查工作区:', path);

        try {
            // 步骤1: 检查工作区是否存在
            const exists = await invoke('check_workspace', { workspacePath: path });

            if (!exists) {
                console.log('📦 工作区不存在，开始初始化...');
                await this.initializeWorkspace(path);
            } else {
                console.log('📂 工作区已存在，加载中...');
                await this.loadWorkspace(path);
            }

            // 保存路径
            this.saveWorkspace(path);
            appState.rootPath = path;

            return path;
        } catch (error) {
            console.error('打开工作区失败:', error);
            showError('打开工作区失败: ' + error);
            return null;
        }
    }

    /**
     * 初始化新工作区
     * @param {string} path - 工作区路径
     */
    async initializeWorkspace(path) {
        console.log('🚀 初始化新工作区:', path);

        try {
            // 步骤1: 初始化数据库和索引
            await invoke('initialize_workspace', { workspacePath: path });
            console.log('✅ 工作区数据库初始化完成');

            // 步骤2: 后台同步文件系统
            console.log('🔄 后台同步文件系统...');
            try {
                const syncResult = await invoke('sync_workspace', { rootPath: path });
                console.log(`📊 同步结果: 添加 ${syncResult.added}, 删除 ${syncResult.removed}`);

                // 等待索引完成
                if (syncResult.added > 0) {
                    console.log('⏳ 等待索引任务处理...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            } catch (syncError) {
                console.warn('⚠️ 后台同步失败:', syncError);
            }

            // 步骤3: 刷新UI
            
            initializeHomepage();

            showSuccessMessage('工作区初始化完成');

        } catch (error) {
            console.error('初始化工作区失败:', error);
            throw error;
        }
    }

    /**
     * 加载现有工作区
     * @param {string} path - 工作区路径
     */
    async loadWorkspace(path) {
        console.log('📂 加载工作区:', path);

        try {
            // 步骤1: 加载数据库和索引
            await invoke('load_workspace', { workspacePath: path });
            console.log('✅ 工作区加载成功');

            // 步骤2: 同步文件系统（检测外部变更）
            console.log('🔄 后台同步文件系统...');
            try {
                const syncResult = await invoke('sync_workspace', { rootPath: path });
                console.log(`📊 同步结果: 添加 ${syncResult.added}, 删除 ${syncResult.removed}`);

                if (syncResult.added > 0 || syncResult.removed > 0) {
                    console.log('⏳ 等待索引任务处理...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    showSuccessMessage(`已同步: 新增 ${syncResult.added}, 移除 ${syncResult.removed}`);
                }
            } catch (syncError) {
                console.warn('⚠️ 后台同步失败:', syncError);
            }

            // 步骤3: 刷新UI
            initializeHomepage();


            showSuccessMessage('工作区加载完成');

        } catch (error) {
            console.error('加载工作区失败:', error);
            throw error;
        }
    }

    /**
     * 关闭当前工作区
     */
    async closeWorkspace() {
        console.log('🔒 关闭工作区');

        try {
            await invoke('close_workspace');
            this.currentWorkspace = null;

            // 清理应用状态
            appState.reset();

            // 返回欢迎界面
            this.showWelcomeScreen();

            console.log('✅ 工作区已关闭');
        } catch (error) {
            console.error('关闭工作区失败:', error);
            showError('关闭工作区失败: ' + error);
        }
    }

    /**
     * 尝试恢复上次的工作区
     * @returns {Promise<boolean>} 是否成功恢复
     */
    async restoreLastWorkspace() {
        const lastPath = this.getLastWorkspace();

        if (!lastPath) {
            console.log('📝 没有上次的工作区记录');
            return false;
        }

        console.log('🔄 尝试恢复上次的工作区:', lastPath);

        try {
            const result = await this.openWorkspace(lastPath);
            return result !== null;
        } catch (error) {
            console.warn('恢复工作区失败:', error);
            // 清除无效的工作区记录
            this.clearWorkspace();
            return false;
        }
    }

    /**
     * 应用启动流程
     */
    async startup() {
        console.log('🏁 开始启动流程...');

        const restored = await this.restoreLastWorkspace();

        if (restored) {
            console.log('✅ 成功恢复上次的工作区');

            const currentWorkspace = await invoke('get_current_workspace');

            if (currentWorkspace) {
                appState.rootPath = currentWorkspace;

                // 恢复展开状态
                await this.restoreLastFileInWorkspace();

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
                if (window.refreshFileTree) {
                    await window.refreshFileTree("");
                }

                // 打开上次的文件
                await this.openLastFile();
            }
        } else {
            console.log('📝 显示欢迎界面');
            this.showWelcomeScreen();
        }

        console.log('✅ 启动流程完成');
    }

    /**
     * 显示欢迎界面
     */
    showWelcomeScreen() {
        if (window.tabManager && window.tabManager.switchToTab) {
            window.tabManager.switchToTab('home');
        }

        const fileListElement = document.getElementById('file-list');
        if (fileListElement) {
            fileListElement.innerHTML = '';
        }

        const searchBox = document.getElementById('search-box');
        if (searchBox) {
            searchBox.style.display = 'none';
        }
    }

    /**
     * 恢复上次的文件状态
     */
    async restoreLastFileInWorkspace() {
        try {
            const expandedStr = localStorage.getItem('cheetah_expanded_folders');
            if (expandedStr) {
                const expandedArray = JSON.parse(expandedStr);
                appState.expandedFolders = new Set(expandedArray);
                console.log('🔄 恢复了展开状态:', expandedArray);
            }
        } catch (error) {
            console.warn('恢复展开状态失败:', error);
        }
    }

    /**
     * 打开上次的文件
     */
    async openLastFile() {
        try {
            const lastFile = localStorage.getItem('cheetah_last_file');
            if (lastFile && window.tabManager) {
                console.log('📄 恢复上次打开的文件:', lastFile);
                window.tabManager.openTab(lastFile);
            }
        } catch (error) {
            console.warn('恢复文件失败:', error);
        }
    }
}

console.log('✅ workspace.js 加载完成');