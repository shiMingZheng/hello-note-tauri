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
        // 1. 如果目标文件的页签已经存在，直接切换过去
        if (this.findTabByPath(filePath)) {
            this.switchToTab(filePath);
            return;
        }

        const newTabData = { 
            path: filePath,
            title: filePath.split(/[/\\]/).pop()
        };

        // 2. 如果当前在首页，则行为是“新建一个页签”
        if (this.activeTab === 'home') {
            this.openTabs.push(newTabData);
        } 
        // 3. 如果当前在任何文件页签或空白页签，则“替换当前页签”
        else {
            const currentIndex = this.openTabs.findIndex(tab => tab.path === this.activeTab);
            if (currentIndex > -1) {
                // 用新文件的数据替换掉当前激活的页签数据
                this.openTabs[currentIndex] = newTabData;
            } else {
                // 兜底：如果出现意外情况找不到当前页签，则新建一个
                this.openTabs.push(newTabData);
            }
        }

        // 4. 最后，切换到这个新内容上
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
            
            // [修改] 当回到首页时，清除文件选中状态
            appState.activeFilePath = null;
            window.updateCurrentFileTagsUI(null);
            window.updateBacklinksUI(null);

        } else {
            homepageEl.style.display = 'none';
            editorWrapperEl.style.display = 'flex';
            
            // [核心修改] 将当前激活的文件路径同步到全局状态
            appState.activeFilePath = tabId; 

            const tabData = this.findTabByPath(tabId);
            
            if (tabData && tabData.isNew) {
                // (空白页签逻辑)
                mainHeaderActions.style.display = 'none'; 
                appState.activeFilePath = null; // 空白页签不对应任何文件，清除选中
                markdownEditor.value = `# 空白页签\n\n您可以在左侧文件树中新建或打开一个笔记进行编辑。`;
                markdownEditor.readOnly = true; 
                window.updateCurrentFileTagsUI(null);
                window.updateBacklinksUI(null);
            } else {
                // (普通文件页签逻辑)
                mainHeaderActions.style.display = 'flex'; 
                markdownEditor.readOnly = false;
                loadFileToEditor(tabId);
                window.updateCurrentFileTagsUI(tabId);
                window.updateBacklinksUI(tabId);
            }
        }
        
        // [核心修改] 无论切换到哪个页签，都强制刷新一次文件列表以更新选中高亮
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