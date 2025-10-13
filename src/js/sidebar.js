// src/js/sidebar.js

'use strict';
console.log('📜 sidebar.js 开始加载...');

let tagSidebarListElement, clearFilterBtnElement, toggleTagsBtn, tagsPopover, currentFileTagsList;

function initializeSidebar() {
    tagSidebarListElement = document.getElementById('tag-sidebar-list');
    clearFilterBtnElement = document.getElementById('clear-filter-btn');
    toggleTagsBtn = document.getElementById('toggle-tags-btn');
    tagsPopover = document.getElementById('tags-popover');
    currentFileTagsList = document.getElementById('current-file-tags-list');

    clearFilterBtnElement.addEventListener('click', handleClearTagFilter);
    toggleTagsBtn.addEventListener('click', toggleTagsPopover);
    
    document.addEventListener('click', (e) => {
        if (!tagsPopover.contains(e.target) && !toggleTagsBtn.contains(e.target)) {
            tagsPopover.style.display = 'none';
        }
    });
}

function toggleTagsPopover() {
    const isVisible = tagsPopover.style.display === 'block';
    tagsPopover.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
        refreshAllTagsList();
    }
}

async function refreshAllTagsList() {
    try {
        const tags = await invoke('get_all_tags');
        appState.allTags = tags;
        tagSidebarListElement.innerHTML = '';
        if (tags.length === 0) {
            tagSidebarListElement.innerHTML = '<li class="no-tags-info">暂无标签</li>';
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
            li.addEventListener('click', () => handleTagFilterClick(tagInfo.name));
            tagSidebarListElement.appendChild(li);
        });
    } catch (error) {
        tagSidebarListElement.innerHTML = '<li class="no-tags-info">加载标签失败</li>';
    }
}

async function handleTagFilterClick(tagName) {
    tagsPopover.style.display = 'none';
    if (appState.activeTagFilter === tagName) {
        handleClearTagFilter();
        return;
    }
    try {
        const filePaths = await invoke('get_files_by_tag', { tagName });
        appState.activeTagFilter = tagName;
        clearFilterBtnElement.style.display = 'block';
        updateVirtualScrollData(filePaths);
        refreshAllTagsList();
    } catch (error) {
        showError(`筛选文件失败: ${error}`);
    }
}

function handleClearTagFilter() {
    appState.activeTagFilter = null;
    clearFilterBtnElement.style.display = 'none';
    updateVirtualScrollData();
    refreshAllTagsList();
}

async function updateCurrentFileTagsUI(relativePath) {
    if (!currentFileTagsList) return;
    if (!relativePath) {
        currentFileTagsList.innerHTML = '<li class="no-tags-info">未选择文件</li>';
        return;
    }
    try {
        const tags = await invoke('get_tags_for_file', { relativePath });
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
        currentFileTagsList.innerHTML = '<li class="no-tags-info">加载标签失败</li>';
    }
}

document.addEventListener('DOMContentLoaded', initializeSidebar);
window.refreshAllTagsList = refreshAllTagsList;
window.updateCurrentFileTagsUI = updateCurrentFileTagsUI;