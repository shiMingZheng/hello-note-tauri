// src/js/ui_actions.js

'use strict';
console.log('📜 ui_actions.js 开始加载...');

let fileViewContainer;

function initializeUiActions() {
    fileViewContainer = document.getElementById('file-view-container');
    
    if (fileViewContainer) {
        fileViewContainer.addEventListener('click', handleReturnToFileView);
    } else {
        console.warn('⚠️ 未找到 file-view-container 元素');
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
window.handleReturnToFileView = handleReturnToFileView;