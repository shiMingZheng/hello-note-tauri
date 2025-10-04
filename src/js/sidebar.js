// src/js/sidebar.js
// 负责管理侧边栏标签列表和筛选逻辑

'use strict';
console.log('📜 sidebar.js 开始加载...');

let tagSidebarListElement;
let clearFilterBtnElement;

// [新增] 声明新元素的变量
let toggleTagsBtn;
let tagsPopover;
let currentFileTagsList;


/**
 * 初始化侧边栏相关的 DOM 元素和事件
 */
function initializeSidebar() {
    tagSidebarListElement = document.getElementById('tag-sidebar-list');
    clearFilterBtnElement = document.getElementById('clear-filter-btn');

      // [新增] 获取新元素
    toggleTagsBtn = document.getElementById('toggle-tags-btn');
    tagsPopover = document.getElementById('tags-popover');
    currentFileTagsList = document.getElementById('current-file-tags-list');

    clearFilterBtnElement.addEventListener('click', handleClearTagFilter);
    // [新增] 为新按钮绑定点击事件
    toggleTagsBtn.addEventListener('click', toggleTagsPopover);
    
    // [新增] 点击浮层外部时关闭浮层
    document.addEventListener('click', (e) => {
        if (!tagsPopover.contains(e.target) && !toggleTagsBtn.contains(e.target)) {
            tagsPopover.style.display = 'none';
        }
    });

}
// [新增] 切换“所有标签”浮层显示/隐藏的函数
function toggleTagsPopover() {
    const isVisible = tagsPopover.style.display === 'block';
    tagsPopover.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
        refreshAllTagsList(); // 显示时刷新标签列表
    }
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
	
	tagsPopover.style.display = 'none'; // [新增] 点击后关闭浮层
    
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

/**
 * [新增] 更新“我的标签”区域的UI
 * @param {string | null} filePath - 当前文件路径，或 null
 */
async function updateCurrentFileTagsUI(filePath) {
    if (!currentFileTagsList) return;

    if (!filePath) {
        currentFileTagsList.innerHTML = '<li class="no-tags-info">未选择文件</li>';
        return;
    }

    try {
        const tags = await invoke('get_tags_for_file', { path: filePath });
        appState.currentFileTags = tags;
        
        currentFileTagsList.innerHTML = '';
        if (tags.length === 0) {
            currentFileTagsList.innerHTML = '<li class="no-tags-info">无标签</li>';
            return;
        }
        
        tags.forEach(tagName => {
            const li = document.createElement('li');
            li.className = 'tag-pill-display';
            li.textContent = tagName;
            currentFileTagsList.appendChild(li);
        });
    } catch (error) {
        console.error(`获取文件 ${filePath} 的标签失败:`, error);
        currentFileTagsList.innerHTML = '<li class="no-tags-info">加载标签失败</li>';
    }
}


// 在 DOM 加载后初始化
document.addEventListener('DOMContentLoaded', initializeSidebar);
console.log('✅ sidebar.js 加载完成');
// [最终修复] 将核心函数显式挂载到全局 window 对象上
// [修改] 将新函数也挂载到全局
window.refreshAllTagsList = refreshAllTagsList;
window.updateCurrentFileTagsUI = updateCurrentFileTagsUI;