// src/js/sidebar.js
'use strict';

import { appState } from './core/AppState.js';
import { updateVirtualScrollData } from './virtual-scroll.js';

console.log('📜 sidebar.js 开始加载...');

const { invoke } = window.__TAURI__.core;

class Sidebar {
    constructor() {
        if (Sidebar.instance) {
            return Sidebar.instance;
        }
        
        // DOM 元素引用
        this.tagSidebarListElement = null;
        this.clearFilterBtnElement = null;
        this.toggleTagsBtn = null;
        this.tagsPopover = null;
        this.currentFileTagsList = null;
        
        Sidebar.instance = this;
    }
    
    init() {
        this.tagSidebarListElement = document.getElementById('tag-sidebar-list');
        this.clearFilterBtnElement = document.getElementById('clear-filter-btn');
        this.toggleTagsBtn = document.getElementById('toggle-tags-btn');
        this.tagsPopover = document.getElementById('tags-popover');
        this.currentFileTagsList = document.getElementById('current-file-tags-list');
        
        this.clearFilterBtnElement.addEventListener('click', () => this.handleClearTagFilter());
        this.toggleTagsBtn.addEventListener('click', () => this.toggleTagsPopover());
        
        document.addEventListener('click', (e) => {
            if (!this.tagsPopover.contains(e.target) && !this.toggleTagsBtn.contains(e.target)) {
                this.tagsPopover.style.display = 'none';
            }
        });
        
        console.log('✅ 标签侧边栏初始化完成');
    }
    
    toggleTagsPopover() {
        const isVisible = this.tagsPopover.style.display === 'block';
        this.tagsPopover.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            this.refreshAllTagsList();
        }
    }
    
    async refreshAllTagsList() {
        try {
            const tags = await invoke('get_all_tags');
            appState.allTags = tags;
            this.tagSidebarListElement.innerHTML = '';
            
            if (tags.length === 0) {
                this.tagSidebarListElement.innerHTML = '<li class="no-tags-info">暂无标签</li>';
                return;
            }
            
            tags.forEach(tagInfo => {
                const li = document.createElement('li');
                li.className = 'tag-sidebar-item';
                li.textContent = `${tagInfo.name} (${tagInfo.count})`;
                li.dataset.tagName = tagInfo.name;
                
                if (appState.activeTagFilter === tagInfo.name) {
                    li.classList.add('active');
                }
                
                li.addEventListener('click', () => this.handleTagFilterClick(tagInfo.name));
                this.tagSidebarListElement.appendChild(li);
            });
        } catch (error) {
            this.tagSidebarListElement.innerHTML = '<li class="no-tags-info">加载标签失败</li>';
        }
    }
    
    async handleTagFilterClick(tagName) {
        this.tagsPopover.style.display = 'none';
        
        if (appState.activeTagFilter === tagName) {
            this.handleClearTagFilter();
            return;
        }
        
        try {
            const filePaths = await invoke('get_files_by_tag', { tagName });
            appState.activeTagFilter = tagName;
            this.clearFilterBtnElement.style.display = 'block';
            
            updateVirtualScrollData(filePaths);
           
            
            this.refreshAllTagsList();
        } catch (error) {
            if (window.showError) {
                window.showError(`筛选文件失败: ${error}`);
            }
        }
    }
    
    handleClearTagFilter() {
        appState.activeTagFilter = null;
        this.clearFilterBtnElement.style.display = 'none';
        
        if (window.updateVirtualScrollData) {
            window.updateVirtualScrollData();
        }
        
        this.refreshAllTagsList();
    }
    
    async updateCurrentFileTagsUI(relativePath) {
        if (!this.currentFileTagsList) return;
        
        if (!relativePath) {
            this.currentFileTagsList.innerHTML = '<li class="no-tags-info">未选择文件</li>';
            return;
        }
        
        try {
            const tags = await invoke('get_tags_for_file', { relativePath });
            appState.currentFileTags = tags;
            this.currentFileTagsList.innerHTML = '';
            
            if (tags.length === 0) {
                this.currentFileTagsList.innerHTML = '<li class="no-tags-info">无标签</li>';
                return;
            }
            
            tags.forEach(tagName => {
                const li = document.createElement('li');
                li.className = 'tag-pill-display';
                li.textContent = tagName;
                this.currentFileTagsList.appendChild(li);
            });
        } catch (error) {
            this.currentFileTagsList.innerHTML = '<li class="no-tags-info">加载标签失败</li>';
        }
    }
}

// 创建单例
const sidebar = new Sidebar();

// ES Module 导出
export {
    sidebar
};

console.log('✅ sidebar.js 加载完成');