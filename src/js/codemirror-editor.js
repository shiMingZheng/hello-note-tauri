// src/js/codemirror-editor.js
'use strict';

// ⭐ 使用 Skypack CDN 导入 CodeMirror 6
import { EditorView, minimalSetup } from 'https://cdn.skypack.dev/codemirror@6.0.1';
import { EditorState } from 'https://cdn.skypack.dev/@codemirror/state@6.4.1';
import { markdown } from 'https://cdn.skypack.dev/@codemirror/lang-markdown@6.2.5';
import { eventBus } from './core/EventBus.js';
import { appState } from './core/AppState.js';

console.log('📜 codemirror-editor.js 开始加载...');

/**
 * CodeMirror 6 编辑器管理器 (源码模式)
 */
class CodeMirrorEditorManager {
    constructor() {
        if (CodeMirrorEditorManager.instance) {
            return CodeMirrorEditorManager.instance;
        }
        
        this.view = null;
        this.currentContent = '';
        this.hasUnsavedChanges = false;
        this.isLoading = false;
        this.container = null;
        
        CodeMirrorEditorManager.instance = this;
    }

    /**
     * 初始化编辑器
     */
    init(containerSelector) {
        console.log('🎨 初始化 CodeMirror 编辑器...');
        
        this.container = document.querySelector(containerSelector);
        
        if (!this.container) {
            console.error('❌ CodeMirror 容器未找到:', containerSelector);
            return;
        }

        try {
            // 创建编辑器状态
            const startState = EditorState.create({
                doc: '',
                extensions: [
                    minimalSetup,
                    markdown(),
                    this.createTheme(),
                    this.createUpdateListener(),
                    EditorView.lineWrapping, // 自动换行
                ]
            });

            // 创建编辑器视图
            this.view = new EditorView({
                state: startState,
                parent: this.container
            });

            console.log('✅ CodeMirror 编辑器初始化成功');
        } catch (error) {
            console.error('❌ CodeMirror 初始化失败:', error);
            throw error;
        }
    }

    /**
     * 创建主题扩展
     */
    createTheme() {
        return EditorView.theme({
            // 编辑器容器
            "&": {
                height: "100%",
                fontSize: "14px",
                backgroundColor: "var(--bg-primary)",
                color: "var(--text-primary)"
            },
            // 内容区域
            ".cm-content": {
                caretColor: "var(--primary-color)",
                fontFamily: "'Consolas', 'Monaco', monospace",
                padding: "20px"
            },
            // 光标
            ".cm-cursor": {
                borderLeftColor: "var(--primary-color)"
            },
            // 选中文本
            "&.cm-focused .cm-selectionBackground, ::selection": {
                backgroundColor: "rgba(52, 152, 219, 0.2)"
            },
            // 滚动条
            ".cm-scroller": {
                overflow: "auto",
                fontFamily: "'Consolas', 'Monaco', monospace"
            },
            // 行号
            ".cm-gutters": {
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                border: "none"
            },
            // 活动行
            ".cm-activeLine": {
                backgroundColor: "var(--bg-secondary)"
            },
            // 语法高亮样式
            ".cm-strong": {
                fontWeight: "bold"
            },
            ".cm-em": {
                fontStyle: "italic"
            },
            ".cm-link": {
                color: "var(--primary-color)",
                textDecoration: "underline"
            },
            ".cm-heading": {
                fontWeight: "bold"
            },
            ".cm-heading1": {
                fontSize: "1.8em"
            },
            ".cm-heading2": {
                fontSize: "1.5em"
            },
            ".cm-heading3": {
                fontSize: "1.3em"
            },
            ".cm-code, .cm-monospace": {
                backgroundColor: "var(--bg-secondary)",
                padding: "2px 4px",
                borderRadius: "3px",
                fontFamily: "'Consolas', 'Monaco', monospace"
            },
            ".cm-quote": {
                color: "var(--text-secondary)",
                fontStyle: "italic"
            }
        });
    }

    /**
     * 创建内容变更监听器
     */
    createUpdateListener() {
        return EditorView.updateListener.of((update) => {
            if (update.docChanged && !this.isLoading) {
                this.currentContent = this.getContent();
                this.hasUnsavedChanges = true;
                appState.hasUnsavedChanges = true;
                
                console.log('📝 CodeMirror 内容已变更');
                
                // 发布内容变更事件
                eventBus.emit('editor:content-changed', {
                    content: this.currentContent,
                    mode: 'source'
                });
            }
        });
    }

    /**
     * 加载内容到编辑器
     */
    loadContent(content) {
        if (!this.view) {
            console.warn('⚠️ CodeMirror 编辑器未初始化');
            return;
        }

        console.log('📄 加载内容到 CodeMirror...');
        this.isLoading = true;

        try {
            // 替换整个文档内容
            this.view.dispatch({
                changes: {
                    from: 0,
                    to: this.view.state.doc.length,
                    insert: content || ''
                }
            });

            this.currentContent = content || '';
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
    getContent() {
        if (!this.view) {
            console.warn('⚠️ CodeMirror 编辑器未初始化');
            return '';
        }

        return this.view.state.doc.toString();
    }

    /**
     * 应用主题
     */
    applyTheme(themeName) {
        console.log('🎨 应用 CodeMirror 主题:', themeName);
        // 主题通过 CSS 变量控制
    }

    /**
     * 设置只读模式
     */
    setReadonly(readonly) {
        if (!this.view) return;

        try {
            this.view.dispatch({
                effects: EditorState.readOnly.of(readonly)
            });
        } catch (error) {
            console.error('❌ 设置只读模式失败:', error);
        }
    }

    /**
     * 聚焦编辑器
     */
    focus() {
        if (this.view) {
            this.view.focus();
        }
    }

    /**
     * 销毁编辑器
     */
    destroy() {
        if (this.view) {
            console.log('🗑️ 销毁 CodeMirror 编辑器');
            this.view.destroy();
            this.view = null;
            this.currentContent = '';
            this.hasUnsavedChanges = false;
        }
    }
}

// 导出单例
export const codemirrorEditor = new CodeMirrorEditorManager();

console.log('✅ codemirror-editor.js 加载完成');