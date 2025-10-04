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
			window.updateCurrentFileTagsUI(null); // [新增] 清空“我的标签”

        } else {
            homepageEl.style.display = 'none';
            editorWrapperEl.style.display = 'flex';
            mainHeaderActions.style.display = 'flex';
            
            const tabData = this.findTabByPath(tabId);
            // [核心修改]
			if (tabData && tabData.isNew) {
				// 这是新的“空白页签”
				mainHeaderActions.style.display = 'none'; // 隐藏“标签”和“保存”按钮
				appState.activeFilePath = null;
				markdownEditor.value = `# 空白页签\n\n您可以在左侧文件树中新建或打开一个笔记进行编辑。`;
				markdownEditor.readOnly = true; // 设置编辑器为只读
				window.updateCurrentFileTagsUI(null); // [新增] 清空“我的标签”
				if (window.tagModal) {
					appState.currentFileTags = [];
				}
			} else {
				// 这是普通的文件页签
				mainHeaderActions.style.display = 'flex'; // 显示操作按钮
				markdownEditor.readOnly = false; // 确保编辑器是可写的
				loadFileToEditor(tabId);
				window.updateCurrentFileTagsUI(tabId); // [新增] 更新“我的标签”
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