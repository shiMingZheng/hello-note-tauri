// src/js/workspace.js
'use strict';

import { appState } from './core/AppState.js';
import { showError, showSuccessMessage } from './ui-utils.js';
import { initializeHomepage } from './homepage.js';



import { eventBus } from './core/EventBus.js';
import { invoke, open } from './core/TauriAPI.js'; // 确保 open 也从 TauriAPI 导入

console.log('📜 workspace.js 开始加载...');

const WORKSPACE_STORAGE_KEY = 'cheetah_workspace_path';


/**
 * 工作区管理器
 */
export class WorkspaceManager {
    constructor() {
        this.currentWorkspace = null;
        // 不在这里调用 subscribeToEvents，改为在 main.js 实例化后调用
    }

    /**
     * ✅ 新增：订阅事件的方法
     */
    subscribeToEvents() {
        eventBus.on('workspace:select-new', async () => {
            console.log('📥 [WorkspaceManager] 收到 workspace:select-new 事件');
            await this.selectWorkspace(); // 调用选择工作区的方法
        });
        console.log('✅ WorkspaceManager 已订阅 workspace:select-new 事件');
    }


    /**
     * 获取上次使用的工作区路径
     * @returns {string|null} 工作区路径
     */
    getLastWorkspace() {
        // ... 代码不变 ...
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
        // ... 代码不变 ...
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
        // ... 代码不变 ...
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
        console.log('🔄 [selectWorkspace] 开始选择工作区...'); // 添加日志
        try {
            const selected = await open({ // 直接使用导入的 open 函数
                directory: true,
                multiple: false,
                title: '选择笔记仓库文件夹'
            });

            if (!selected || typeof selected !== 'string') {
                 console.log('🚫 用户取消选择或选择无效'); // 添加日志
                return null; // 用户取消或选择无效
            }

            console.log('📁 用户选择了工作区:', selected);
            // 调用 openWorkspace 来处理后续逻辑
            return await this.openWorkspace(selected);
        } catch (error) {
            console.error('❌ 选择工作区失败:', error);
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
		// ... 函数内部逻辑不变 ...
        console.log('🔍 检查工作区:', path);

		try {
			  // ✅ 关键：先设置 rootPath
			appState.rootPath = path;
			appState.dbInitialized = true; // 假设打开即初始化DB连接
			this.saveWorkspace(path); // 保存当前工作区路径

			// 步骤1: 调用后端检查工作区状态
			const workspaceInfo = await invoke('check_workspace', { workspacePath: path });

			// ✅ 正确判断：检查 is_initialized 字段
			if (!workspaceInfo.is_initialized) {
				console.log('📦 工作区未初始化，开始初始化...');
				await this.initializeWorkspace(path);
			} else {
				console.log('📂 工作区已存在，加载中...');
				await this.loadWorkspace(path);
			}


			// 成功打开或初始化后返回路径
			return path;
		} catch (error) {
			console.error('❌ 打开/初始化工作区失败:', error);
			showError('打开工作区失败: ' + error);
            appState.rootPath = null; // 打开失败，重置 rootPath
            appState.dbInitialized = false;
            this.clearWorkspace(); // 清除保存的路径
			return null; // 返回 null 表示失败
		}
	}

    /**
     * 初始化新工作区
     * @param {string} path - 工作区路径
     */
    async initializeWorkspace(path) {
        // ... 函数内部逻辑不变 ...
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

				// 如果有新增文件，可能需要等待索引完成（可选，取决于后续逻辑是否强依赖索引）
				// if (syncResult.added > 0) {
				// 	console.log('⏳ 等待索引任务处理...');
				// 	await new Promise(resolve => setTimeout(resolve, 2000));
				// }
			} catch (syncError) {
				console.warn('⚠️ 后台同步失败:', syncError);
                // 初始化时同步失败通常不阻断流程，但需要记录
			}

			// 步骤3: 刷新UI - 加载文件树
			console.log('📂 加载文件树...');
			// 动态导入 file-manager.js 中的 refreshFileTree
			const { refreshFileTree } = await import('./file-manager.js');
			await refreshFileTree(''); // 刷新根目录

            // 步骤4: 初始化首页组件（显示置顶/历史等）
			initializeHomepage();

            // 步骤5: 发布工作区打开事件
            eventBus.emit('workspace:opened', path); // 传递路径
			console.log('📢 已发布 workspace:opened 事件');

			showSuccessMessage('工作区初始化完成');

		} catch (error) {
			console.error('❌ 初始化工作区失败:', error);
			throw error; // 将错误向上抛出，由 openWorkspace 处理
		}
	}

	async loadWorkspace(path) {
        // ... 函数内部逻辑不变 ...
        console.log('📂 加载工作区:', path);

		try {
			// 步骤1: 加载数据库和索引
            // 注意：load_workspace 后端命令现在也负责启动 worker 和 watcher
        
			await invoke('load_workspace', { workspacePath: path });
			console.log('✅ 工作区加载成功 (后端已处理DB, 索引, Worker, Watcher)');

			// 步骤2: 同步文件系统（检测外部变更）
			console.log('🔄 同步文件系统...');
			try {
				const syncResult = await invoke('sync_workspace', { rootPath: path });
				console.log(`📊 同步结果: 添加 ${syncResult.added}, 删除 ${syncResult.removed}`);

				if (syncResult.added > 0 || syncResult.removed > 0) {
					// 如果检测到外部更改，显示提示信息
					showSuccessMessage(`已同步外部更改: 新增 ${syncResult.added}, 移除 ${syncResult.removed}`);
                    // 可能需要短暂延迟以等待后台索引处理
                    // await new Promise(resolve => setTimeout(resolve, 1000));
				}
			} catch (syncError) {
				console.warn('⚠️ 同步失败:', syncError);
                // 加载时同步失败通常不阻断，但需要记录
			}

			// 步骤3: 刷新UI - 加载文件树
			console.log('📂 加载文件树...');
			const { refreshFileTree } = await import('./file-manager.js');
			await refreshFileTree(''); // 刷新根目录

            // 步骤4: 初始化首页组件
			initializeHomepage();

			// 步骤5: 发布工作区打开事件
			eventBus.emit('workspace:opened', path); // 传递路径
			console.log('📢 已发布 workspace:opened 事件');

            // 步骤6: 恢复上次打开的文件和展开状态
            await this.restoreLastStateInWorkspace();

			showSuccessMessage('工作区加载完成');

		} catch (error) {
			console.error('❌ 加载工作区失败:', error);
			throw error; // 向上抛出错误
		}
	}

    /**
     * 恢复上次打开的文件和展开状态
     */
    async restoreLastStateInWorkspace() {
        // 恢复展开状态
        try {
            const expandedStr = localStorage.getItem('cheetah_expanded_folders');
            if (expandedStr) {
                const expandedArray = JSON.parse(expandedStr);
                // 过滤掉可能不存在的路径（虽然不完美，但能减少错误）
                // const validExpanded = expandedArray.filter(p => /* 简单的路径格式检查 */ p && typeof p === 'string');
                appState.expandedFolders = new Set(expandedArray);
                console.log('🔄 恢复了展开状态:', expandedArray);
                // 注意：这里恢复后，refreshFileTree('') 应该能正确加载展开的文件夹
            }
        } catch (error) {
            console.warn('恢复展开状态失败:', error);
            localStorage.removeItem('cheetah_expanded_folders'); // 清除损坏的数据
            appState.expandedFolders = new Set();
        }

        // 打开上次的文件
        try {
            const lastFile = localStorage.getItem('cheetah_last_file');
            const lastWorkspace = localStorage.getItem(WORKSPACE_STORAGE_KEY);
            // 确保是在同一个工作区
            if (lastFile && lastWorkspace === appState.rootPath) {
                console.log('📄 尝试恢复上次打开的文件:', lastFile);
                // 使用事件总线打开标签页，延迟一点确保UI渲染完成
                setTimeout(() => {
                    eventBus.emit('open-tab', lastFile);
                }, 300); // 延迟300毫秒
            } else if (lastFile) {
                console.log('ℹ️ 上次打开的文件不属于当前工作区，不恢复');
                localStorage.removeItem('cheetah_last_file'); // 清除无效记录
            }
        } catch (error) {
            console.warn('恢复上次文件失败:', error);
            localStorage.removeItem('cheetah_last_file'); // 清除可能损坏的数据
        }
    }


	/**
	* 启动时恢复工作区 (现在由 startup 调用)
	*/
	// 这个方法可以被简化或移除，逻辑整合到 startup 中
	// async startupWithWorkspace() { ... }

	/**
	* 加载工作区文件树 (现在由 loadWorkspace/initializeWorkspace 调用)
	*/
	// async loadWorkspaceFileTree() { ... }

	/**
	* 恢复上次打开的文件 (逻辑移到 restoreLastStateInWorkspace)
	*/
	// restoreLastOpenedFile() { ... }

	/**
	* 初始化搜索索引（后台执行） (后端 load_workspace 已处理)
	*/
	// initializeSearchIndex() { ... }

    /**
     * 关闭当前工作区
     */
    async closeWorkspace() {
        console.log('🔒 关闭工作区');

        try {
            // 1. 调用后端关闭工作区（后端会停止 watcher, worker 等）
            await invoke('close_workspace');

            // 2. 清理前端状态
            const previousWorkspace = this.currentWorkspace; // 保存一下旧路径用于事件
            this.clearWorkspace(); // 清除 localStorage 和 currentWorkspace
            appState.reset();      // 重置 AppState 中的相关状态

            // 3. 重置 UI
            eventBus.emit('tab:switch', 'home'); // 切换到首页Tab
            eventBus.emit('ui:resetFileTree'); // 发布事件清空文件树UI
            // initializeHomepage(); // 重新初始化首页可能需要，取决于其实现

            // 4. 发布工作区关闭事件
            eventBus.emit('workspace:closed', previousWorkspace);
            console.log('📢 已发布 workspace:closed 事件');


            console.log('✅ 工作区已关闭');
        } catch (error) {
            console.error('❌ 关闭工作区失败:', error);
            showError('关闭工作区失败: ' + error);
            // 即使关闭失败，也尝试清理前端状态
            this.clearWorkspace();
            appState.reset();
            eventBus.emit('tab:switch', 'home');
            eventBus.emit('ui:resetFileTree');
        }
    }

    /**
     * 尝试恢复上次的工作区 (现在是 startup 的一部分)
     * @returns {Promise<boolean>} 是否成功恢复
     */
    // async restoreLastWorkspace() { ... } // 逻辑整合到 startup

    /**
     * 应用启动流程
     */
    async startup() {
        console.log('🏁 开始启动流程...');

        const lastPath = this.getLastWorkspace();
        let workspaceOpened = false;

        if (lastPath) {
            console.log('🔄 尝试恢复上次的工作区:', lastPath);
            try {
                // 尝试打开上次的工作区，openWorkspace 会处理加载或初始化
                const openedPath = await this.openWorkspace(lastPath);
                if (openedPath) {
                    console.log('✅ 成功恢复并加载/初始化上次的工作区');
                    workspaceOpened = true;
                    // restoreLastStateInWorkspace 已在 loadWorkspace 中调用
                } else {
                    console.warn('⚠️ 恢复工作区失败，清除记录');
                    this.clearWorkspace(); // 清除无效的工作区记录
                }
            } catch (error) {
                console.error('❌ 恢复工作区时发生错误:', error);
                this.clearWorkspace(); // 出错也清除记录
            }
        } else {
            console.log('📝 没有上次的工作区记录');
        }

        if (!workspaceOpened) {
            console.log('🏠 显示欢迎界面 (首页)');
            this.showWelcomeScreen(); // 确保切换到首页Tab
        }

        console.log('✅ 启动流程完成');
    }


    /**
     * 显示欢迎界面 (切换到首页Tab)
     */
    showWelcomeScreen() {
		eventBus.emit('tab:switch', 'home');
        eventBus.emit('ui:resetFileTree'); // 清空文件树
        // 隐藏搜索框等操作可以由其他模块监听 tab:switch 事件完成
    }

    /**
     * 恢复上次的文件状态 (逻辑移到 restoreLastStateInWorkspace)
     */
    // async restoreLastFileInWorkspace() { ... }

    /**
     * 打开上次的文件 (逻辑移到 restoreLastStateInWorkspace)
     */
    // async openLastFile() { ... }
}

console.log('✅ workspace.js 加载完成');

// 可以在这里添加对 'ui:resetFileTree' 的订阅来清空文件列表元素
eventBus.on('ui:resetFileTree', () => {
    const fileListElement = document.getElementById('file-list');
    if (fileListElement) {
        fileListElement.innerHTML = ''; // 清空文件列表
    }
    const fileListSpacer = document.getElementById('file-list-spacer');
     if (fileListSpacer) {
        fileListSpacer.style.height = '0px'; // 重置 spacer 高度
    }
    appState.virtualScroll.visibleItems = []; // 清空虚拟滚动数据
    // 可能还需要重置 appState.fileTreeRoot 和 appState.fileTreeMap
    appState.fileTreeRoot = [];
    appState.fileTreeMap.clear();

    console.log('🧹 文件树 UI 已重置');
});