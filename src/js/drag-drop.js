// src/js/drag-drop.js
'use strict';

import { appState } from './core/AppState.js';
import { eventBus } from './core/EventBus.js';
import { showError, showSuccessMessage, showCustomConfirm } from './ui-utils.js';
import { invoke } from './core/TauriAPI.js';

console.log('📜 drag-drop.js 开始加载...');

class DragDropManager {
    constructor() {
        if (DragDropManager.instance) {
            return DragDropManager.instance;
        }
        
        this.draggedItem = null;
        this.dropTarget = null;
        this.isDragging = false;
        this.dragGhost = null; // 拖拽时的视觉反馈元素
        this.startX = 0;
        this.startY = 0;
        
        DragDropManager.instance = this;
    }
    
    init() {
        console.log('🎯 初始化拖拽功能（模拟模式）...');
        
        const fileListContainer = document.querySelector('.file-list-container');
        
        if (!fileListContainer) {
            console.warn('⚠️ 拖拽元素未定义，延迟初始化');
            setTimeout(() => this.init(), 100);
            return;
        }
        
        // 使用 mousedown/mousemove/mouseup 模拟拖拽
        fileListContainer.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        
        console.log('✅ 拖拽功能已初始化（模拟模式）');
    }
    
    makeDraggable(li, item) {
        li.classList.add('draggable-item');
        li.style.cursor = 'grab';
    }
    
    handleMouseDown(e) {
        // 只响应左键
        if (e.button !== 0) return;
        
        const li = e.target.closest('li.draggable-item');
        if (!li) return;
        
        // 如果点击的是输入框，不启动拖拽
        if (e.target.closest('.rename-input')) return;
        
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.potentialDragItem = {
            element: li,
            path: li.dataset.path,
            isDir: li.dataset.isDir === 'true',
            name: li.dataset.name
        };
        
        console.log('🖱️ 鼠标按下:', this.potentialDragItem.name);
    }
    
    handleMouseMove(e) {
        if (!this.potentialDragItem && !this.isDragging) return;
        
        const deltaX = Math.abs(e.clientX - this.startX);
        const deltaY = Math.abs(e.clientY - this.startY);
        
        // 移动超过 5px 才开始拖拽（避免误触）
        if (!this.isDragging && (deltaX > 5 || deltaY > 5)) {
            this.startDrag(e);
        }
        
        if (this.isDragging) {
            this.updateDrag(e);
        }
    }
    
    startDrag(e) {
        if (!this.potentialDragItem) return;
        
        this.isDragging = true;
        this.draggedItem = this.potentialDragItem;
        this.potentialDragItem = null;
        
        // 创建拖拽幽灵元素
        this.dragGhost = this.draggedItem.element.cloneNode(true);
        this.dragGhost.style.position = 'fixed';
        this.dragGhost.style.pointerEvents = 'none';
        this.dragGhost.style.opacity = '0.7';
        this.dragGhost.style.zIndex = '10000';
        this.dragGhost.style.backgroundColor = 'var(--bg-primary)';
        this.dragGhost.style.border = '2px solid var(--primary-color)';
        this.dragGhost.style.borderRadius = '4px';
        this.dragGhost.style.width = this.draggedItem.element.offsetWidth + 'px';
        document.body.appendChild(this.dragGhost);
        
        // 原始元素添加样式
        this.draggedItem.element.style.opacity = '0.4';
        document.body.style.cursor = 'grabbing';
        
        console.log('🎯 开始拖拽:', this.draggedItem.name);
    }
    
    updateDrag(e) {
		if (!this.dragGhost) return;
		
		// 更新幽灵元素位置
		this.dragGhost.style.left = (e.clientX + 10) + 'px';
		this.dragGhost.style.top = (e.clientY + 10) + 'px';
		
		// 检测鼠标下的目标元素
		this.dragGhost.style.pointerEvents = 'none';
		const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
		
		const targetLi = elementBelow?.closest('li');
		
		// ✅ 添加调试日志
		if (targetLi) {
			console.log('🎯 鼠标下的元素:', {
				name: targetLi.dataset.name,
				isDir: targetLi.dataset.isDir,
				path: targetLi.dataset.path
			});
		}
		
		// 清除之前的高亮
		document.querySelectorAll('.drag-over').forEach(el => {
			el.classList.remove('drag-over');
		});
		
		if (targetLi && targetLi.dataset.isDir === 'true') {
			const targetPath = targetLi.dataset.path;
			
			// 检查是否可以放置
			if (this.canDropOn(targetPath)) {
				targetLi.classList.add('drag-over');
				this.dropTarget = {
					element: targetLi,
					path: targetPath,
					name: targetLi.dataset.name
				};
				console.log('✅ 可以放置到:', this.dropTarget.name);
				this.dragGhost.style.cursor = 'copy';
			} else {
				console.log('❌ 不能放置到:', targetPath);
				this.dropTarget = null;
				this.dragGhost.style.cursor = 'not-allowed';
			}
		} else {
			this.dropTarget = null;
		}
	}
    
