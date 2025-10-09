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
import { getMarkdown } from '@milkdown/utils';

/**
 * Milkdown 编辑器管理器
 */
class MilkdownEditorManager {
    constructor() {
        this.editor = null;
        this.currentContent = '';
        this.hasUnsavedChanges = false;
        this.onContentChange = null; // 回调函数
    }

    /**
     * 初始化编辑器
     * @param {string} containerSelector - 容器选择器
     * @param {Function} onContentChangeCallback - 内容变更回调
     */
    async init(containerSelector, onContentChangeCallback) {
        console.log('🎨 初始化 Milkdown 编辑器...');
        
        this.onContentChange = onContentChangeCallback;
        
        try {
            this.editor = await Editor.make()
                .config((ctx) => {
                    // 设置根容器
                    ctx.set(rootCtx, document.querySelector(containerSelector));
                    
                    // 设置初始内容
                    ctx.set(defaultValueCtx, '# 欢迎使用 CheetahNote\n\n开始编写您的笔记...');
                    
                    // 配置监听器
                    ctx.get(listenerCtx).markdownUpdated((ctx, markdown, prevMarkdown) => {
                        if (markdown !== prevMarkdown) {
                            this.currentContent = markdown;
                            this.hasUnsavedChanges = true;
                            
                            // 触发内容变更回调
                            if (this.onContentChange) {
                                this.onContentChange(markdown);
                            }
                        }
                    });
                })
                .use(commonmark) // 基础 Markdown 语法
                .use(gfm) // GitHub Flavored Markdown（表格、任务列表等）
                .use(history) // 撤销/重做
                .use(clipboard) // 剪贴板支持
                .use(cursor) // 光标增强
                .use(listener) // 事件监听
                .create();
            
            console.log('✅ Milkdown 编辑器初始化成功');
            
            // 应用当前主题
            this.applyTheme(window.themeManager?.getCurrent() || 'light');
            
            return this.editor;
        } catch (error) {
            console.error('❌ Milkdown 编辑器初始化失败:', error);
            throw error;
        }
    }

    /**
     * 加载笔记内容到编辑器
     * @param {string} markdown - Markdown 内容
     */
    async loadContent(markdown) {
        if (!this.editor) {
            console.warn('⚠️ 编辑器未初始化');
            return;
        }

        console.log('📝 加载笔记内容到编辑器');
        
        try {
            // 使用 action 更新编辑器内容
            await this.editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                const parser = ctx.get(parserCtx);
                const doc = parser(markdown);
                
                if (doc) {
                    const state = view.state;
                    const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
                    view.dispatch(tr);
                }
            });
            
            this.currentContent = markdown;
            this.hasUnsavedChanges = false;
            
            console.log('✅ 内容加载成功');
        } catch (error) {
            console.error('❌ 加载内容失败:', error);
            throw error;
        }
    }

    /**
     * 从编辑器导出 Markdown
     * @returns {string} - Markdown 文本
     */
    getMarkdown() {
        if (!this.editor) {
            console.warn('⚠️ 编辑器未初始化');
            return '';
        }

        try {
            return this.editor.action(getMarkdown());
        } catch (error) {
            console.error('❌ 导出 Markdown 失败:', error);
            return this.currentContent;
        }
    }

    /**
     * 清空编辑器内容
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
     * @param {string} themeName - 'light' | 'dark'
     */
    applyTheme(themeName) {
        console.log(`🎨 应用编辑器主题: ${themeName}`);
        
        const editorContainer = document.querySelector('#milkdown-editor');
        if (!editorContainer) return;
        
        // 移除旧主题类
        editorContainer.classList.remove('theme-light', 'theme-dark');
        
        // 添加新主题类
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
                view.setProps({ editable: () => !readonly });
            });
        } catch (error) {
            console.error('❌ 设置只读模式失败:', error);
        }
    }

    /**
     * 销毁编辑器
     */
    destroy() {
        if (this.editor) {
            console.log('🗑️ 销毁 Milkdown 编辑器');
            this.editor.destroy();
            this.editor = null;
        }
    }
}

// 创建全局编辑器实例
const milkdownEditor = new MilkdownEditorManager();

// 导出到全局
window.milkdownEditor = milkdownEditor;

console.log('✅ milkdown-editor.js 加载完成');