// src/js/tab_manager.js
'use strict';

import { appState } from './core/AppState.js';
import { eventBus } from './core/EventBus.js';

console.log('📜 tab_manager.js 开始加载...');

// 模块私有变量
let dynamicTabContainer, homeTabBtn, addNewNoteTabBtn, mainHeaderActions, editorWrapperEl, homepageEl;

/**
 * 标签页管理器类
 */
export class TabManager {
    constructor() {
        this.openTabs = [];
        this.activeTab = 'home';
    }

    /**
     * 初始化标签页管理器
     */
    init() {
        dynamicTabContainer = document.getElementById('dynamic-tab-container');
        homeTabBtn = document.getElementById('tab-home');
        addNewNoteTabBtn = document.getElementById('add-new-note-tab-btn');
        mainHeaderActions = document.getElementById('main-header-actions');
        editorWrapperEl = document.getElementById('editor-wrapper');
        homepageEl = document.getElementById('homepage');
        
        homeTabBtn.addEventListener('click', () => this.switchToTab('home'));
        addNewNoteTabBtn.addEventListener('click', () => this.handleAddNewNote());
		
		// 订阅打开标签页事件
		eventBus.on('open-tab', (filePath) => {
			console.log('📥 收到 open-tab 事件:', filePath);
			this.openTab(filePath);
		});
		
		// ✅ 订阅外部事件
        this.subscribeToEvents();
		console.log('✅ TabManager 已订阅 open-tab 事件');
        
        console.log('✅ TabManager 初始化完成');
    }
    // ✅ 新增：订阅外部事件
    subscribeToEvents() {
        // 订阅打开标签页事件
        eventBus.on('open-tab', (filePath) => {
            console.log('📥 [TabManager] 收到 open-tab 事件:', filePath);
            this.openTab(filePath);
        });
        
        // 订阅关闭标签页事件
        eventBus.on('tab:close', (filePath) => {
            console.log('📥 [TabManager] 收到 tab:close 事件:', filePath);
            this.closeTab(filePath);
        });
        
        // 订阅切换标签页事件
        eventBus.on('tab:switch', (tabId) => {
            console.log('📥 [TabManager] 收到 tab:switch 事件:', tabId);
            this.switchToTab(tabId);
        });
        
        // 订阅新建空白标签页事件
        eventBus.on('tab:new', () => {
            console.log('📥 [TabManager] 收到 tab:new 事件');
            this.handleAddNewNote();
        });
        
        // 订阅更新标签页路径事件（用于重命名）
        eventBus.on('tab:update-path', ({ oldPath, newPath }) => {
            console.log('📥 [TabManager] 收到 tab:update-path 事件:', oldPath, '->', newPath);
            this.updateTabId(oldPath, newPath);
        });
        
        // 订阅批量更新文件夹路径事件（用于文件夹重命名）
        eventBus.on('tab:update-folder-paths', ({ oldPrefix, newPrefix }) => {
            console.log('📥 [TabManager] 收到 tab:update-folder-paths 事件:', oldPrefix, '->', newPrefix);
            this.updatePathsForRenamedFolder(oldPrefix, newPrefix);
        });
		// ✅ 订阅标记标签页已保存事件
		eventBus.on('tab:mark-saved', (filePath) => {
			console.log('📥 [TabManager] 收到 tab:mark-saved 事件:', filePath);
			this.markTabAsSaved(filePath);
		});
        
        console.log('✅ TabManager 已订阅所有标签页事件');
	}
    /**
     * 打开标签页
     */
    openTab(filePath) {
        if (this.findTabByPath(filePath)) {
            this.switchToTab(filePath);
            return;
        }
        
        const newTabData = {
            path: filePath,
            title: filePath.split(/[/\\]/).pop(),
            isNew: false
        };
        
        if (this.activeTab === 'home') {
            this.openTabs.push(newTabData);
        } else {
            const currentIndex = this.openTabs.findIndex(tab => tab.path === this.activeTab);
            if (currentIndex > -1) {
                this.openTabs[currentIndex] = newTabData;
            } else {
                this.openTabs.push(newTabData);
            }
        }
        
        this.switchToTab(filePath);
    }

    /**
     * 根据路径查找标签页
     */
    findTabByPath(filePath) {
        return this.openTabs.find(tab => tab.path === filePath);
    }

    /**
     * 切换到指定标签页
     */
    switchToTab(tabId) {
        this.activeTab = tabId;
        appState.activeFilePath = (tabId === 'home') ? null : tabId;
        this.render();
        
        if (tabId === 'home') {
            homepageEl.style.display = 'flex';
            editorWrapperEl.style.display = 'none';
            mainHeaderActions.style.display = 'none';
            
            // [重构] 步骤 1: 将全局函数调用改为事件发布
           
            eventBus.emit('ui:updateFileTags', null);
            
            // [重构] 步骤 1: 将全局函数调用改为事件发布
            
            eventBus.emit('ui:updateBacklinks', null);
        } else {
            homepageEl.style.display = 'none';
            editorWrapperEl.style.display = 'flex';
            
            const tabData = this.findTabByPath(tabId);
			eventBus.emit('editor:load-file', tabId);
            if (tabData && tabData.isNew) {
                mainHeaderActions.style.display = 'none';
                appState.activeFilePath = null;
              
                
                // [重构] 步骤 1: 将全局函数调用改为事件发布
                eventBus.emit('ui:updateFileTags', null);
                
                // [重构] 步骤 1: 将全局函数调用改为事件发布
                eventBus.emit('ui:updateBacklinks', null);
            } else {
                mainHeaderActions.style.display = 'flex';
                
			
                // [重构] 步骤 1: 将全局函数调用改为事件发布
                eventBus.emit('ui:updateFileTags', tabId);

                // [重构] 步骤 1: 将全局函数调用改为事件发布
                eventBus.emit('ui:updateBacklinks', tabId);
            }
        }
        
        eventBus.emit('ui:updateVirtualScroll');
        
        this.updateWindowTitle();
    }

