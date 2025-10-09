// src/js/milkdown-editor.js
// CheetahNote - Milkdown 编辑器（完全修复版）

'use strict';
console.log('📜 milkdown-editor.js 开始加载...');

import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { clipboard } from '@milkdown/plugin-clipboard';
import { cursor } from '@milkdown/plugin-cursor';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { nord } from '@milkdown/theme-nord';
import { replaceAll, getMarkdown } from '@milkdown/utils';
// ⭐ 导入 Wikilink 插件
import { createWikilinkPlugin } from './milkdown-wikilink-plugin.js';

/**
 * Milkdown 编辑器管理器
 */
class MilkdownEditorManager {
    constructor() {
        this.editor = null;
        this.currentContent = '';
        this.hasUnsavedChanges = false;
        this.onContentChange = null;
        this.isLoading = false; // 防止循环更新
        this.enableWikilinkJump = true; // ⭐ 控制 Wikilink 是否可跳转
    }

    /**
     * 初始化编辑器
     */
    async init(containerSelector, onContentChangeCallback) {
        console.log('🎨 初始化 Milkdown 编辑器...');
        
        this.onContentChange = onContentChangeCallback;
        
        try {
            this.editor = await Editor.make()
				.config((ctx) => {
					ctx.set(rootCtx, document.querySelector(containerSelector));
					ctx.set(defaultValueCtx, '# 欢迎使用 CheetahNote\n\n开始编写您的笔记...');
					
					// 监听内容变化
					ctx.get(listenerCtx).markdownUpdated((ctx, markdown, prevMarkdown) => {
						if (this.isLoading) {
							console.log('📝 [跳过] 正在加载内容，忽略变更');
							return;
						}
						
						if (markdown !== prevMarkdown && markdown !== this.currentContent) {
							console.log('📝 [触发] 内容已变更');
							this.currentContent = markdown;
							this.hasUnsavedChanges = true;
							
							if (this.onContentChange) {
								this.onContentChange(markdown);
							}
						}
					});
				})
				.use(nord)
				.use(commonmark)
				.use(gfm)
				.use(history)
				.use(clipboard)
				.use(cursor)
				.use(listener)
				// ⭐ 使用 Wikilink 插件
				.use(createWikilinkPlugin((target) => {
					this.handleWikilinkClick(target);
				}))
				.create();
            
            console.log('✅ Milkdown 编辑器初始化成功');
            
            this.applyTheme(window.themeManager?.getCurrent() || 'light');
            
            // ⭐ 初始化 Wikilink 点击处理
            //this.setupWikilinkHandler(containerSelector);
            
            return this.editor;
        } catch (error) {
            console.error('❌ Milkdown 编辑器初始化失败:', error);
            throw error;
        }
    }

