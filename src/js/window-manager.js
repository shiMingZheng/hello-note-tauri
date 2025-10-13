// 新文件：src/js/window-manager.js
// CheetahNote - 窗口状态管理与资源优化

'use strict';
console.log('📜 window-manager.js 开始加载...');

const { getCurrentWindow } = window.__TAURI__.window;

/**
 * 窗口管理器
 * 负责监听窗口状态变化，自动释放/恢复资源
 */
class WindowManager {
    constructor() {
        this.isMinimized = false;
        this.resourcesReleased = false;
        this.savedState = null; // 保存释放前的状态
        this.currentWindow = null;
    }

    /**
     * 初始化窗口监听器
     */
    async init() {
        try {
            this.currentWindow = getCurrentWindow();
            
            // 监听窗口最小化事件
            await this.currentWindow.listen('tauri://blur', async () => {
                console.log('🔽 窗口失去焦点');
                // 延迟 5 秒后检查是否仍然最小化
                setTimeout(() => this.checkAndReleaseResources(), 5000);
            });
            
            // 监听窗口恢复事件
            await this.currentWindow.listen('tauri://focus', async () => {
                console.log('🔼 窗口获得焦点');
                await this.restoreResources();
            });
            
            console.log('✅ 窗口状态监听器已启动');
        } catch (error) {
            console.error('❌ 初始化窗口监听器失败:', error);
        }
    }

    /**
     * 检查并释放资源
     */
    async checkAndReleaseResources() {
        // 检查窗口是否仍然最小化
        const isMinimized = await this.currentWindow.isMinimized();
        
        if (isMinimized && !this.resourcesReleased) {
            console.log('💤 窗口已最小化，开始释放资源...');
            await this.releaseResources();
        }
    }

    /**
     * 释放所有非必要资源
     */

	async releaseResources() {
		if (this.resourcesReleased) {
			console.log('⚠️ 资源已释放，跳过');
			return;
		}
	
		const startTime = performance.now();
		console.log('🧹 开始释放资源...');
	
		// 1. 保存当前状态（更完整）
		this.savedState = {
			activeFilePath: window.appState?.activeFilePath,
			currentViewMode: window.appState?.currentViewMode,
			scrollPosition: document.querySelector('.file-list-container')?.scrollTop,
			editorContent: null,
			openTabs: window.tabManager ? [...window.tabManager.openTabs] : [],
			activeTab: window.tabManager?.activeTab,
			// 【新增】保存展开的文件夹状态
			expandedFolders: window.appState?.expandedFolders ? 
				new Set(window.appState.expandedFolders) : new Set()
		};
	
		console.log(`  💾 已保存状态: ${this.savedState.expandedFolders.size} 个展开文件夹`);
	
		// 如果编辑器有未保存内容，先保存
		if (window.milkdownEditor && window.appState?.hasUnsavedChanges) {
			try {
				this.savedState.editorContent = window.milkdownEditor.getMarkdown();
				console.log('  💾 已保存编辑器内容');
			} catch (error) {
				console.warn('保存编辑器内容失败:', error);
			}
		}
	
		try {
			// 2. 保存并清空编辑器内容（不销毁编辑器实例）
			if (window.milkdownEditor) {
				try {
					// 保存当前内容
					if (window.appState?.activeFilePath && !window.appState.activeFilePath.startsWith('untitled-')) {
						this.savedState.editorContent = window.milkdownEditor.getMarkdown();
					}
					
					// 清空编辑器显示为空内容
					await window.milkdownEditor.loadContent('');
					console.log('  ✅ 编辑器内容已清空');
				} catch (error) {
					console.warn('清空编辑器失败:', error);
				}
			}
	
			// 3. 关闭图谱
			if (window.closeGraphView && typeof window.closeGraphView === 'function') {
				window.closeGraphView();
				console.log('  ✅ 图谱已关闭');
			}
	
			// 4. 清空文件树缓存
			if (window.appState?.fileTreeCache) {
				window.appState.fileTreeCache.clear();
				console.log('  ✅ 文件树缓存已清空');
			}
	
			// 5. 清空虚拟滚动数据
			if (window.appState?.virtualScroll) {
				window.appState.virtualScroll.visibleItems = [];
				window.appState.virtualScroll.renderedRange = { start: 0, end: 0 };
			}
	
			// 6. 清空文件列表 DOM
			const fileListElement = document.getElementById('file-list');
			if (fileListElement) {
				fileListElement.innerHTML = '';
				console.log('  ✅ 文件列表 DOM 已清空');
			}
	
			// 7. 释放搜索索引
			try {
				await invoke('release_index');
				console.log('  ✅ 搜索索引已释放');
			} catch (error) {
				console.warn('释放索引失败:', error);
			}
	
			// 8. 清空编辑器容器
			const editorContainer = document.getElementById('milkdown-editor');
			if (editorContainer) {
				editorContainer.innerHTML = '';
			}
	
			// 9. Rust 资源最小化
			try {
				await invoke('minimize_resources');
				console.log('  ✅ Rust 资源已最小化');
			} catch (error) {
				console.warn('Rust 资源最小化失败:', error);
			}
	
			this.resourcesReleased = true;
			this.isMinimized = true;
	
			const releaseTime = performance.now() - startTime;
			console.log(`✅ 资源释放完成，耗时: ${releaseTime.toFixed(2)}ms`);
	
			// 强制垃圾回收
			if (window.gc) {
				window.gc();
				console.log('  ♻️ 已请求垃圾回收');
			}
	
		} catch (error) {
			console.error('❌ 资源释放失败:', error);
		}
	}

