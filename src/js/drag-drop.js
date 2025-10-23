// src/js/drag-drop.js
'use strict';

import { appState } from './core/AppState.js';
import { eventBus } from './core/EventBus.js';
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
        
        // ✅ 修复：绑定到 fileListContainer 而不是 fileListElement
        // 因为虚拟滚动会频繁清空 fileListElement 的内容
        const fileListContainer = document.querySelector('.file-list-container');
        this.fileListElement = document.getElementById('file-list');
        
        if (!fileListContainer || !this.fileListElement) {
            console.warn('⚠️ 拖拽元素未定义，延迟初始化');
            setTimeout(() => this.init(), 100);
            return;
        }
        
        this.dragIndicator = document.getElementById('drag-indicator');
        
        // ✅ 使用事件委托监听容器的拖拽事件
        fileListContainer.addEventListener('dragstart', (e) => this.handleDragStart(e));
        fileListContainer.addEventListener('dragend', (e) => this.handleDragEnd(e));
        fileListContainer.addEventListener('dragover', (e) => this.handleDragOver(e));
        fileListContainer.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        fileListContainer.addEventListener('drop', (e) => this.handleDrop(e));
        
        console.log('✅ 拖拽功能已初始化（绑定到 fileListContainer）');
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
        console.log('🔥 [handleDragStart] 事件触发了！', e.target);
        
        const li = e.target.closest('li');
        if (!li) {
            console.log('❌ [handleDragStart] 未找到 li 元素');
            return;
        }
        
        const path = li.dataset.path;
        const isDir = li.dataset.isDir === 'true';
        const name = li.dataset.name;
        
        console.log('📊 [handleDragStart] li 元素信息:', {
            path,
            isDir,
            name,
            draggable: li.getAttribute('draggable')
        });
        
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
        console.log('🌊 [handleDragOver] 事件触发！target:', e.target);
        
        e.preventDefault();
        e.stopPropagation();
        
        const li = e.target.closest('li');
        if (!li) {
            console.log('⚠️ [dragOver] 未找到 li 元素');
            e.dataTransfer.dropEffect = 'none';
            return;
        }
        
        const targetPath = li.dataset.path;
        const targetIsDir = li.dataset.isDir === 'true';
        
        console.log('🔍 [dragOver] 目标元素:', {
            path: targetPath,
            isDir: targetIsDir,
            dataset: li.dataset
        });
        
        // 只允许拖到文件夹上
        if (!targetIsDir) {
            console.log('❌ [dragOver] 目标不是文件夹');
            e.dataTransfer.dropEffect = 'none';
            return;
        }
        
        // 不能拖到自己或自己的子文件夹
        if (this.draggedItem && (
            targetPath === this.draggedItem.path ||
            targetPath.startsWith(this.draggedItem.path + '/')
        )) {
            console.log('❌ [dragOver] 不能拖到自己或子文件夹');
            e.dataTransfer.dropEffect = 'none';
            return;
        }
        
        console.log('✅ [dragOver] 允许放置');
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
        e.stopPropagation();
        
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
        
        // ✅ 关键修复：在清空前保存数据副本
        const draggedItemCopy = { ...this.draggedItem };
        const dropTargetCopy = { ...this.dropTarget };
        
        // 确认移动
        const confirmed = await showCustomConfirm(
            '移动文件',
            `确定要将 "${draggedItemCopy.name}" 移动到 "${dropTargetCopy.name}" 吗？`,
            '移动',
            '取消'
        );
        
        if (!confirmed) return;
        
        console.log(`📦 移动: ${draggedItemCopy.path} -> ${targetPath}`);
        
        try {
            // 调用后端移动命令
            const result = await invoke('move_item', {
                rootPath: appState.rootPath,
                sourcePath: draggedItemCopy.path,
                targetDir: targetPath
            });
            
            console.log('✅ 移动成功:', result);
            
            // ========================================
            // ✅ 改造点 1: 批量更新标签页路径
            // ========================================
            if (draggedItemCopy.isDir) {
                // 文件夹移动：批量更新所有子文件的标签页
                const oldPrefix = draggedItemCopy.path;
                const newPrefix = result.new_path;
                
                // ✅ 改为事件驱动
                eventBus.emit('tab:update-folder-paths', {
                    oldPrefix: oldPrefix,
                    newPrefix: newPrefix
                });
                
                // 清除缓存
                appState.fileTreeMap.delete(oldPrefix);
                
                // 更新展开状态
                if (appState.expandedFolders.has(oldPrefix)) {
                    appState.expandedFolders.delete(oldPrefix);
                    appState.expandedFolders.add(newPrefix);
                    
                    // ========================================
                    // ✅ 改造点 2: 保存展开状态
                    // ========================================
                    eventBus.emit('folder:state-changed');
                }
            }
            
            // 刷新源文件夹和目标文件夹
            const sourceParent = this.getParentPath(draggedItemCopy.path);
            
            // 确保目标文件夹展开
            appState.expandedFolders.add(targetPath);
            
            // ========================================
            // ✅ 改造点 3: 保存展开状态
            // ========================================
            eventBus.emit('folder:state-changed');
            
            // ✅ 发布文件移动成功事件
            eventBus.emit('file:moved', {
                oldPath: draggedItemCopy.path,
                newPath: result.new_path,
                isDir: draggedItemCopy.isDir,
                sourceParent: sourceParent,
                targetParent: targetPath
            });
            
            showSuccessMessage(`已移动到 ${dropTargetCopy.name}`);
            
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

// ES Module 导出
export {
    dragDropManager
};

console.log('✅ drag-drop.js 加载完成');