    canDropOn(targetPath) {
        if (!this.draggedItem) return false;
        
        // 不能拖到自己
        if (targetPath === this.draggedItem.path) return false;
        
        // 不能拖到自己的子文件夹
        if (targetPath.startsWith(this.draggedItem.path + '/')) return false;
        
        return true;
    }
    
    async handleMouseUp(e) {
        if (this.isDragging) {
            await this.endDrag();
        } else {
            this.potentialDragItem = null;
        }
    }
    
    async endDrag() {
		// ✅ 防止重复调用
		if (!this.isDragging) {
			console.log('⏭️ 已经结束拖拽，跳过');
			return;
		}
		
		console.log('🏁 结束拖拽');
		console.log('📊 拖拽状态:', {
			isDragging: this.isDragging,
			draggedItem: this.draggedItem?.name,
			dropTarget: this.dropTarget?.name
		});
		
		// ✅ 立即设置为 false，防止重复调用
		this.isDragging = false;
		
		// ✅ 先保存状态副本
		const dropTargetCopy = this.dropTarget;
		const draggedItemCopy = this.draggedItem;
		
		// 清理视觉效果（立即清理，不影响对话框）
		if (this.dragGhost) {
			this.dragGhost.remove();
			this.dragGhost = null;
		}
		
		if (draggedItemCopy?.element) {
			draggedItemCopy.element.style.opacity = '';
		}
		
		document.querySelectorAll('.drag-over').forEach(el => {
			el.classList.remove('drag-over');
		});
		
		document.body.style.cursor = '';
		
		// 执行放置操作（异步，但不会再被打断）
		if (dropTargetCopy && draggedItemCopy) {
			console.log('✅ 执行放置操作...');
			// ✅ 使用保存的副本
			await this.performDropWithData(draggedItemCopy, dropTargetCopy);
		} else {
			console.log('⚠️ 无法放置:', {
				hasDropTarget: !!dropTargetCopy,
				hasDraggedItem: !!draggedItemCopy
			});
		}
		
		// 最后清空状态
		this.draggedItem = null;
		this.dropTarget = null;
	}
    
    async performDropWithData(draggedItem, dropTarget) {
		const confirmed = await showCustomConfirm(
			'移动文件',
			`确定要将 "${draggedItem.name}" 移动到 "${dropTarget.name}" 吗？`,
			'移动',
			'取消'
		);
		
		if (!confirmed) {
			console.log('❌ 用户取消了移动操作');
			return;
		}
		
		console.log(`📦 移动: ${draggedItem.path} -> ${dropTarget.path}`);
		
		try {
			const result = await invoke('move_item', {
				rootPath: appState.rootPath,
				sourcePath: draggedItem.path,
				targetDir: dropTarget.path
			});
			
			console.log('✅ 移动成功:', result);
			
			// 更新标签页路径
			if (draggedItem.isDir) {
				const oldPrefix = draggedItem.path;
				const newPrefix = result.new_path;
				
				eventBus.emit('tab:update-folder-paths', {
					oldPrefix: oldPrefix,
					newPrefix: newPrefix
				});
				
				appState.fileTreeMap.delete(oldPrefix);
				
				if (appState.expandedFolders.has(oldPrefix)) {
					appState.expandedFolders.delete(oldPrefix);
					appState.expandedFolders.add(newPrefix);
					eventBus.emit('folder:state-changed');
				}
			}
			
			const sourceParent = this.getParentPath(draggedItem.path);
			appState.expandedFolders.add(dropTarget.path);
			eventBus.emit('folder:state-changed');
			
			eventBus.emit('file:moved', {
				oldPath: draggedItem.path,
				newPath: result.new_path,
				isDir: draggedItem.isDir,
				sourceParent: sourceParent,
				targetParent: dropTarget.path
			});
			
			showSuccessMessage(`已移动到 ${dropTarget.name}`);
			
		} catch (error) {
			console.error('❌ 移动失败:', error);
			showError('移动失败: ' + error);
		}
	}
    
    getParentPath(path) {
        const separator = path.includes('\\') ? '\\' : '/';
        const lastIndex = path.lastIndexOf(separator);
        return lastIndex > 0 ? path.substring(0, lastIndex) : '';
    }
}

const dragDropManager = new DragDropManager();

export { dragDropManager };

console.log('✅ drag-drop.js 加载完成');