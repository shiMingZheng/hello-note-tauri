// src/js/context-menu.js
// 右键菜单独立模块

'use strict';

import { appState } from './core/AppState.js';
import { domElements } from './dom-init.js';

console.log('📜 context-menu.js 开始加载...');

/**
 * 右键菜单管理器类
 */
class ContextMenuManager {
    constructor() {
        if (ContextMenuManager.instance) {
            return ContextMenuManager.instance;
        }
        
        ContextMenuManager.instance = this;
    }
    
    /**
     * 初始化右键菜单
     */
    init() {
        console.log('🎯 初始化右键菜单模块...');
        
        // 绑定全局点击事件，点击其他地方隐藏菜单
        document.addEventListener('click', (e) => {
            if (!domElements.contextMenu?.contains(e.target)) {
                this.hide();
            }
        });
        
        // 绑定菜单项事件
        this.bindMenuEvents();
        
        console.log('✅ 右键菜单模块初始化完成');
    }
    
    /**
     * 绑定菜单项事件
     */
    bindMenuEvents() {
        // 这些事件处理器会触发事件总线，由 file-manager 处理
        if (domElements.newNoteBtn) {
            domElements.newNoteBtn.addEventListener('click', () => {
                this.hide();
                window.eventBus?.emit('context-menu:create-note', appState.contextTarget);
            });
        }
        
        if (domElements.newFolderBtn) {
            domElements.newFolderBtn.addEventListener('click', () => {
                this.hide();
                window.eventBus?.emit('context-menu:create-folder', appState.contextTarget);
            });
        }
        
        if (domElements.deleteFileBtn) {
            domElements.deleteFileBtn.addEventListener('click', () => {
                this.hide();
                window.eventBus?.emit('context-menu:delete-item', appState.contextTarget);
            });
        }
        
        if (domElements.renameItemBtn) {
            domElements.renameItemBtn.addEventListener('click', () => {
                this.hide();
                window.eventBus?.emit('context-menu:rename-item', appState.contextTarget);
            });
        }
        
        if (domElements.pinNoteBtn) {
            domElements.pinNoteBtn.addEventListener('click', () => {
                this.hide();
                window.eventBus?.emit('context-menu:pin-note', appState.contextTarget);
            });
        }
        
        if (domElements.unpinNoteBtn) {
            domElements.unpinNoteBtn.addEventListener('click', () => {
                this.hide();
                window.eventBus?.emit('context-menu:unpin-note', appState.contextTarget);
            });
        }
    }
    
    /**
     * 显示右键菜单
     * @param {MouseEvent} event - 鼠标事件
     * @param {Object} fileItem - 文件项信息 { path, is_dir, name, from }
     */
    show(event, fileItem) {
        event.preventDefault();
        event.stopPropagation();
        
        if (!domElements.contextMenu) return;
        
        // 保存上下文目标
        appState.contextTarget = {
            path: fileItem.path,
            is_dir: fileItem.is_dir,
            name: fileItem.name,
            from: fileItem.from || 'file-list'
        };
        
        // 设置菜单位置
        domElements.contextMenu.style.left = event.pageX + 'px';
        domElements.contextMenu.style.top = event.pageY + 'px';
        domElements.contextMenu.classList.add('visible');
        
        // 根据不同情况显示/隐藏菜单项
        this.updateMenuItems(fileItem);
        
        console.log('📋 显示右键菜单:', fileItem);
    }
    
    /**
     * 更新菜单项显示状态
     */
    updateMenuItems(fileItem) {
        // 默认隐藏所有可选项
        if (domElements.newNoteBtn) domElements.newNoteBtn.style.display = 'none';
        if (domElements.newFolderBtn) domElements.newFolderBtn.style.display = 'none';
        if (domElements.deleteFileBtn) domElements.deleteFileBtn.style.display = 'none';
        if (domElements.renameItemBtn) domElements.renameItemBtn.style.display = 'block';
        if (domElements.pinNoteBtn) domElements.pinNoteBtn.style.display = 'none';
        if (domElements.unpinNoteBtn) domElements.unpinNoteBtn.style.display = 'none';
        
        // 根据来源和类型显示菜单项
        if (fileItem.from === 'pinned-section') {
            // 置顶区域的笔记
            if (domElements.unpinNoteBtn) domElements.unpinNoteBtn.style.display = 'block';
        } else if (fileItem.is_dir) {
            // 文件夹
            if (domElements.newNoteBtn) domElements.newNoteBtn.style.display = 'block';
            if (domElements.newFolderBtn) domElements.newFolderBtn.style.display = 'block';
            if (domElements.deleteFileBtn) domElements.deleteFileBtn.style.display = 'block';
        } else {
            // 普通文件
            if (domElements.pinNoteBtn) domElements.pinNoteBtn.style.display = 'block';
            if (domElements.deleteFileBtn) domElements.deleteFileBtn.style.display = 'block';
        }
    }
    
    /**
     * 隐藏右键菜单
     */
    hide() {
        if (domElements.contextMenu) {
            domElements.contextMenu.classList.remove('visible');
        }
    }
}

// 创建单例
const contextMenuManager = new ContextMenuManager();

// ES Module 导出
export {
    contextMenuManager
};

// 导出便捷函数
export const showContextMenu = (event, fileItem) => contextMenuManager.show(event, fileItem);
export const hideContextMenu = () => contextMenuManager.hide();

console.log('✅ context-menu.js 加载完成');
