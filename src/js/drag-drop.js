// src/js/drag-drop.js
'use strict';

import { appState } from './core/AppState.js';
import { showError, showSuccessMessage, showCustomConfirm } from './ui-utils.js';

console.log('📜 drag-drop.js 开始加载...');

const { invoke } = window.__TAURI__.core;

class DragDropManager {
    constructor() {
        if (DragDropManager.instance) {
            return DragDropManager.instance;
        }
        
        this.dragIndicator = null;
        this.draggedItem = null;
        this.dropTarget = null;
        this.fileListElement = null;
        
        DragDropManager.instance = this;
    }
    
    /**
     * 初始化拖拽功能
     */
    init() {
        console.log('🎯 初始化拖拽功能...');
        
        this.fileListElement = document.getElementById('file-list');
        
        if (!this.fileListElement) {
            console.warn('⚠️ fileListElement 未定义，延迟初始化');
            setTimeout(() => this.init(), 100);
            return;
        }
        
        this.dragIndicator = document.getElementById('drag-indicator');
        
        // 使用事件委托监听文件列表的拖拽事件
        this.fileListElement.addEventListener('dragstart', (e) => this.handleDragStart(e));
        this.fileListElement.addEventListener('dragend', (e) => this.handleDragEnd(e));
        this.fileListElement.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.fileListElement.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.fileListElement.addEventListener('drop', (e) => this.handleDrop(e));
        
        console.log('✅ 拖拽功能已初始化');
    }
    
    /**
     * 为文件树项目添加可拖拽属性
     * 在 virtual-scroll.js 的 createFileTreeItem 中调用
     */
    makeDraggable(li, item) {
        li.setAttribute('draggable', 'true');
        li.classList.add('draggable-item');
    }
    
    /**
     * 拖拽开始
     */
    handleDragStart(e) {
        const li = e.target.closest('li');
        if (!li) return;
        
        const path = li.dataset.path;
        const isDir = li.dataset.isDir === 'true';
        const name = li.dataset.name;
        
        this.draggedItem = { path, isDir, name };
        
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', path);
        
        li.classList.add('dragging');
        
        console.log(`🎯 开始拖拽: ${name} (${isDir ? '文件夹' : '文件'})`);
    }
    
    /**
     * 拖拽结束
     */
    handleDragEnd(e) {
        const li = e.target.closest('li');
        if (li) {
            li.classList.remove('dragging');
        }
        
        // 清除所有拖拽状态
        document.querySelectorAll('.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        
        if (this.dragIndicator) {
            this.dragIndicator.style.display = 'none';
        }
        
        this.draggedItem = null;
        this.dropTarget = null;
        
        console.log('✅ 拖拽结束');
    }
    
    /**
     * 拖拽经过
     */
    handleDragOver(e) {
        e.preventDefault();
        
        const li = e.target.closest('li');
        if (!li) return;
        
        const targetPath = li.dataset.path;
        const targetIsDir = li.dataset.isDir === 'true';
        
        // 只允许拖到文件夹上
        if (!targetIsDir) {
            e.dataTransfer.dropEffect = 'none';
            return;
        }
        
        // 不能拖到自己或自己的子文件夹
        if (this.draggedItem && (
            targetPath === this.draggedItem.path ||
            targetPath.startsWith(this.draggedItem.path + '/')
        )) {
            e.dataTransfer.dropEffect = 'none';
            return;
        }
        
        e.dataTransfer.dropEffect = 'move';
        
        // 高亮目标文件夹
        document.querySelectorAll('.drag-over').forEach(el => {
            el.classList.remove('drag-over');
        });
        li.classList.add('drag-over');
        
        this.dropTarget = { path: targetPath, name: li.dataset.name };
    }
    
    /**
     * 拖拽离开
     */
    handleDragLeave(e) {
        const li = e.target.closest('li');
        if (li) {
            li.classList.remove('drag-over');
        }
    }
    
    /**
     * 放下
     */
    async handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const li = e.target.closest('li');
        if (!li) return;
        
        const targetPath = li.dataset.path;
        const targetIsDir = li.dataset.isDir === 'true';
        
        // 移除高亮
        li.classList.remove('drag-over');
        
        if (!targetIsDir || !this.draggedItem) {
            return;
        }
        
        // 不能移动到自己或自己的子文件夹
        if (targetPath === this.draggedItem.path || 
            targetPath.startsWith(this.draggedItem.path + '/')) {
            showError('不能移动到自己或子文件夹中');
            return;
        }
        
        // 确认移动
        const confirmed = await showCustomConfirm(
            '移动文件',
            `确定要将 "${this.draggedItem.name}" 移动到 "${this.dropTarget.name}" 吗？`,
            '移动',
            '取消'
        );
        
        if (!confirmed) return;
        
        console.log(`📦 移动: ${this.draggedItem.path} -> ${targetPath}`);
        
        try {
            // 调用后端移动命令
            const result = await invoke('move_item', {
                rootPath: appState.rootPath,
                sourcePath: this.draggedItem.path,
                targetDir: targetPath
            });
            
            console.log('✅ 移动成功:', result);
            
            // 更新标签页路径
            if (this.draggedItem.isDir) {
                // 文件夹移动：批量更新所有子文件的标签页
                const oldPrefix = this.draggedItem.path;
                const newPrefix = result.new_path;
                
                if (window.tabManager && window.tabManager.updatePathsForRenamedFolder) {
                    window.tabManager.updatePathsForRenamedFolder(oldPrefix, newPrefix);
                }
                
                // 清除缓存
                appState.fileTreeMap.delete(oldPrefix);
                
                // 更新展开状态
                if (appState.expandedFolders.has(oldPrefix)) {
                    appState.expandedFolders.delete(oldPrefix);
                    appState.expandedFolders.add(newPrefix);
                    if (window.saveExpandedFolders) {
                        window.saveExpandedFolders();
                    }
                }
                
            } else {
                // 文件移动：更新标签页
                if (window.tabManager) {
                    window.tabManager.openTabs.forEach(tab => {
                        if (tab.path === this.draggedItem.path) {
                            window.tabManager.updateTabId(this.draggedItem.path, result.new_path);
                        }
                    });
                }
            }
            
            // 刷新源文件夹和目标文件夹
            const sourceParent = this.getParentPath(this.draggedItem.path);
            
            if (window.refreshFileTree) {
                await window.refreshFileTree(sourceParent);
                
                if (targetPath !== sourceParent) {
                    await window.refreshFileTree(targetPath);
                }
            }
            
            // 确保目标文件夹展开
            appState.expandedFolders.add(targetPath);
            if (window.saveExpandedFolders) {
                window.saveExpandedFolders();
            }
            
            showSuccessMessage(`已移动到 ${this.dropTarget.name}`);
            
            // 更新虚拟滚动
            if (window.updateVirtualScrollData) {
                window.updateVirtualScrollData();
            }
            
        } catch (error) {
            console.error('❌ 移动失败:', error);
            showError('移动失败: ' + error);
        }
    }
    
    /**
     * 获取父路径
     */
    getParentPath(path) {
        const separator = path.includes('\\') ? '\\' : '/';
        const lastIndex = path.lastIndexOf(separator);
        return lastIndex > 0 ? path.substring(0, lastIndex) : '';
    }
}

// 创建单例
const dragDropManager = new DragDropManager();


// 导出函数供其他模块使用（向后兼容）
window.makeDraggable = (li, item) => dragDropManager.makeDraggable(li, item);
window.getParentPath = (path) => dragDropManager.getParentPath(path);

// ES Module 导出
export {
    dragDropManager
};

console.log('✅ drag-drop.js 加载完成');