    /**
     * 关闭标签页
     */
    closeTab(filePath) {
        const index = this.openTabs.findIndex(tab => tab.path === filePath);
        if (index > -1) {
            this.openTabs.splice(index, 1);
            if (this.activeTab === filePath) {
                const newActiveTab = (this.openTabs[index - 1] || this.openTabs[0] || { path: 'home' }).path;
                this.switchToTab(newActiveTab);
            } else {
                this.render();
            }
        }
    }

    /**
     * 更新单个标签页的路径(用于文件重命名)
     */
    updateTabId(oldPath, newPath) {
        const tabIndex = this.openTabs.findIndex(tab => tab.path === oldPath);
        if (tabIndex > -1) {
            this.openTabs[tabIndex].path = newPath;
            this.openTabs[tabIndex].title = newPath.split(/[/\\]/).pop();
        }
        if (this.activeTab === oldPath) {
            this.activeTab = newPath;
            appState.activeFilePath = newPath;
        }
        this.render();
        this.updateWindowTitle();
    }

    /**
     * 批量更新文件夹重命名后的所有子文件标签页路径
     */
    updatePathsForRenamedFolder(oldPrefix, newPrefix) {
        console.log(`🔄 批量更新标签页路径: ${oldPrefix} -> ${newPrefix}`);
        
        let activeTabUpdated = false;
        let updatedCount = 0;

        this.openTabs.forEach(tab => {
            if (tab.path.startsWith(oldPrefix)) {
                const newPath = tab.path.replace(oldPrefix, newPrefix);
                const oldPath = tab.path;
                
                tab.path = newPath;
                tab.title = newPath.split(/[/\\]/).pop();
                
                updatedCount++;
                console.log(`  ✅ 更新标签页: ${oldPath} -> ${newPath}`);

                if (this.activeTab === oldPath) {
                    this.activeTab = newPath;
                    activeTabUpdated = true;
                }
            }
        });

        if (activeTabUpdated) {
            appState.activeFilePath = this.activeTab;
            console.log(`  🎯 激活标签已更新: ${this.activeTab}`);
        }

        console.log(`✅ 共更新 ${updatedCount} 个标签页`);
        this.render();
        this.updateWindowTitle();
    }

    /**
     * 渲染标签页
     */
    render() {
        dynamicTabContainer.innerHTML = '';
        homeTabBtn.classList.toggle('active', this.activeTab === 'home');
        
        this.openTabs.forEach(tabData => {
            const tabEl = document.createElement('button');
            tabEl.className = 'tab-btn dynamic-tab-item';
            tabEl.textContent = tabData.title;
            tabEl.title = tabData.path;
            tabEl.dataset.filePath = tabData.path;
            tabEl.classList.toggle('active', this.activeTab === tabData.path);
            
            const closeBtn = document.createElement('span');
            closeBtn.className = 'close-tab-btn';
            closeBtn.textContent = '×';
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                this.closeTab(tabData.path);
            };
            
            tabEl.appendChild(closeBtn);
            tabEl.addEventListener('click', () => this.switchToTab(tabData.path));
            dynamicTabContainer.appendChild(tabEl);
        });
    }

    /**
     * 添加新笔记标签页
     */
    handleAddNewNote() {
        const newTabId = `untitled-${Date.now()}`;
        const newTitle = `空白页签`;
        this.openTabs.push({ path: newTabId, title: newTitle, isNew: true });
        this.switchToTab(newTabId);
    }

    /**
     * 更新窗口标题
     */
    async updateWindowTitle() {
        const baseTitle = 'CheetahNote - 极速笔记';
        let newTitle = baseTitle;
        
        if (this.activeTab === 'home') {
            newTitle = baseTitle;
        } else {
            const tabData = this.findTabByPath(this.activeTab);
            
            if (tabData && tabData.isNew) {
                newTitle = baseTitle;
            } else if (appState.rootPath && this.activeTab) {
                const rootPath = appState.rootPath.replace(/\\/g, '/');
                const relativePath = this.activeTab.replace(/\\/g, '/');
                const absolutePath = `${rootPath}/${relativePath}`;
                
                newTitle = `${baseTitle} - ${absolutePath}`;
            }
        }
        
        // 更新网页标题
        document.title = newTitle;
        
        // 更新 Tauri 窗口标题
        try {
            if (window.__TAURI__) {
                const appWindow = window.__TAURI__.window.getCurrentWindow();
                await appWindow.setTitle(newTitle);
                console.log('✅ 标题已更新:', newTitle);
            }
        } catch (error) {
            console.warn('⚠️ 更新 Tauri 窗口标题失败:', error);
        }
    }
}

// 创建并导出单例实例
const tabManager = new TabManager();

// ES Module 导出
export { tabManager};

console.log('✅ tab_manager.js 加载完成');