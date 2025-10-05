// src/js/tab_manager.js - 已包含 updatePathsForRenamedFolder 函数

'use strict';
console.log('📜 tab_manager.js 开始加载...');

let dynamicTabContainer, homeTabBtn, addNewNoteTabBtn, mainHeaderActions, editorWrapperEl, homepageEl;

const tabManager = {
    openTabs: [],
    activeTab: 'home',

    init() {
        dynamicTabContainer = document.getElementById('dynamic-tab-container');
        homeTabBtn = document.getElementById('tab-home');
        addNewNoteTabBtn = document.getElementById('add-new-note-tab-btn');
        mainHeaderActions = document.getElementById('main-header-actions');
        editorWrapperEl = document.getElementById('editor-wrapper');
        homepageEl = document.getElementById('homepage');
        homeTabBtn.addEventListener('click', () => this.switchToTab('home'));
        addNewNoteTabBtn.addEventListener('click', () => this.handleAddNewNote());
    },

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
    },

    findTabByPath(filePath) {
        return this.openTabs.find(tab => tab.path === filePath);
    },

    switchToTab(tabId) {
        this.activeTab = tabId;
        appState.activeFilePath = (tabId === 'home') ? null : tabId;
        this.render();
        if (tabId === 'home') {
            homepageEl.style.display = 'flex';
            editorWrapperEl.style.display = 'none';
            mainHeaderActions.style.display = 'none';
            window.updateCurrentFileTagsUI(null);
            window.updateBacklinksUI(null);
        } else {
            homepageEl.style.display = 'none';
            editorWrapperEl.style.display = 'flex';
            const tabData = this.findTabByPath(tabId);
            if (tabData && tabData.isNew) {
                mainHeaderActions.style.display = 'none';
                appState.activeFilePath = null;
                markdownEditor.value = `# 空白页签\n\n您可以在左侧文件树中新建或打开一个笔记进行编辑。`;
                markdownEditor.readOnly = true;
                window.updateCurrentFileTagsUI(null);
                window.updateBacklinksUI(null);
            } else {
                mainHeaderActions.style.display = 'flex';
                markdownEditor.readOnly = false;
                loadFileToEditor(tabId);
                window.updateCurrentFileTagsUI(tabId);
                window.updateBacklinksUI(tabId);
            }
        }
        if (window.updateVirtualScrollData) {
            updateVirtualScrollData();
        }
    },

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
    },

    /**
     * 更新单个标签页的路径（用于文件重命名）
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
    },

    /**
     * [关键函数] 批量更新文件夹重命名后的所有子文件标签页路径
     * @param {string} oldPrefix - 旧的文件夹路径前缀
     * @param {string} newPrefix - 新的文件夹路径前缀
     */
    updatePathsForRenamedFolder(oldPrefix, newPrefix) {
        console.log(`🔄 批量更新标签页路径: ${oldPrefix} -> ${newPrefix}`);
        
        let activeTabUpdated = false;
        let updatedCount = 0;

        // 遍历所有打开的标签页
        this.openTabs.forEach(tab => {
            // [关键] 检查标签页路径是否以旧前缀开头
            if (tab.path.startsWith(oldPrefix)) {
                // 替换路径前缀
                const newPath = tab.path.replace(oldPrefix, newPrefix);
                const oldPath = tab.path;
                
                tab.path = newPath;
                tab.title = newPath.split(/[/\\]/).pop();
                
                updatedCount++;
                console.log(`  ✅ 更新标签页: ${oldPath} -> ${newPath}`);

                // 如果当前激活的标签也被更新了，记录下来
                if (this.activeTab === oldPath) {
                    this.activeTab = newPath;
                    activeTabUpdated = true;
                }
            }
        });

        // 如果激活标签被更新，同步更新 appState
        if (activeTabUpdated) {
            appState.activeFilePath = this.activeTab;
            console.log(`  🎯 激活标签已更新: ${this.activeTab}`);
        }

        console.log(`✅ 共更新 ${updatedCount} 个标签页`);
        this.render();
    },

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
    },

    handleAddNewNote() {
        const newTabId = `untitled-${Date.now()}`;
        const newTitle = `空白页签`;
        this.openTabs.push({ path: newTabId, title: newTitle, isNew: true });
        this.switchToTab(newTabId);
    }
};

document.addEventListener('DOMContentLoaded', () => tabManager.init());
window.tabManager = tabManager;