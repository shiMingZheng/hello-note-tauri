// src/js/sidebar.js
// 负责管理侧边栏标签列表和筛选逻辑

'use strict';
console.log('📜 sidebar.js 开始加载...');

let tagSidebarListElement;
let clearFilterBtnElement;

/**
 * 初始化侧边栏相关的 DOM 元素和事件
 */
function initializeSidebar() {
    tagSidebarListElement = document.getElementById('tag-sidebar-list');
    clearFilterBtnElement = document.getElementById('clear-filter-btn');

    clearFilterBtnElement.addEventListener('click', handleClearTagFilter);
}

/**
 * 从后端获取所有标签并渲染到侧边栏
 */
async function refreshAllTagsList() {
    try {
        const tags = await invoke('get_all_tags');
        appState.allTags = tags;
        
        tagSidebarListElement.innerHTML = '';
        if (tags.length === 0) {
            tagSidebarListElement.innerHTML = '<li class="no-tags-info">暂无标签</li>';
        }

        tags.forEach(tagInfo => {
            const li = document.createElement('li');
            li.className = 'tag-sidebar-item';
            li.textContent = `${tagInfo.name} (${tagInfo.count})`;
            li.dataset.tagName = tagInfo.name;

            // 高亮当前筛选的标签
            if (appState.activeTagFilter === tagInfo.name) {
                li.classList.add('active');
            }

            li.addEventListener('click', () => handleTagFilterClick(tagInfo.name));
            tagSidebarListElement.appendChild(li);
        });
    } catch (error) {
        console.error('刷新全局标签列表失败:', error);
        tagSidebarListElement.innerHTML = '<li class="no-tags-info">加载标签失败</li>';
    }
}

/**
 * 处理点击标签进行筛选
 * @param {string} tagName 
 */
async function handleTagFilterClick(tagName) {
    console.log(`🏷️ 按标签筛选: ${tagName}`);
    
    // 如果重复点击同一个标签，则取消筛选
    if (appState.activeTagFilter === tagName) {
        handleClearTagFilter();
        return;
    }

    try {
        const filePaths = await invoke('get_files_by_tag', { tagName });
        appState.activeTagFilter = tagName;
        
        // 更新UI
        clearFilterBtnElement.style.display = 'block';
        updateVirtualScrollData(filePaths); // 传递筛选后的文件路径
        refreshAllTagsList(); // 重新渲染以高亮选中的标签

    } catch (error) {
        console.error(`按标签 ${tagName} 筛选文件失败:`, error);
        showError(`筛选文件失败: ${error}`);
    }
}

/**
 * 清除标签筛选，显示所有文件
 */
function handleClearTagFilter() {
    console.log('🔄 清除标签筛选');
    appState.activeTagFilter = null;
    
    // 更新UI
    clearFilterBtnElement.style.display = 'none';
    updateVirtualScrollData(); // 不传参数，显示所有文件
    refreshAllTagsList(); // 重新渲染以取消高亮
}

// 在 DOM 加载后初始化
document.addEventListener('DOMContentLoaded', initializeSidebar);
console.log('✅ sidebar.js 加载完成');
// [最终修复] 将核心函数显式挂载到全局 window 对象上
window.refreshAllTagsList = refreshAllTagsList;