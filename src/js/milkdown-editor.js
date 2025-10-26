// src/js/milkdown-editor.js
'use strict';

import { Editor, rootCtx, defaultValueCtx, editorViewCtx,parserCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { clipboard } from '@milkdown/plugin-clipboard';
import { cursor } from '@milkdown/plugin-cursor';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { nord } from '@milkdown/theme-nord';
import { replaceAll, getMarkdown } from '@milkdown/utils';
import { createWikilinkPlugin } from './milkdown-wikilink-plugin.js';
import { appState } from './core/AppState.js';
import { showError } from './ui-utils.js';
import { eventBus } from './core/EventBus.js';
import { themeManager } from './theme.js';
import { lineNumbersPlugin } from './milkdown-linenumbers-plugin.js'; // <--- 导入行号插件
import { Slice } from '@milkdown/prose/model';             // <--- 导入 Slice 用于跳转
import { TextSelection } from '@milkdown/prose/state'; // <--- 新增这行导入
console.log('📜 milkdown-editor.js 开始加载...');

/**
 * Milkdown 编辑器管理器
 */
class MilkdownEditorManager {
    constructor() {
        if (MilkdownEditorManager.instance) {
            return MilkdownEditorManager.instance;
        }
        
        this.editor = null;
        this.currentContent = '';
        this.hasUnsavedChanges = false;
        this.onContentChange = null;
        this.isLoading = false;
        this.enableWikilinkJump = true;
        
        MilkdownEditorManager.instance = this;
    }

    /**
     * 初始化编辑器
     */
    async init(containerSelector, onContentChangeCallback) {
		console.log('🎨 初始化 Milkdown 编辑器...');
		console.log('📍 [MilkdownEditor] 容器选择器:', containerSelector);
	
		// ⭐ 检查容器是否存在
		const container = document.querySelector(containerSelector);
		console.log('📍 [MilkdownEditor] 容器元素:', container);
		
		if (!container) {
			const error = new Error(`找不到编辑器容器: ${containerSelector}`);
			console.error('❌ [MilkdownEditor]', error);
			throw error;
		}
		
		// ⭐ 检查容器是否可见
		const isVisible = container.offsetParent !== null;
		console.log('👁️ [MilkdownEditor] 容器是否可见:', isVisible);
		
		if (!isVisible) {
			console.warn('⚠️ [MilkdownEditor] 容器不可见，等待可见后初始化...');
			
			// 等待容器可见
			await new Promise((resolve) => {
				const checkVisibility = setInterval(() => {
					if (container.offsetParent !== null) {
						console.log('✅ [MilkdownEditor] 容器已可见');
						clearInterval(checkVisibility);
						resolve();
					}
				}, 50);
				
				// 超时保护
				setTimeout(() => {
					clearInterval(checkVisibility);
					console.warn('⚠️ [MilkdownEditor] 等待容器可见超时，强制初始化');
					resolve();
				}, 3000);
			});
		}
		
		this.onContentChange = onContentChangeCallback;
		
		try {
			this.editor = await Editor.make()
				.config((ctx) => {
					ctx.set(rootCtx, container);  // ⭐ 直接使用 container 变量
					ctx.set(defaultValueCtx, '# 欢迎使用 CheetahNote\n\n开始编写您的笔记...');
					
					                   // 监听内容变化，用于触发大纲更新 (使用 Milkdown 的 listener 插件)
                    ctx.get(listenerCtx).markdownUpdated((ctx, markdown, prevMarkdown) => {
                        if (this.onContentChange) {
                            this.onContentChange(markdown);
                        }
                        // 防抖处理，避免过于频繁地解析大纲
                        clearTimeout(this.contentChangeTimer);
                        this.contentChangeTimer = setTimeout(() => {
                            this.parseAndEmitOutline();
                        }, 500); // 500ms 后解析大纲
                    });
					// ... 其余配置代码保持不变
				})
				.use(nord)
				.use(commonmark)
				.use(gfm)
				.use(history)
				.use(clipboard)
				.use(cursor)
				.use(listener)
				.use(createWikilinkPlugin((target) => {
					this.handleWikilinkClick(target);
				}))
				.use(lineNumbersPlugin()) // <--- 在这里使用行号插件
				.create();
			
			console.log('✅ Milkdown 编辑器初始化成功');
			           // 订阅编辑器跳转事件
            eventBus.on('editor:scroll-to-pos', (pos) => this.scrollToPos(pos));
            // 订阅大纲更新请求事件
            eventBus.on('outline:request-update', () => this.parseAndEmitOutline());
			
			// 应用主题
			
			this.applyTheme(themeManager.getCurrentTheme());
			
			
			// 设置 Wikilink 处理器
			this.setupWikilinkHandler(containerSelector);
			
			return this.editor;
		} catch (error) {
			console.error('❌ Milkdown 编辑器初始化失败:', error);
			throw error;
		}
	}

    /**
     * 设置 Wikilink 点击处理
     */
    setupWikilinkHandler(containerSelector) {
        console.log('🔗 设置 Wikilink 处理器...');
        
        const container = document.querySelector(containerSelector);
        if (!container) {
            console.warn('⚠️ 编辑器容器未找到');
            return;
        }
        
        container.addEventListener('click', async (e) => {
            let target = e.target;
            let depth = 0;
            const maxDepth = 5;
            
            while (target && depth < maxDepth) {
                if (target.classList && target.classList.contains('wikilink-decoration')) {
					console.log('🖱️ 点击了 Wikilink');
                    
                    if (e.ctrlKey || e.metaKey) {
                        e.preventDefault();
                        e.stopPropagation();
                        const linkTarget = target.dataset.target || target.textContent;
                        if (linkTarget) {
                            console.log('🔗 跳转目标:', linkTarget);
                            await this.handleWikilinkClick(linkTarget);
                        }
                    } else {
                        console.log('💡 提示: 按住 Ctrl/Cmd 点击以跳转');
                    }
                    return;
                }
                
                target = target.parentElement;
                depth++;
            }
        }, true);
        
        console.log('✅ Wikilink 处理器已设置 (Ctrl/Cmd + 点击跳转)');
    }

    /**
     * 处理 Wikilink 点击
     */
    async handleWikilinkClick(linkTarget) {
        console.log('🔗 处理 Wikilink 跳转:', linkTarget);
        
        if (!appState.rootPath) {
            showError('请先打开一个笔记仓库');
            return;
        }
        
        try {
            const filePath = await this.findFileByTitle(linkTarget);
            
            if (!filePath) {
                console.warn('⚠️ 未找到目标文件:', linkTarget);
                showError(`未找到笔记: ${linkTarget}`);
                return;
            }
            
            console.log('✅ 找到目标文件:', filePath);
			// 修改这里 👇
			eventBus.emit('open-tab', filePath);

        } catch (error) {
            console.error('❌ 处理链接失败:', error);
            showError('打开链接失败: ' + error);
        }
    }

    /**
     * 根据标题查找文件
     */
    async findFileByTitle(target) {
        if (!appState.rootPath) return null;
        
        const targetWithExt = target.endsWith('.md') ? target : `${target}.md`;
        
        // 遍历文件树查找
        const findInTree = (nodes) => {
            for (const node of nodes) {
                if (!node.is_dir && node.name === targetWithExt) {
                    return node.path;
                }
                if (node.is_dir && appState.fileTreeMap.has(node.path)) {
                    const found = findInTree(appState.fileTreeMap.get(node.path));
                    if (found) return found;
                }
            }
            return null;
        };
        
        return findInTree(appState.fileTreeRoot);
    }

    /**
     * 加载内容到编辑器
     */
    async loadContent(content) {
        if (!this.editor) {
            console.warn('⚠️ 编辑器未初始化');
            return;
        }
        
        console.log('📄 加载内容到编辑器...');
        this.isLoading = true;
        
        try {
            this.editor.action(replaceAll(content));
            this.currentContent = content;
            this.hasUnsavedChanges = false;
            console.log('✅ 内容加载完成');
        } catch (error) {
            console.error('❌ 加载内容失败:', error);
        } finally {
            setTimeout(() => {
                this.isLoading = false;
            }, 100);
        }
    }

    /**
     * 获取编辑器内容
     */
    getMarkdown() {
        if (!this.editor) {
            console.warn('⚠️ 编辑器未初始化');
            return '';
        }
        
        try {
            return this.editor.action(getMarkdown());
        } catch (error) {
            console.error('❌ 获取内容失败:', error);
            return this.currentContent;
        }
    }

    /**
     * 应用主题
     */
    applyTheme(themeName) {
        console.log('🎨 应用编辑器主题:', themeName);
        
        //const editorContainer = document.querySelector('#milkdown-editor');
        //if (!editorContainer) return;
        
       // editorContainer.classList.remove('theme-light', 'theme-dark');
        //editorContainer.classList.add(`theme-${themeName}`);
    }

    /**
     * 设置只读模式
     */
    setReadonly(readonly) {
        if (!this.editor) return;
        
        try {
            this.editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                if (view && view.setProps) {
                    view.setProps({ editable: () => !readonly });
                }
            });
        } catch (error) {
            console.error('❌ 设置只读模式失败:', error);
        }
    }

    /**
     * 销毁编辑器
     */
    async destroy() {
        if (this.editor) {
            console.log('🗑️ 销毁 Milkdown 编辑器');
            try {
                await this.editor.destroy();
            } catch (error) {
                console.warn('⚠️ 销毁编辑器时出错:', error);
            }
            this.editor = null;
            this.currentContent = '';
            this.hasUnsavedChanges = false;
        }
    }
	
	   /**
     * 解析当前编辑器内容并发出 outline:updated 事件
     */
    parseAndEmitOutline() {
        if (!this.editor) return;
 
        console.log('解析大纲...');
        const outlineData = [];
        try {
            this.editor.action(ctx => {
                const view = ctx.get(editorViewCtx);
                if (!view) return;
                const state = view.state;
                state.doc.descendants((node, pos) => {
                    if (node.type.name === 'heading') {
                        outlineData.push({
                            level: node.attrs.level,
                            text: node.textContent.trim() || '空标题', // 处理空标题
                            pos: pos // 存储节点起始位置
                        });
                    }
                    // 返回 false 阻止深入标题内部（如果标题内不允许其他块）
                    // 如果标题内可以嵌套其他块（不常见），则需要调整
                    return node.type.name !== 'heading';
                });
            });
            eventBus.emit('outline:updated', outlineData);
        } catch (error) {
            console.error('❌ 解析大纲失败:', error);
            eventBus.emit('outline:updated', []); // 发送空数组表示失败
        }
    }
 
    /**
     * 滚动编辑器到指定位置
     * @param {number} pos - ProseMirror 文档位置
     */
    scrollToPos(pos) {
        if (!this.editor || typeof pos !== 'number') return;

        try {
            this.editor.action(ctx => {
                const view = ctx.get(editorViewCtx);
                if (!view) return;

                // 1. 创建并设置选区（移动光标）
                const tr = view.state.tr;
                // +1 移动到标题节点内部，或者保持 pos 如果希望光标在标题前
                const targetPos = pos + 1;
                // 确保 targetPos 在文档范围内
                const resolvedPos = Math.min(targetPos, tr.doc.content.size - 1);
                const selection = TextSelection.create(tr.doc, resolvedPos);
                tr.setSelection(selection);

                // 2. ★★★ 获取目标位置的屏幕坐标 ★★★
                //    在 dispatch 之前获取坐标，因为 dispatch 后 DOM 可能变化
                const coords = view.coordsAtPos(resolvedPos);

                // 3. 应用光标移动的事务
                view.dispatch(tr);

                // 4. ★★★ 手动滚动编辑器容器 ★★★
                const editorElement = view.dom.closest('#milkdown-editor'); // 获取可滚动的容器
                if (editorElement && coords) {
                    const editorRect = editorElement.getBoundingClientRect();
                    // 计算需要滚动的距离
                    // coords.top 是相对于 viewport 的位置
                    // editorRect.top 也是相对于 viewport 的位置
                    // editorElement.scrollTop 是当前已滚动距离
                    // 目标 scrollTop = 当前 scrollTop + (目标元素顶部距视口顶部的距离 - 容器顶部距视口顶部的距离) - 一些偏移量（让目标行靠上一点）
                    const offset = 50; // 向上偏移 50px
                    const targetScrollTop = editorElement.scrollTop + (coords.top - editorRect.top) - offset;

                    // 平滑滚动
                    editorElement.scrollTo({
                        top: Math.max(0, targetScrollTop), // 确保不小于0
                        behavior: 'smooth'
                    });
                     console.log(`🌀 尝试滚动到: scrollTop=${targetScrollTop}`);
                } else if (!coords) {
                     console.warn('⚠️ 无法获取目标位置坐标');
                     // 备用：尝试原始的 scrollIntoView
                     view.dispatch(view.state.tr.scrollIntoView());
                } else if (!editorElement) {
                     console.warn('⚠️ 找不到可滚动的 #milkdown-editor 容器');
                     // 备用：尝试原始的 scrollIntoView
                     view.dispatch(view.state.tr.scrollIntoView());
                }

                // 5. 确保视图获得焦点 (可以移到滚动之后)
                // view.focus(); // 如果滚动后焦点丢失，可以取消注释这行
            });
            console.log(`✅ 光标移动到位置: ${pos}`); // 更新日志
        } catch (error) {
            console.error('❌ 滚动/移动光标失败:', pos, error);
        }
    }
}

// 创建单例实例
const milkdownEditor = new MilkdownEditorManager();

// ES Module 导出
export {
    milkdownEditor,
    MilkdownEditorManager
};

// [重构] 步骤 2: 订阅 'ui:makeDraggable' 事件
// 之前是在 file-manager(旧版) 中通过 window.makeDraggable 调用
// virtual-scroll.js 已经是通过 dragDropManager.makeDraggable() 调用，不受影响
// 但 file-manager.js (新版) 会发布这个事件
eventBus.on('ui:makeDraggable', ({ element, item }) => {
    // 调用已实例化的管理器的 makeDraggable 方法
    if (dragDropManager && element && item) {
        dragDropManager.makeDraggable(element, item);
    }
});

console.log('✅ milkdown-editor.js 加载完成');