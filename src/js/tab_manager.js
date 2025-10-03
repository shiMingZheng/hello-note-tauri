// src/js/tab_manager.js

'use strict';
console.log('📜 tab_manager.js 开始加载...');

let dynamicTabContainer;
let homeTabBtn;
let addNewNoteTabBtn;
let mainHeaderActions;
let editorWrapperEl;
let homepageEl;

const tabManager = {
    openTabs: [],       // Array of file paths
    activeTab: 'home', // 'home' or a file path

    init() {
        dynamicTabContainer = document.getElementById('dynamic-tab-container');
        homeTabBtn = document.getElementById('tab-home');
        addNewNoteTabBtn = document.getElementById('add-new-note-tab-btn');
        mainHeaderActions = document.getElementById('main-header-actions');
        editorWrapperEl = document.getElementById('editor-wrapper');
        homepageEl = document.getElementById('homepage');
        
        homeTabBtn.addEventListener('click', () => this.switchToTab('home'));
        addNewNoteTabBtn.addEventListener('click', this.handleAddNewNote);
    },

    /**
     * 打开或切换到一个文件页签
     * @param {string} filePath 
     */
    openTab(filePath) {
        if (!this.openTabs.includes(filePath)) {
            this.openTabs.push(filePath);
        }
        this.switchToTab(filePath);
    },

    /**
     * 切换到指定页签
     * @param {string} tabId - 'home' or a file path
     */
    switchToTab(tabId) {
        this.activeTab = tabId;

        // 更新 UI
        this.render();

        if (tabId === 'home') {
            homepageEl.style.display = 'flex';
            editorWrapperEl.style.display = 'none';
            mainHeaderActions.style.display = 'none'; // 隐藏操作按钮
        } else {
            // 是文件页签
            homepageEl.style.display = 'none';
            editorWrapperEl.style.display = 'flex';
            mainHeaderActions.style.display = 'flex'; // 显示操作按钮
            
            // 加载文件内容
            loadFileToEditor(tabId);
        }
    },

    /**
     * 关闭一个文件页签
     * @param {string} filePath 
     */
    closeTab(filePath) {
        const index = this.openTabs.indexOf(filePath);
        if (index > -1) {
            this.openTabs.splice(index, 1);

            // 如果关闭的是当前激活的页签
            if (this.activeTab === filePath) {
                // 激活前一个页签，或者如果没有其他页签了就激活首页
                const newActiveTab = this.openTabs[index - 1] || 'home';
                this.switchToTab(newActiveTab);
            } else {
                // 如果关闭的不是当前页签，只需重新渲染
                this.render();
            }
        }
    },

    /**
     * 重新渲染所有动态页签
     */
    render() {
        dynamicTabContainer.innerHTML = '';
        
        homeTabBtn.classList.toggle('active', this.activeTab === 'home');

        this.openTabs.forEach(filePath => {
            const fileName = filePath.split(/[/\\]/).pop();
            const tabEl = document.createElement('button');
            tabEl.className = 'tab-btn dynamic-tab-item';
            tabEl.textContent = fileName;
            tabEl.title = filePath;
            tabEl.dataset.filePath = filePath;
            tabEl.classList.toggle('active', this.activeTab === filePath);

            const closeBtn = document.createElement('span');
            closeBtn.className = 'close-tab-btn';
            closeBtn.textContent = '×';
            closeBtn.onclick = (e) => {
                e.stopPropagation(); // 防止触发切换页签的事件
                this.closeTab(filePath);
            };

            tabEl.appendChild(closeBtn);
            tabEl.addEventListener('click', () => this.switchToTab(filePath));
            dynamicTabContainer.appendChild(tabEl);
        });
    },

    /**
     * 处理点击“+”按钮新建笔记
     */
    async handleAddNewNote() {
        let parentPath = appState.rootPath;
        if (!parentPath) {
            showError("请先打开一个文件夹");
            return;
        }

        // 智能判断目录
        const activeFile = document.querySelector('#file-list li.active');
        if (activeFile) {
            const isDir = activeFile.dataset.isDir === 'true';
            if (isDir) {
                parentPath = activeFile.dataset.path;
            } else {
                parentPath = activeFile.dataset.path.substring(0, activeFile.dataset.path.lastIndexOf('\\'));
            }
        }
        
        const fileName = prompt('请输入新笔记的名称:');
        if (!fileName || fileName.trim() === '') return;

        try {
            const fullFileName = fileName.trim().endsWith('.md') ? fileName.trim() : fileName.trim() + '.md';
            const newFilePath = await invoke('create_new_file', { dirPath: parentPath, fileName: fullFileName });
            
            // 刷新文件树并打开新页签
            await refreshFileTree();
            tabManager.openTab(newFilePath);

        } catch (error) {
            console.error('新建笔记失败:', error);
            showError('新建笔记失败: ' + error);
        }
    }
};

// 初始化
document.addEventListener('DOMContentLoaded', () => tabManager.init());
window.tabManager = tabManager;