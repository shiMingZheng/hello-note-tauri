// src/js/tab_manager.js - 多标签页逻辑修复版

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

    // ▼▼▼【核心修改】简化并修正 openTab 逻辑 ▼▼▼
    openTab(filePath) {
        // 1. 如果目标文件的页签已经存在，直接切换过去
        if (this.findTabByPath(filePath)) {
            this.switchToTab(filePath);
            return;
        }

        // 2. 如果页签不存在，则新建一个
        const newTabData = { 
            path: filePath,
            title: filePath.split(/[/\\]/).pop()
        };
        this.openTabs.push(newTabData);

        // 3. 切换到这个新创建的页签
        this.switchToTab(filePath);
    },
    // ▲▲▲【核心修改】结束 ▲▲▲

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
                // 空白页签逻辑
                mainHeaderActions.style.display = 'none'; 
                appState.activeFilePath = null;
                markdownEditor.value = `# 空白页签\n\n您可以在左侧文件树中新建或打开一个笔记进行编辑。`;
                markdownEditor.readOnly = true; 
                window.updateCurrentFileTagsUI(null);
                window.updateBacklinksUI(null);
            } else {
                // 普通文件页签逻辑
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