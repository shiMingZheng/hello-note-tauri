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
		this.wasOverEditor = false;
        
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
        
		// ✅ 监听编辑器的拖放（用于插入链接）
		this.initEditorDrop();
    
        console.log('✅ 拖拽功能已初始化（模拟模式）');
    }

	/**
	* 初始化编辑器拖放功能（用于插入链接）
	*/
	initEditorDrop() {
		// ⭐ 改造：获取 CodeMirror 容器
		const editorContainer = document.getElementById('codemirror-editor');
		
		if (!editorContainer) {
			console.warn('⚠️ 编辑器容器未找到，延迟初始化拖放功能');
			setTimeout(() => this.initEditorDrop(), 500);
			return;
		}
		
		// 阻止编辑器的默认拖放行为
		editorContainer.addEventListener('dragover', (e) => {
			e.preventDefault();
			e.stopPropagation();
			
			// 如果正在从文件列表拖拽
			if (this.isDragging && this.draggedItem) {
				e.dataTransfer.dropEffect = 'link';
				editorContainer.style.outline = '2px dashed var(--primary-color)';
			}
		});
		
		editorContainer.addEventListener('dragleave', (e) => {
			editorContainer.style.outline = '';
		});
		
		editorContainer.addEventListener('drop', (e) => {
			e.preventDefault();
			e.stopPropagation();
			editorContainer.style.outline = '';
			
			// 如果正在从文件列表拖拽
			if (this.isDragging && this.draggedItem) {
				this.insertWikilinkToEditor(this.draggedItem);
			}
		});
		
		console.log('✅ 编辑器拖放功能已初始化');
	}
	
	/**
	* 在编辑器中插入 Wikilink
	*/
	async insertWikilinkToEditor(draggedItem) {
		console.log('📝 插入 Wikilink:', draggedItem.name);
		
		if (draggedItem.isDir) {
			showError('不能链接文件夹');
			return;
		}
		
		if (!draggedItem.path.endsWith('.md')) {
			showError('只能链接 Markdown 文件');
			return;
		}
		
		const fileName = draggedItem.name.replace(/\.md$/, '');
		const wikilink = `[[${fileName}]]`;
		
		// 通过事件总线通知编辑器插入文本
		eventBus.emit('editor:insert-text', wikilink);
		
		console.log('✅ 已插入 Wikilink:', wikilink);
	}
    
    makeDraggable(li, item) {
        li.classList.add('draggable-item');
        li.style.cursor = 'grab';
    }
    
    handleMouseDown(e) {
        if (e.button !== 0) return;
        
        const li = e.target.closest('li.draggable-item');
        if (!li) return;
        
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
		window.lastMouseMoveEvent = e;
		
		if (!this.potentialDragItem && !this.isDragging) return;
		
		const deltaX = Math.abs(e.clientX - this.startX);
		const deltaY = Math.abs(e.clientY - this.startY);
		
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
        
        this.draggedItem.element.style.opacity = '0.4';
        document.body.style.cursor = 'grabbing';
        
        console.log('🎯 开始拖拽:', this.draggedItem.name);
    }
    
    updateDrag(e) {
		if (!this.dragGhost) return;
		
		this.dragGhost.style.left = (e.clientX + 10) + 'px';
		this.dragGhost.style.top = (e.clientY + 10) + 'px';
		
		this.dragGhost.style.pointerEvents = 'none';
		const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
		
		// ⭐ 改造：检查 CodeMirror 容器
		const editorContainer = document.getElementById('codemirror-editor');
		const isOverEditor = editorContainer?.contains(elementBelow);
		
		if (isOverEditor) {
			document.querySelectorAll('.drag-over').forEach(el => {
				el.classList.remove('drag-over');
			});
			
			editorContainer.style.outline = '2px dashed var(--primary-color)';
			editorContainer.style.outlineOffset = '-2px';
			
			this.dropTarget = null;
			this.dragGhost.style.cursor = 'copy';
			
			if (!this.wasOverEditor) {
				console.log('📝 进入编辑器区域');
				this.wasOverEditor = true;
			}
			return;
		}
		
		if (this.wasOverEditor) {
            // ⭐ 改造：确保 editorContainer 存在
            if (editorContainer) {
			    editorContainer.style.outline = '';
            }
			console.log('📝 离开编辑器区域');
			this.wasOverEditor = false;
		}
		
		const targetLi = elementBelow?.closest('li');
		
		document.querySelectorAll('.drag-over').forEach(el => {
			el.classList.remove('drag-over');
		});
		
		if (targetLi && targetLi.dataset.isDir === 'true') {
			const targetPath = targetLi.dataset.path;
			
			if (this.canDropOn(targetPath)) {
				targetLi.classList.add('drag-over');
				this.dropTarget = {
					element: targetLi,
					path: targetPath,
					name: targetLi.dataset.name
				};
				this.dragGhost.style.cursor = 'move';
			} else {
				this.dropTarget = null;
				this.dragGhost.style.cursor = 'not-allowed';
			}
		} else {
			this.dropTarget = null;
		}
	}
    
    canDropOn(targetPath) {
        if (!this.draggedItem) return false;
        if (targetPath === this.draggedItem.path) return false;
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
		if (!this.isDragging) {
			console.log('⏭️ 已经结束拖拽，跳过');
			return;
		}
		
		console.log('🏁 结束拖拽');
		
		this.isDragging = false;
		
		const dropTargetCopy = this.dropTarget;
		const draggedItemCopy = this.draggedItem;
		
		const lastMouseEvent = window.lastMouseMoveEvent;
		let isOverEditor = false;
		
		if (lastMouseEvent) {
            // ⭐ 改造：检查 CodeMirror 容器
			const editorContainer = document.getElementById('codemirror-editor');
			const elementAtMouse = document.elementFromPoint(
				lastMouseEvent.clientX, 
				lastMouseEvent.clientY
			);
			isOverEditor = editorContainer?.contains(elementAtMouse);
		}
		
		console.log('🎯 结束位置检测:', {
			isOverEditor,
			hasDropTarget: !!dropTargetCopy
		});
		
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
		
		// ⭐ 改造：清除 CodeMirror 容器高亮
		const editorContainer = document.getElementById('codemirror-editor');
		if (editorContainer) {
			editorContainer.style.outline = '';
		}
		
		document.body.style.cursor = '';
		
		if (isOverEditor && draggedItemCopy) {
			console.log('✅ 插入 Wikilink 到编辑器');
			await this.insertWikilinkToEditor(draggedItemCopy);
		} else if (dropTargetCopy && draggedItemCopy) {
			console.log('✅ 执行文件移动操作');
			await this.performDropWithData(draggedItemCopy, dropTargetCopy);
		} else {
			console.log('⚠️ 无操作:', {
				isOverEditor,
				hasDropTarget: !!dropTargetCopy,
				hasDraggedItem: !!draggedItemCopy
			});
		}
		
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