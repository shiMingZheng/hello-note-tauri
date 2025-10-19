// src/js/sidebar.js
'use strict';

import { appState } from './core/AppState.js';
import { eventBus } from './core/EventBus.js';

import { invoke } from './core/TauriAPI.js';
import { domElements } from './dom-init.js';
import { showError } from './ui-utils.js';
import { updateVirtualScrollData } from './virtual-scroll.js';
import { handleFileListClick, handleFileListContextMenu } from './file-manager.js';


console.log('📜 sidebar.js 开始加载...');

class Sidebar {
    constructor() {
        if (Sidebar.instance) {
            return Sidebar.instance;
        }
        
        this.isTagsPopoverVisible = false;
        
        Sidebar.instance = this;
    }
    
    /**
     * 初始化侧边栏模块
     */
    init() {
        console.log('🎯 初始化侧边栏模块...');
        
        // 绑定标签弹窗切换按钮
        if (domElements.toggleTagsBtn) {
            domElements.toggleTagsBtn.addEventListener('click', () => this.handleToggleTagsPopover());
        }
        
        // 绑定清除标签筛选按钮
        if (domElements.clearFilterBtn) {
            domElements.clearFilterBtn.addEventListener('click', () => this.handleClearTagFilter());
        }
        
        // ⭐ 绑定文件列表的点击和右键事件
        if (domElements.fileListElement) {
            domElements.fileListElement.addEventListener('click', handleFileListClick);
            domElements.fileListElement.addEventListener('contextmenu', handleFileListContextMenu);
        }
        
        console.log('✅ 侧边栏模块初始化完成');
    }
    
    /**
     * 切换标签弹窗显示/隐藏
     */
    handleToggleTagsPopover() {
        if (!domElements.tagsPopover) return;
		
		const isVisible = domElements.tagsPopover.style.display === 'block';
		
		if (isVisible) {
			domElements.tagsPopover.style.display = 'none';
		} else {
			// ✅ 检查工作区是否已初始化
			if (!appState.rootPath || !appState.dbInitialized) {
				showError('请先打开一个笔记仓库');
				return;
			}
			
			domElements.tagsPopover.style.display = 'block';
			this.refreshAllTagsList();
		}
		
		console.log(`🏷️ 标签面板${isVisible ? '隐藏' : '显示'}`);
	}
    
    /**
     * 刷新所有标签列表
     */
    async refreshAllTagsList() {
		if (!domElements.tagSidebarList) return;
		
		// ✅ 检查工作区是否已初始化
		if (!appState.rootPath || !appState.dbInitialized) {
			console.warn('⚠️ 工作区未初始化，跳过加载标签');
			domElements.tagSidebarList.innerHTML = '<li style="padding: 10px; color: #999;">请先打开笔记仓库</li>';
			return;
		}
		
		try {
			const tags = await invoke('get_all_tags');
			appState.allTags = tags;
			
			this.renderAllTagsList(tags);
			
			console.log(`✅ 刷新标签列表: ${tags.length} 个标签`);
		} catch (error) {
			console.error('❌ 加载标签列表失败:', error);
			showError('加载标签列表失败: ' + error);
		}
	}
    
    /**
     * 渲染所有标签列表
     */
    renderAllTagsList(tags) {
        if (!domElements.tagSidebarList) return;
        
        domElements.tagSidebarList.innerHTML = '';
        
        if (!tags || tags.length === 0) {
            domElements.tagSidebarList.innerHTML = '<li style="padding: 10px; color: #999;">暂无标签</li>';
            return;
        }
        
        tags.forEach(tag => {
            const li = document.createElement('li');
            li.className = 'tag-sidebar-item';
            li.textContent = `${tag.name} (${tag.count})`;
            
            if (appState.activeTagFilter === tag.name) {
                li.classList.add('active');
            }
            
            li.addEventListener('click', () => this.handleTagClick(tag.name));
            
            domElements.tagSidebarList.appendChild(li);
        });
    }
    
