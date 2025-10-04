// src/js/tab_manager.js - 完整最终版

'use strict';
console.log('📜 tab_manager.js 开始加载...');

let dynamicTabContainer, homeTabBtn, addNewNoteTabBtn, mainHeaderActions, editorWrapperEl, homepageEl;

const tabManager = {
    openTabs: [], // Array of objects: { path: string, title: string, isNew?: boolean }
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
        if (!this.findTabByPath(filePath)) {
            this.openTabs.push({ 
                path: filePath,
                title: filePath.split(/[/\\]/).pop()
            });
        }
        this.switchToTab(filePath);
    },

    findTabByPath(filePath) {
        return this.openTabs.find(tab => tab.path === filePath);
    },

    switchToTab(tabId) {
        this.activeTab = tabId;
        this.render();

        if (tabId === 'home') {
            homepageEl.style.display = 'flex';
            editorWrapperEl.style.display = 'none';
            mainHeaderActions.style.display = 'none';
        } else {
            homepageEl.style.display = 'none';
            editorWrapperEl.style.display = 'flex';
            mainHeaderActions.style.display = 'flex';
            
            const tabData = this.findTabByPath(tabId);
            if (tabData && tabData.isNew) {
                // 是新标签，清空并设置默认内容
                appState.activeFilePath = null; // 这是一个未保存的文件
                markdownEditor.value = `# ${tabData.title.replace('.md', '')}\n\n`;
                // 清理可能残留的旧标签
                if (window.tagModal) {
                    appState.currentFileTags = [];
                }
            } else {
                loadFileToEditor(tabId);
            }
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

    /**
     * [修复] 点击“+”号只创建新的空白页签，不创建文件
     */
    handleAddNewNote() {
        const newTabId = `untitled-${Date.now()}`;
        // 为了避免重名，可以做得更复杂一些，但暂时先用简单版本
        const existingUntitled = this.openTabs.filter(t => t.isNew).length;
        const newTitle = `空白页签`;
        
        this.openTabs.push({ path: newTabId, title: newTitle, isNew: true });
        this.switchToTab(newTabId);
    }
};

document.addEventListener('DOMContentLoaded', () => tabManager.init());
window.tabManager = tabManager;