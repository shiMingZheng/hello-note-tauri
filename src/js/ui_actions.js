// src/js/ui_actions.js
'use strict';

import { appState } from './core/AppState.js';
import { sidebar } from './sidebar.js';

console.log('📜 ui_actions.js 开始加载...');

class UIActions {
    constructor() {
        if (UIActions.instance) {
            return UIActions.instance;
        }
        
        this.fileViewContainer = null;
        
        UIActions.instance = this;
    }
    
    /**
     * 初始化 UI 交互
     */
    init() {
        this.fileViewContainer = document.getElementById('file-view-container');
        
        if (this.fileViewContainer) {
            this.fileViewContainer.addEventListener('click', () => this.handleReturnToFileView());
        } else {
            console.warn('⚠️ 未找到 file-view-container 元素');
        }
        
        console.log('✅ UI 交互模块初始化完成');
    }
    
    /**
     * 点击文件列表区域返回完整视图
     * 当用户处于标签筛选视图时有效
     */
    handleReturnToFileView() {
        if (appState.activeTagFilter) {
            console.log('🖱️ 点击文件视图区域，清除标签筛选');
            sidebar.handleClearTagFilter();
        }
    }
}

// 创建单例
const uiActions = new UIActions();


// ES Module 导出
export {
    uiActions
};

console.log('✅ ui_actions.js 加载完成');