    /**
     * 处理标签点击事件 - 筛选文件
     */
    async handleTagClick(tagName) {
        console.log(`🏷️ 点击标签筛选: ${tagName}`);
        
        try {
            appState.activeTagFilter = tagName;
            
            // 获取包含该标签的所有文件
            const files = await invoke('get_files_by_tag', { tagName });
            
            console.log(`  找到 ${files.length} 个文件`);
            
            // 渲染筛选后的文件列表
            this.renderFilteredFileList(files);
            
            // 显示"清除筛选"按钮
            if (domElements.clearFilterBtn) {
                domElements.clearFilterBtn.style.display = 'block';
            }
            
            // 更新标签列表高亮
            this.updateTagListHighlight(tagName);
            
        } catch (error) {
            console.error('❌ 标签筛选失败:', error);
            showError('标签筛选失败: ' + error);
        }
    }
    
    /**
     * 渲染筛选后的文件列表
     */
    renderFilteredFileList(files) {
        if (!domElements.fileListElement) return;
        
        domElements.fileListElement.innerHTML = '';
        
        if (files.length === 0) {
            domElements.fileListElement.innerHTML = '<li style="padding: 10px; color: #999;">该标签下暂无文件</li>';
            return;
        }
        
        files.forEach(file => {
            const li = document.createElement('li');
            li.className = 'file';
            li.dataset.path = file.path;
            li.dataset.isDir = 'false';
            li.dataset.name = file.title;
            
            const icon = '📄';
            const name = file.title;
            
            li.innerHTML = `<span class="item-name">${icon} ${name}</span>`;
            
            if (appState.activeFilePath === file.path) {
                li.classList.add('active');
            }
            
            domElements.fileListElement.appendChild(li);
        });
    }
    
    /**
     * 更新标签列表高亮
     */
    updateTagListHighlight(activeTagName) {
        if (!domElements.tagSidebarList) return;
        
        const items = domElements.tagSidebarList.querySelectorAll('.tag-sidebar-item');
        items.forEach(item => {
            if (item.textContent.startsWith(activeTagName + ' ')) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }
    
    /**
     * 清除标签筛选
     */
    handleClearTagFilter() {
        console.log('🧹 清除标签筛选');
        
        appState.activeTagFilter = null;
        
        // 隐藏"清除筛选"按钮
        if (domElements.clearFilterBtn) {
            domElements.clearFilterBtn.style.display = 'none';
        }
        
        // 恢复完整文件树
        updateVirtualScrollData();
        
        // 清除标签列表高亮
        if (domElements.tagSidebarList) {
            const items = domElements.tagSidebarList.querySelectorAll('.tag-sidebar-item');
            items.forEach(item => item.classList.remove('active'));
        }
    }
    
    /**
     * 更新当前文件的标签显示
     */
    updateCurrentFileTagsUI(filePath) {
        if (!domElements.currentFileTagsList) return;
        
        if (!filePath || filePath.startsWith('untitled-')) {
            domElements.currentFileTagsList.innerHTML = '<li class="no-tags-info">未打开文件</li>';
            return;
        }
        
        if (!appState.currentFileTags || appState.currentFileTags.length === 0) {
            domElements.currentFileTagsList.innerHTML = '<li class="no-tags-info">暂无标签</li>';
            return;
        }
        
        domElements.currentFileTagsList.innerHTML = '';
        
        appState.currentFileTags.forEach(tagName => {
            const li = document.createElement('li');
            li.className = 'tag-pill-display';
            li.textContent = tagName;
            domElements.currentFileTagsList.appendChild(li);
        });
    }
    
    /**
     * 加载文件的标签
     */
    async loadFileTags(filePath) {
        if (!filePath || filePath.startsWith('untitled-')) {
            appState.currentFileTags = [];
            this.updateCurrentFileTagsUI(filePath);
            return;
        }
        
        try {
            const tags = await invoke('get_file_tags', { relativePath: filePath });
            appState.currentFileTags = tags.sort();
            
            this.updateCurrentFileTagsUI(filePath);
            
            console.log(`✅ 加载文件标签: ${tags.length} 个`);
        } catch (error) {
            console.error('❌ 加载文件标签失败:', error);
            appState.currentFileTags = [];
            this.updateCurrentFileTagsUI(filePath);
        }
    }
}

// 创建单例
const sidebar = new Sidebar();

// ES Module 导出
export {
    sidebar
};

// 导出便捷函数
export const refreshAllTagsList = () => sidebar.refreshAllTagsList();
export const updateCurrentFileTagsUI = (filePath) => sidebar.updateCurrentFileTagsUI(filePath);
export const loadFileTags = (filePath) => sidebar.loadFileTags(filePath);

console.log('✅ sidebar.js 加载完成');