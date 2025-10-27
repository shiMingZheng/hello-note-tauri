// src/js/context-menu.js
// 右键菜单独立模块

'use strict';

import { appState } from './core/AppState.js';
import { domElements } from './dom-init.js';
import { invoke } from './core/TauriAPI.js'; // ⭐ 引入 invoke

console.log('📜 context-menu.js 开始加载...');

/**
 * 右键菜单管理器类
 */
class ContextMenuManager {
    constructor() {
        if (ContextMenuManager.instance) {
            return ContextMenuManager.instance;
        }
		// ⭐ 新增：缓存收藏状态查询结果
        this.favoriteStatusCache = new Map();
        this.statusQueryTimeout = null;
        
        ContextMenuManager.instance = this;
    }
    
    /**
     * 初始化右键菜单
     */
    init() {
        console.log('🎯 初始化右键菜单模块...');
        
        // 绑定全局点击事件，点击其他地方隐藏菜单
        document.addEventListener('click', (e) => {
            // ⭐ 修正：确保 domElements.contextMenu 存在
            if (domElements.contextMenu && !domElements.contextMenu.contains(e.target)) {
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
		// ⭐ 新增：绑定收藏/取消收藏按钮事件
        if (domElements.favoriteNoteBtn) {
            domElements.favoriteNoteBtn.addEventListener('click', () => {
                this.hide();
                window.eventBus?.emit('context-menu:favorite-note', appState.contextTarget);
            });
        }

        if (domElements.unfavoriteNoteBtn) {
            domElements.unfavoriteNoteBtn.addEventListener('click', () => {
                this.hide();
                window.eventBus?.emit('context-menu:unfavorite-note', appState.contextTarget);
            });
        }
    }
    
    /**
     * 显示右键菜单
     * @param {MouseEvent} event - 鼠标事件
     * @param {Object} fileItem - 文件项信息 { path, is_dir, name, from }
     */
    /**
     * 显示右键菜单
     * @param {MouseEvent} event - 鼠标事件
     * @param {Object} fileItem - 文件项信息 { path, is_dir, name, from }
     */
    async show(event, fileItem) { // ⭐ 改为 async
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

         // --- ⭐ 新增：异步查询收藏状态 ---
         let isFavorite = false;
         if (!fileItem.is_dir && fileItem.path) { // 仅对文件查询
             // 尝试从缓存获取
             if (this.favoriteStatusCache.has(fileItem.path)) {
                 isFavorite = this.favoriteStatusCache.get(fileItem.path);
                 console.log(`⭐ 从缓存获取收藏状态: ${fileItem.path} -> ${isFavorite}`);
             } else {
                 try {
                     console.log(`⭐ 查询收藏状态: ${fileItem.path}`);
                     isFavorite = await invoke('get_note_favorite_status', { relativePath: fileItem.path });
                     this.favoriteStatusCache.set(fileItem.path, isFavorite); // 存入缓存
                     console.log(`  -> 状态: ${isFavorite}`);
                     // 设置定时器清除缓存
                     clearTimeout(this.statusQueryTimeout);
                     this.statusQueryTimeout = setTimeout(() => {
                         this.favoriteStatusCache.clear();
                         console.log('⏲️ 清除收藏状态缓存');
                     }, 5 * 60 * 1000); // 5分钟后清除
                 } catch (error) {
                     console.error('❌ 查询收藏状态失败:', error);
                     // 查询失败，按未收藏处理
                     isFavorite = false;
                 }
             }
         }
        // ---------------------------------

        // 设置菜单位置
        domElements.contextMenu.style.left = event.pageX + 'px';
        domElements.contextMenu.style.top = event.pageY + 'px';
        domElements.contextMenu.classList.add('visible');

        // 根据不同情况显示/隐藏菜单项
        this.updateMenuItems(fileItem, isFavorite); // ⭐ 传递 isFavorite

        console.log('📋 显示右键菜单:', fileItem, `收藏状态: ${isFavorite}`);
    }
    
    /**
     * 更新菜单项显示状态
     */
    /**
     * 更新菜单项显示状态
     * @param {Object} fileItem - 文件信息
     * @param {boolean} isFavorite - 文件是否已收藏 (仅文件有效)
     */
    updateMenuItems(fileItem, isFavorite) {
        // 默认隐藏所有可选项
        if (domElements.newNoteBtn) domElements.newNoteBtn.style.display = 'none';
        if (domElements.newFolderBtn) domElements.newFolderBtn.style.display = 'none';
        if (domElements.deleteFileBtn) domElements.deleteFileBtn.style.display = 'block'; // 删除通常都显示
        if (domElements.renameItemBtn) domElements.renameItemBtn.style.display = 'block'; // 重命名通常都显示
        if (domElements.pinNoteBtn) domElements.pinNoteBtn.style.display = 'none';
        if (domElements.unpinNoteBtn) domElements.unpinNoteBtn.style.display = 'none';
        // ⭐ 新增：收藏按钮默认隐藏
        if (domElements.favoriteNoteBtn) domElements.favoriteNoteBtn.style.display = 'none';
        if (domElements.unfavoriteNoteBtn) domElements.unfavoriteNoteBtn.style.display = 'none';


        // 根据来源和类型显示菜单项
        if (fileItem.from === 'pinned-section') {
            // 置顶区域的笔记（通常也是普通文件）
            if (domElements.unpinNoteBtn) domElements.unpinNoteBtn.style.display = 'block';
            // ⭐ 在置顶区也可以收藏/取消收藏
            if (!fileItem.is_dir) {
                if (isFavorite && domElements.unfavoriteNoteBtn) {
                    domElements.unfavoriteNoteBtn.style.display = 'block';
                } else if (!isFavorite && domElements.favoriteNoteBtn) {
                    domElements.favoriteNoteBtn.style.display = 'block';
                }
            }
        } else if (fileItem.from === 'favorites-section') { // ⭐ 新增：收藏区域
             if (domElements.unfavoriteNoteBtn) domElements.unfavoriteNoteBtn.style.display = 'block';
             // 在收藏区也可以置顶/取消置顶 (假设置顶状态未知，先都显示)
             // 更好的做法是也查询置顶状态
             if (domElements.pinNoteBtn) domElements.pinNoteBtn.style.display = 'block';

        } else if (fileItem.is_dir) {
            // 文件夹 (来自 file-list)
            if (domElements.newNoteBtn) domElements.newNoteBtn.style.display = 'block';
            if (domElements.newFolderBtn) domElements.newFolderBtn.style.display = 'block';
            // 文件夹不能置顶或收藏
        } else {
            // 普通文件 (来自 file-list)
            if (domElements.pinNoteBtn) domElements.pinNoteBtn.style.display = 'block'; // 假设默认显示置顶
            // ⭐ 根据查询到的收藏状态显示对应按钮
            if (isFavorite && domElements.unfavoriteNoteBtn) {
                 domElements.unfavoriteNoteBtn.style.display = 'block';
            } else if (!isFavorite && domElements.favoriteNoteBtn) {
                domElements.favoriteNoteBtn.style.display = 'block';
            }
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
