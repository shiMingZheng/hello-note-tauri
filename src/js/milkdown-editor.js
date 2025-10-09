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
                        // 避免在加载时触发变更
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
                .create();
            
            console.log('✅ Milkdown 编辑器初始化成功');
            
            this.applyTheme(window.themeManager?.getCurrent() || 'light');
            
            return this.editor;
        } catch (error) {
            console.error('❌ Milkdown 编辑器初始化失败:', error);
            throw error;
        }
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