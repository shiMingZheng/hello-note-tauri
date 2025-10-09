// src/js/milkdown-editor.js
// CheetahNote - Milkdown 所见即所得编辑器模块

'use strict';
console.log('📜 milkdown-editor.js 开始加载...');

import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { clipboard } from '@milkdown/plugin-clipboard';
import { cursor } from '@milkdown/plugin-cursor';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { nord } from '@milkdown/theme-nord';

/**
 * Milkdown 编辑器管理器
 */
class MilkdownEditorManager {
    constructor() {
        this.editor = null;
        this.currentContent = '';
        this.hasUnsavedChanges = false;
        this.onContentChange = null;
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
                    ctx.set(defaultValueCtx, '');
                    
                    ctx.get(listenerCtx).markdownUpdated((ctx, markdown, prevMarkdown) => {
                        if (markdown !== prevMarkdown) {
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
     * 加载内容
     */
    async loadContent(markdown) {
        if (!this.editor) {
            console.warn('⚠️ 编辑器未初始化');
            return;
        }

        console.log('📝 加载笔记内容到编辑器');
        
        try {
            this.editor.action((ctx) => {
                const view = ctx.get(rootCtx);
                const parser = ctx.get(parserCtx);
                
                // 简单方式：销毁并重建
                if (view && view.editor) {
                    const doc = parser(markdown);
                    if (doc) {
                        const state = view.editor.state;
                        const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
                        view.editor.view.dispatch(tr);
                    }
                }
            });
            
            this.currentContent = markdown;
            this.hasUnsavedChanges = false;
            
            console.log('✅ 内容加载成功');
        } catch (error) {
            console.error('❌ 加载内容失败:', error);
            
            // 备用方案：重建编辑器
            try {
                await this.destroy();
                await this.init('#milkdown-editor', this.onContentChange);
                
                this.editor.action((ctx) => {
                    ctx.set(defaultValueCtx, markdown);
                });
                
                this.currentContent = markdown;
                this.hasUnsavedChanges = false;
            } catch (retryError) {
                console.error('❌ 重试加载失败:', retryError);
                throw retryError;
            }
        }
    }

    /**
     * 获取 Markdown
     */
    getMarkdown() {
        if (!this.editor) {
            console.warn('⚠️ 编辑器未初始化');
            return '';
        }

        try {
            return this.currentContent || '';
        } catch (error) {
            console.error('❌ 导出 Markdown 失败:', error);
            return this.currentContent;
        }
    }

    /**
     * 清空编辑器
     */
    clear() {
        if (!this.editor) return;
        
        try {
            this.loadContent('');
            this.hasUnsavedChanges = false;
        } catch (error) {
            console.error('❌ 清空编辑器失败:', error);
        }
    }

    /**
     * 应用主题
     */
    applyTheme(themeName) {
        console.log(`🎨 应用编辑器主题: ${themeName}`);
        
        const editorContainer = document.querySelector('#milkdown-editor');
        if (!editorContainer) return;
        
        editorContainer.classList.remove('theme-light', 'theme-dark');
        editorContainer.classList.add(`theme-${themeName}`);
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
                console.warn('销毁编辑器时出错:', error);
            }
            this.editor = null;
        }
    }
}

// 创建全局编辑器实例
const milkdownEditor = new MilkdownEditorManager();

// 导出到全局
window.milkdownEditor = milkdownEditor;

console.log('✅ milkdown-editor.js 加载完成');