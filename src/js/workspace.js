// src/js/workspace.js
// CheetahNote - 工作区管理模块 (移除索引提示)

'use strict';
console.log('📜 workspace.js 开始加载...');

const WORKSPACE_STORAGE_KEY = 'cheetah_workspace_path';

/**
 * 工作区管理器
 */
const workspaceManager = {
    currentWorkspace: null,

    /**
     * 获取上次使用的工作区路径
     */
    getLastWorkspace() {
        try {
            return localStorage.getItem(WORKSPACE_STORAGE_KEY);
        } catch (error) {
            console.warn('读取工作区路径失败:', error);
            return null;
        }
    },

    /**
     * 保存工作区路径
     */
    saveWorkspace(path) {
        try {
            localStorage.setItem(WORKSPACE_STORAGE_KEY, path);
            this.currentWorkspace = path;
        } catch (error) {
            console.warn('保存工作区路径失败:', error);
        }
    },

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
    },

    /**
     * 选择并打开工作区
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

            return await this.openWorkspace(selected);
        } catch (error) {
            console.error('选择工作区失败:', error);
            showError('选择工作区失败: ' + error);
            return null;
        }
    },

    /**
     * 打开指定路径的工作区
     */
    async openWorkspace(path) {
        console.log('📂 尝试打开工作区:', path);

        try {
            // 检查工作区状态
            const info = await invoke('check_workspace', { workspacePath: path });
            console.log('工作区信息:', info);

            if (!info.is_initialized) {
                // 工作区未初始化，询问用户是否初始化
                const confirmed = await showCustomConfirm(
                    '初始化工作区',
                    `这是一个新的笔记仓库，需要初始化。是否继续？`,
                    '📦'
                );

                if (!confirmed) {
                    return null;
                }

                // 初始化新工作区
                await this.initializeWorkspace(path);
            } else {
                // 加载现有工作区
                await this.loadWorkspace(path);
            }

            // 保存工作区路径
            this.saveWorkspace(path);
            
            return path;
        } catch (error) {
            console.error('打开工作区失败:', error);
            showError('打开工作区失败: ' + error);
            return null;
        }
    },

    /**
     * 初始化新工作区
     */
    async initializeWorkspace(path) {
        console.log('🚀 初始化工作区:', path);
        // [移除] showIndexingToast('正在初始化工作区...');

        try {
            // 步骤1: 初始化数据库和目录结构
            await invoke('initialize_workspace', { workspacePath: path });
            console.log('✅ 工作区初始化成功');
            
            // 步骤2: 同步文件系统
            console.log('🔄 同步文件系统...');
            const syncResult = await invoke('sync_workspace', { rootPath: path });
            console.log(`📊 同步结果: 添加 ${syncResult.added}, 删除 ${syncResult.removed}`);
            
            // 步骤3: 刷新UI
            if (window.initializeHomepage) {
                window.initializeHomepage();
            }
            
            showSuccessMessage('工作区初始化完成');
        } catch (error) {
            console.error('初始化工作区失败:', error);
            throw error;
        }
    },

    /**
     * 加载现有工作区
     */
    async loadWorkspace(path) {
        console.log('📂 加载工作区:', path);
        // [移除] showIndexingToast('正在加载工作区...');

        try {
            // 步骤1: 加载数据库和索引
            await invoke('load_workspace', { workspacePath: path });
            console.log('✅ 工作区加载成功');
            
            // 步骤2: 同步文件系统（检测外部变更）
            console.log('🔄 同步文件系统...');
            try {
                const syncResult = await invoke('sync_workspace', { rootPath: path });
                
                if (syncResult.added > 0 || syncResult.removed > 0) {
                    console.log(`📊 同步结果: 添加 ${syncResult.added}, 删除 ${syncResult.removed}`);
                    showSuccessMessage(`已同步: 新增 ${syncResult.added}, 移除 ${syncResult.removed}`);
                } else {
                    console.log('✅ 文件系统已同步，无变更');
                }
            } catch (syncError) {
                console.warn('⚠️ 文件系统同步失败:', syncError);
                // 同步失败不阻止工作区加载
            }
            
            // 步骤3: 刷新UI
            if (window.initializeHomepage) {
                window.initializeHomepage();
            }

            showSuccessMessage('工作区加载完成');
        } catch (error) {
            console.error('加载工作区失败:', error);
            throw error;
        }
    },

    /**
     * 关闭当前工作区
     */
    async closeWorkspace() {
        console.log('🔒 关闭工作区');
		  // 【新增】先清理前端资源
		if (window.globalCleanup) {
		swindow.globalCleanup();
		}

        try {
            await invoke('close_workspace');
            this.currentWorkspace = null;
			 // 【新增】等待一小段时间确保 Worker 完全退出
        await new Promise(resolve => setTimeout(resolve, 200));

            
            // 清理应用状态
            appState.rootPath = null;
            appState.activeFilePath = null;
            appState.fileTreeRoot = [];
            appState.fileTreeMap.clear();
            appState.expandedFolders.clear();
            
            // 返回欢迎界面
            showWelcomeScreen();
            
            console.log('✅ 工作区已关闭');
        } catch (error) {
            console.error('关闭工作区失败:', error);
            showError('关闭工作区失败: ' + error);
        }
    },

    /**
     * 尝试恢复上次的工作区
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
};

/**
 * 显示欢迎界面
 */
function showWelcomeScreen() {
    // 显示首页
    tabManager.switchToTab('home');
    
    // 清空文件列表
    fileListElement.innerHTML = '';
    
    // 隐藏搜索框
    searchBox.style.display = 'none';
}

// 导出到全局
window.workspaceManager = workspaceManager;

console.log('✅ workspace.js 加载完成');