	/**
	* 恢复资源1
	*/
	async restoreResources() {
    if (!this.resourcesReleased) {
        console.log('⚠️ 资源未释放，无需恢复');
        return;
    }
    
    console.log('🔄 开始恢复资源...');
	    // 【新增】导入必要的 Milkdown 类型
    const { editorViewCtx } = await import('../js/milkdown-editor.js').catch(() => ({}));


    try {
        // 1. 初始化编辑器
        if (window.initializeMilkdownEditor) {
            await window.initializeMilkdownEditor();
            console.log('  ✅ 编辑器已初始化');
        }

        // 2. 恢复文件树
        if (window.appState?.rootPath && window.refreshFileTree) {
            await window.refreshFileTree('');
            
            // 恢复展开的文件夹
            if (this.savedState?.expandedFolders?.size > 0) {
                for (const folderPath of this.savedState.expandedFolders) {
                    try {
                        const children = await invoke('list_dir_lazy', {
                            rootPath: window.appState.rootPath,
                            relativePath: folderPath
                        });
                        window.appState.fileTreeCache?.set(folderPath, children);
                    } catch (error) {
                        console.warn(`加载文件夹失败: ${folderPath}`);
                    }
                }
                window.appState.expandedFolders = new Set(this.savedState.expandedFolders);
            }
            
            // 重置虚拟滚动位置
            const fileListContainer = document.querySelector('.file-list-container');
            const fileList = document.getElementById('file-list');
            
            if (fileListContainer && fileList) {
                fileListContainer.scrollTop = 0;
                fileList.style.transform = 'translateY(0px)';
                
                if (window.appState?.virtualScroll) {
                    window.appState.virtualScroll.scrollTop = 0;
                    window.appState.virtualScroll.renderedRange = { start: 0, end: 0 };
                }
                
                await new Promise(resolve => setTimeout(resolve, 50));
                
                window.updateVirtualScrollData?.();
                window.handleVirtualScroll?.();
            }
            
            console.log('  ✅ 文件树已恢复');
        }

        // 3. 恢复 Rust 资源
        try {
            await invoke('restore_resources');
            console.log('  ✅ Rust 资源已恢复');
        } catch (error) {
            console.warn('Rust 资源恢复失败:', error);
        }

		// 4. 恢复文件（关键修复）
		const hasActiveFile = this.savedState?.activeFilePath && 
							!this.savedState.activeFilePath.startsWith('untitled-');
		
		if (hasActiveFile && window.tabManager) {
			console.log('  📄 恢复文件:', this.savedState.activeFilePath);
			
			// 先强制重置编辑器滚动
			const editorContainer = document.getElementById('milkdown-editor');
			if (editorContainer) {
				editorContainer.scrollTop = 0;
				
				// 重置 ProseMirror 内部滚动
				const proseMirrorView = editorContainer.querySelector('.ProseMirror');
				if (proseMirrorView) {
					proseMirrorView.scrollTop = 0;
				}
			}
			
			// 等待 DOM 稳定
			await new Promise(resolve => setTimeout(resolve, 50));
			
			// 打开文件（会自动加载内容）
			window.tabManager.openTab(this.savedState.activeFilePath);
			
			// 等待内容加载完成
			await new Promise(resolve => setTimeout(resolve, 300));
			
			// 【关键】多次强制重置滚动位置
			if (editorContainer) {
				// 立即重置
				editorContainer.scrollTop = 0;
				
				// 在下一帧重置
				requestAnimationFrame(() => {
					editorContainer.scrollTop = 0;
					
					const proseMirrorView = editorContainer.querySelector('.ProseMirror');
					if (proseMirrorView) {
						proseMirrorView.scrollTop = 0;
						
						// 强制 ProseMirror 重新计算视图
						if (window.milkdownEditor?.editor) {
							window.milkdownEditor.editor.action((ctx) => {
								const view = ctx.get(editorViewCtx);
								if (view) {
									// 触发 ProseMirror 的滚动更新
									view.dispatch(view.state.tr.scrollIntoView());
								}
							});
						}
					}
				});
				
				// 延迟再次重置（保险）
				setTimeout(() => {
					editorContainer.scrollTop = 0;
					const proseMirrorView = editorContainer.querySelector('.ProseMirror');
					if (proseMirrorView) {
						proseMirrorView.scrollTop = 0;
					}
				}, 100);
			}
			
			// 最后触发 resize
			window.dispatchEvent(new Event('resize'));
			
			console.log('  ✅ 文件已恢复并重置滚动');
		}
	
			this.resourcesReleased = false;
			console.log('✅ 资源恢复完成');
	
		} catch (error) {
			console.error('❌ 恢复失败:', error);
			window.location?.reload();
		}
	}

    /**
     * 手动触发资源释放（用于测试）
     */
    async manualRelease() {
        console.log('🔧 手动触发资源释放...');
        await this.releaseResources();
    }

    /**
     * 手动触发资源恢复（用于测试）
     */
    async manualRestore() {
        console.log('🔧 手动触发资源恢复...');
        await this.restoreResources();
    }
}

// 创建全局实例
const windowManager = new WindowManager();

// 导出到全局
window.windowManager = windowManager;

console.log('✅ window-manager.js 加载完成');