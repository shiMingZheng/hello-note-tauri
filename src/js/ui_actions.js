// src/js/ui_actions.js

'use strict';
console.log('📜 ui_actions.js 开始加载...');

let searchToggleBtn;
let searchBoxElement;
let fileViewContainer;

function initializeUiActions() {
    searchToggleBtn = document.getElementById('search-toggle-btn');
    searchBoxElement = document.getElementById('search-box');
    fileViewContainer = document.getElementById('file-view-container');

    searchToggleBtn.addEventListener('click', handleSearchToggle);
    fileViewContainer.addEventListener('click', handleReturnToFileView);
}

/**
 * 切换搜索框的显示和隐藏
 */
function handleSearchToggle() {
    const isVisible = searchBoxElement.style.display === 'block';
    if (isVisible) {
        searchBoxElement.style.display = 'none';
    } else {
        searchBoxElement.style.display = 'block';
        // 可选：当搜索框出现时，自动聚焦
        document.getElementById('search-input').focus();
    }
}

/**
 * 当用户处于标签筛选视图时，点击文件列表区域返回完整视图
 */
function handleReturnToFileView() {
    // 仅当存在标签筛选时，此点击才有效
    if (appState.activeTagFilter) {
        console.log('🖱️ 点击文件视图区域，清除标签筛选');
        handleClearTagFilter();
    }
}

// 确保在 DOM 加载后执行
document.addEventListener('DOMContentLoaded', initializeUiActions);

// 将函数暴露到全局
window.handleSearchToggle = handleSearchToggle;
window.handleReturnToFileView = handleReturnToFileView;