// src/js/sidebar.js
'use strict';

import { appState } from './core/AppState.js';
import { eventBus } from './core/EventBus.js';

import { invoke } from './core/TauriAPI.js';
import { domElements } from './dom-init.js';
import { showError } from './ui-utils.js';
import { updateVirtualScrollData } from './virtual-scroll.js';
import { handleFileListClick, handleFileListContextMenu } from './file-manager.js';
import { outlineManager } from './outline.js'; // 导入 outlineManager


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
            domElements.toggleTagsBtn.addEventListener('click', () => {
				outlineManager.hide(); // <--- 添加这行
				this.handleToggleTagsPopover();
			})
        }
		
        
        // 绑定清除标签筛选按钮
        if (domElements.clearFilterBtn) {
            domElements.clearFilterBtn.addEventListener('click', () => this.handleClearTagFilter());
        }
       // ★★★ [优化] 在这里订阅事件 ★★★
        eventBus.on('ui:updateFileTags', (filePath) => {
        console.log('🔄 [sidebar] 收到 ui:updateFileTags 事件:', filePath);
        this.loadFileTags(filePath); // 调用加载和更新UI的函数
        });
        
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
	
	// --- 在这里添加新的方法 ---
    /**
     * 隐藏标签弹窗 (如果它当前是可见的)
     */
    hideTagsPopover() {
        // 检查 DOM 元素是否存在以及是否可见
        if (domElements.tagsPopover && domElements.tagsPopover.style.display === 'block') {
            domElements.tagsPopover.style.display = 'none';
            this.isTagsPopoverVisible = false; // 更新状态
            console.log('🏷️ 标签面板已隐藏');

            // 隐藏标签弹窗后，通常应该显示文件列表视图
            // 确保文件列表是可见的
            if (domElements.fileViewContainer) {
                 domElements.fileViewContainer.style.display = 'block'; // 或 'flex'
            }
             // 如果搜索结果当前是显示的，也需要隐藏
            if (domElements.searchResultsList && domElements.searchResultsList.style.display === 'block') {
                domElements.searchResultsList.style.display = 'none';
            }

            // 如果之前有标签筛选，隐藏标签弹窗时可以选择清除筛选
            // if (appState.activeTagFilter) {
            //    this.handleClearTagFilter(); // 或者发布一个清除筛选的事件
            // }
        }
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

            // 获取包含该标签的所有文件 (注意：后端返回的是 Vec<String>，即路径列表)
            // ★★★ 修改这里：获取文件信息列表 ★★★
            const filesInfo = await invoke('get_files_by_tag', { tagName });
            console.log(`  找到 ${filesInfo.length} 个文件`);

            // ★★★ 修改这里：不再调用 renderFilteredFileList ★★★
            // this.renderFilteredFileList(files);

            // ★★★ 修改这里：调用 updateVirtualScrollData 进行筛选 ★★★
            // 后端 get_files_by_tag 应该返回 [{path: string, title: string}, ...]
            // 如果后端只返回路径 Vec<String>, 需要前端补充 title (从 appState.fileTreeMap 获取?)
            // 假设后端已修改为返回 {path: string, title: string} 列表
            updateVirtualScrollData(filesInfo); // <--- 传递文件信息列表

            // 显示"清除筛选"按钮
            if (domElements.clearFilterBtn) {
                domElements.clearFilterBtn.style.display = 'inline-block'; // 改为 inline-block 或 block
            }

            // 更新标签列表高亮
            this.updateTagListHighlight(tagName);

            // ★★★ 新增：隐藏标签弹窗 ★★★
            if (domElements.tagsPopover) {
                domElements.tagsPopover.style.display = 'none';
            }


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

        // ★★★ 修改这里：调用 updateVirtualScrollData 清除筛选 ★★★
        updateVirtualScrollData(null); // <--- 传递 null 表示清除筛选

        // 清除标签列表高亮
        if (domElements.tagSidebarList) {
            const items = domElements.tagSidebarList.querySelectorAll('.tag-sidebar-item');
            items.forEach(item => item.classList.remove('active'));
        }

        // ★★★ 新增：隐藏标签弹窗（如果它是开着的）★★★
         if (domElements.tagsPopover && domElements.tagsPopover.style.display === 'block') {
             domElements.tagsPopover.style.display = 'none';
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
            const tags = await invoke('get_tags_for_file', { relativePath: filePath });
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