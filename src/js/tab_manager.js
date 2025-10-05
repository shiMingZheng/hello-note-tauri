// src/js/tab_manager.js - (新增 updatePathsForRenamedFolder 函数)

'use strict';
console.log('📜 tab_manager.js 开始加载...');

// ... (顶部变量和 init, openTab, findTabByPath 等函数保持不变) ...
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

    // ▼▼▼ 【新增】这个函数用于批量更新标签页路径 ▼▼▼
    updatePathsForRenamedFolder(oldPrefix, newPrefix) {
        let activeTabUpdated = false;
        this.openTabs.forEach(tab => {
            if (tab.path.startsWith(oldPrefix)) {
                const newPath = tab.path.replace(oldPrefix, newPrefix);
                tab.path = newPath;
                tab.title = newPath.split(/[/\\]/).pop();
                if (this.activeTab === oldPrefix) {
                    this.activeTab = newPath;
                    activeTabUpdated = true;
                }
            }
        });

        if (activeTabUpdated) {
            appState.activeFilePath = this.activeTab;
        }
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