// src/js/milkdown-editor.js
'use strict';

import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core';
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
                .use(createWikilinkPlugin((target) => {
                    this.handleWikilinkClick(target);
                }))
                .create();
            
            console.log('✅ Milkdown 编辑器初始化成功');
            
            // 应用主题
            if (window.themeManager) {
                this.applyTheme(window.themeManager.getCurrentTheme());
            }
            
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
                if (target.classList && target.classList.contains('milkdown-wikilink')) {
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
            
            if (window.tabManager) {
                window.tabManager.openTab(filePath);
            }
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
        
        const editorContainer = document.querySelector('#milkdown-editor');
        if (!editorContainer) return;
        
        editorContainer.classList.remove('theme-light', 'theme-dark');
        editorContainer.classList.add(`theme-${themeName}`);
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
}

// 创建单例实例
const milkdownEditor = new MilkdownEditorManager();

// 导出到全局（向后兼容）
window.milkdownEditor = milkdownEditor;
window.markdownEditor = {
    get value() {
        return milkdownEditor.getMarkdown();
    },
    set value(content) {
        milkdownEditor.loadContent(content);
    }
};

// ES Module 导出
export {
    milkdownEditor,
    MilkdownEditorManager
};

console.log('✅ milkdown-editor.js 加载完成');