    /**
     * ⭐ 设置 Wikilink 点击处理
     */
    setupWikilinkHandler(containerSelector) {
        console.log('🔗 设置 Wikilink 处理器...');
        
        const container = document.querySelector(containerSelector);
        if (!container) {
            console.warn('⚠️ 未找到编辑器容器');
            return;
        }
        
        // 添加鼠标悬停提示
        container.addEventListener('mouseover', (e) => {
            let target = e.target;
            
            // 检查是否悬停在 wikilink 上
            for (let i = 0; i < 3 && target; i++) {
                const text = target.textContent || '';
                
                if (text.includes('[[') && text.includes(']]')) {
                    const match = text.match(/\[\[([^\]]+)\]\]/);
                    if (match) {
                        // 显示提示
                        target.style.cursor = 'pointer';
                        target.title = `按住 Ctrl/Cmd 点击跳转到: ${match[1].trim()}`;
                        return;
                    }
                }
                
                target = target.parentElement;
            }
        });
        
        
        // 点击事件处理
        // 点击事件处理
		container.addEventListener('mousedown', async (e) => {
			console.log('🖱️ 点击事件触发');
			console.log('📍 点击目标:', e.target);
			console.log('📝 标签名:', e.target.tagName);
			console.log('🎨 类名:', e.target.className);
			
			// ⭐ 关键：向上遍历 DOM 树查找链接
			let target = e.target;
			let depth = 0;
			
			while (target && target !== container && depth < 5) {
				console.log(`🔍 [深度${depth}] 标签:`, target.tagName, '类名:', target.className, '文本:', target.textContent?.substring(0, 30));
				
				// 检查是否是 <a> 标签
				if (target.tagName === 'A') {
					console.log('✅ 找到 <a> 标签!');
					console.log('   href:', target.getAttribute('href'));
					console.log('   data-*:', Array.from(target.attributes).filter(a => a.name.startsWith('data-')));
					console.log('   文本:', target.textContent);
					
					// 如果按住了 Ctrl/Cmd
					if (e.ctrlKey || e.metaKey) {
						e.preventDefault();
						e.stopPropagation();
						
						// 尝试从 href 或 textContent 获取目标
						const linkTarget = target.textContent || target.getAttribute('href')?.replace('#', '');
						if (linkTarget) {
							console.log('🔗 跳转目标:', linkTarget);
							await this.handleWikilinkClick(linkTarget);
						}
					} else {
						console.log('💡 提示: 按住 Ctrl/Cmd 点击以跳转');
					}
					return;
				}
				
				// 检查是否有 wikilink 类
				if (target.classList && target.classList.contains('wikilink')) {
					console.log('✅ 找到 .wikilink 元素!');
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
			
			console.log('❌ 未找到可点击的链接元素');
		}, true);//true为捕获阶段
		
		
        
        console.log('✅ Wikilink 处理器已设置 (Ctrl/Cmd + 点击跳转)');
    }

    /**
     * ⭐ 处理 Wikilink 点击
     */
    async handleWikilinkClick(linkTarget) {
        console.log('🔗 处理 Wikilink 跳转:', linkTarget);
        
        if (!window.appState || !window.appState.rootPath) {
            if (window.showError) {
                window.showError('请先打开一个笔记仓库');
            }
            return;
        }
        
        try {
            // 查找目标文件
            const filePath = await this.findFileByTitle(linkTarget);
            
            if (!filePath) {
                console.warn('⚠️ 未找到目标文件:', linkTarget);
                if (window.showError) {
                    window.showError(`未找到笔记: ${linkTarget}`);
                }
                return;
            }
            
            console.log('✅ 找到目标文件:', filePath);
            
            // 打开文件
            if (window.tabManager) {
                window.tabManager.openTab(filePath);
            }
        } catch (error) {
            console.error('❌ 处理链接失败:', error);
            if (window.showError) {
                window.showError('打开链接失败: ' + error);
            }
        }
    }

    /**
     * ⭐ 根据标题查找文件
     */
    async findFileByTitle(target) {
        const appState = window.appState;
        if (!appState) return null;
        
        // 尝试添加 .md 扩展名
        const targetWithExt = target.endsWith('.md') ? target : `${target}.md`;
        
        // 递归搜索文件树
        function searchNodes(nodes) {
            if (!nodes) return null;
            
            for (const node of nodes) {
                if (!node.is_dir) {
                    const fileName = node.name.replace(/\.md$/i, '');
                    const targetName = target.replace(/\.md$/i, '');
                    
                    if (fileName.toLowerCase() === targetName.toLowerCase()) {
                        return node.path;
                    }
                }
                
                // 递归搜索子目录
                if (node.is_dir && appState.fileTreeMap.has(node.path)) {
                    const children = appState.fileTreeMap.get(node.path);
                    const found = searchNodes(children);
                    if (found) return found;
                }
            }
            
            return null;
        }
        
        return searchNodes(appState.fileTreeRoot);
    }

    /**
     * 加载内容到编辑器
     * @param {string} markdown - Markdown 内容
     */
    async loadContent(markdown) {
        if (!this.editor) {
            console.warn('⚠️ 编辑器未初始化');
            return;
        }

        console.log('📝 加载内容，长度:', markdown.length);
        
        // 设置加载标志，防止触发 onContentChange
        this.isLoading = true;
        
        try {
            // 使用 replaceAll action 更新内容
            await this.editor.action(replaceAll(markdown));
            
            this.currentContent = markdown;
            this.hasUnsavedChanges = false;
            
            console.log('✅ 内容加载成功');
        } catch (error) {
            console.error('❌ 加载内容失败:', error);
            throw error;
        } finally {
            // 延迟重置加载标志，确保 markdownUpdated 不会立即触发
            setTimeout(() => {
                this.isLoading = false;
                console.log('🔓 加载标志已重置');
            }, 100);
        }
    }

    /**
     * 获取当前 Markdown 内容
     * @returns {string} Markdown 文本
     */
    getMarkdown() {
        if (!this.editor) {
            console.warn('⚠️ 编辑器未初始化');
            return this.currentContent || '';
        }

        try {
            // 使用 action 获取最新内容
            const markdown = this.editor.action(getMarkdown());
            this.currentContent = markdown;
            return markdown;
        } catch (error) {
            console.error('❌ 导出 Markdown 失败:', error);
            return this.currentContent || '';
        }
    }

    /**
     * 清空编辑器
     */
    async clear() {
        if (!this.editor) return;
        
        try {
            await this.loadContent('');
            this.hasUnsavedChanges = false;
        } catch (error) {
            console.error('❌ 清空编辑器失败:', error);
        }
    }

    /**
     * 应用主题
     * @param {string} themeName - 'light' | 'dark'
     */
    applyTheme(themeName) {
        console.log(`🎨 应用编辑器主题: ${themeName}`);
        
        const editorContainer = document.querySelector('#milkdown-editor');
        if (!editorContainer) return;
        
        editorContainer.classList.remove('theme-light', 'theme-dark');
        editorContainer.classList.add(`theme-${themeName}`);
    }

    /**
     * 设置只读模式
     * @param {boolean} readonly - 是否只读
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
}

// 创建全局编辑器实例
const milkdownEditor = new MilkdownEditorManager();

// 导出到全局（兼容旧代码）
window.milkdownEditor = milkdownEditor;
window.markdownEditor = {
    get value() {
        return milkdownEditor.getMarkdown();
    },
    set value(content) {
        milkdownEditor.loadContent(content);
    }
};

console.log('✅ milkdown-editor.js 加载完成');