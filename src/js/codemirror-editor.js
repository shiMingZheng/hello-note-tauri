// src/js/codemirror-editor.js
'use strict';

import { EditorView, minimalSetup } from 'codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { EditorState, Compartment } from '@codemirror/state';
import { eventBus } from './core/EventBus.js';
import { appState } from './core/AppState.js';

// ⭐ 最终修正：只导入 GFM。GFM 扩展包已经包含了表格。
import { GFM } from '@lezer/markdown';

import { defaultKeymap, history, indentWithTab } from '@codemirror/commands';
import {
    keymap,
    highlightActiveLine,
    lineNumbers,
    drawSelection,
    placeholder,
    highlightActiveLineGutter
} from '@codemirror/view';
// ⭐ 修正：导入 EditorSelection
import { EditorSelection } from '@codemirror/state';

console.log('📜 codemirror-editor.js (重构版) 开始加载...');

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
        this.outlineTimer = null; 

        this.editableCompartment = new Compartment();
        this.modeCompartment = new Compartment();

        // “源码”模式扩展
        this.sourceModeExtensions = [
            markdown({
                base: markdownLanguage,
                codeLanguages: [],
                addKeymap: true
            }),
        ];

        // “实时预览”模式扩展
        this.livePreviewExtensions = [
            markdown({
                base: markdownLanguage,
                codeLanguages: [], 
                // ⭐ 最终修正：只使用 GFM，它已包含表格
                extensions: [GFM] 
            }),
        ];
        
        CodeMirrorEditorManager.instance = this;
    }

    init(containerSelector) {
        console.log('🎨 初始化 CodeMirror 编辑器 (双模式版)...');
        
        this.container = document.querySelector(containerSelector);
        
        if (!this.container) {
            console.error('❌ CodeMirror 容器未找到:', containerSelector);
            return;
        }

        try {
            const startState = EditorState.create({
                doc: '# 欢迎使用\n\n请在左侧打开文件',
                extensions: [
                    minimalSetup,
                    history(),
                    keymap.of(defaultKeymap),
                    keymap.of([indentWithTab]),
                    lineNumbers(),
                    highlightActiveLineGutter(),
                    drawSelection(),
                    highlightActiveLine(),
                    placeholder('开始写作...'),
                    
                    this.createTheme(),
                    this.createUpdateListener(),
                    EditorView.lineWrapping, 

                    this.editableCompartment.of(EditorView.editable.of(false)),
                    this.modeCompartment.of(this.livePreviewExtensions)
                ]
            });

            this.view = new EditorView({
                state: startState,
                parent: this.container
            });

            eventBus.on('outline:request-update', () => this.parseAndEmitOutline());
            eventBus.on('editor:scroll-to-pos', (pos) => this.scrollToPos(pos));

            console.log('✅ CodeMirror 编辑器初始化成功');
        } catch (error) {
            console.error('❌ CodeMirror 初始化失败:', error);
            throw error;
        }
    }

    setMode(mode) {
        if (!this.view || !this.modeCompartment) return;
        console.log(`🔄 CodeMirror 切换模式: ${mode}`);
        
        let extensions = (mode === 'source') 
            ? this.sourceModeExtensions 
            : this.livePreviewExtensions;

        try {
            this.view.dispatch({
                effects: this.modeCompartment.reconfigure(extensions)
            });
            console.log(`✅ CodeMirror 模式已切换`);
        } catch(error) {
            console.error(`❌ 切换 CodeMirror 模式失败:`, error);
        }
    }

    createTheme() {
        return EditorView.theme({
            "&": {
                height: "100%",
                fontSize: "16px",
                backgroundColor: "var(--bg-primary)",
                color: "var(--text-primary)"
            },
            ".cm-content": {
                caretColor: "var(--primary-color)",
                fontFamily: "var(--font-family-serif, 'Georgia', 'Times New Roman', serif)", 
                padding: "20px 40px",
                maxWidth: "800px", 
                margin: "0 auto",
            },
            ".cm-meta": {
                color: "var(--text-secondary)",
                opacity: 0.7,
                fontFamily: "var(--font-family-mono, 'Consolas', 'Monaco', monospace)"
            },
            ".cm-line": {
                 fontFamily: "var(--font-family-serif, 'Georgia', 'Times New Roman', serif)",
            },
            ".cm-source-mode-active .cm-line": {
                fontFamily: "var(--font-family-mono, 'Consolas', 'Monaco', monospace)"
            },
            ".cm-gutters": {
                backgroundColor: "var(--bg-secondary)",
                color: "var(--text-secondary)",
                border: "none"
            },
            ".cm-activeLine": {
                backgroundColor: "var(--active-bg, var(--bg-secondary))"
            },
            ".cm-activeLineGutter": {
                backgroundColor: "var(--active-bg, var(--bg-secondary))"
            }
        });
    }

    createUpdateListener() {
        return EditorView.updateListener.of((update) => {
            if (update.docChanged && !this.isLoading) {
                this.currentContent = this.getContent();
                this.hasUnsavedChanges = true;
                appState.hasUnsavedChanges = true;
                
                eventBus.emit('editor:content-changed', {
                    content: this.currentContent,
                    mode: 'source'
                });

                clearTimeout(this.outlineTimer);
                this.outlineTimer = setTimeout(() => {
                    this.parseAndEmitOutline();
                }, 500);
            }
        });
    }

    parseAndEmitOutline() {
        if (!this.view) return;

        console.log('🔍 [CM6] 解析大纲...');
        const outlineData = [];
        const headingRegex = /^(#+)\s+(.*)/;

        try {
            for (let i = 1; i <= this.view.state.doc.lines; i++) {
                const line = this.view.state.doc.line(i);
                const match = line.text.match(headingRegex);
                
                if (match) {
                    const level = match[1].length;
                    const text = match[2].trim() || '空标题';
                    const pos = line.from; 

                    outlineData.push({
                        level: level,
                        text: text,
                        pos: pos 
                    });
                }
            }
            eventBus.emit('outline:updated', outlineData);
        } catch (error) {
            console.error('❌ [CM6] 解析大纲失败:', error);
            eventBus.emit('outline:updated', []);
        }
    }

    insertText(text) {
        if (!this.view) return;

        try {
            const { state, dispatch } = this.view;
            const { selection } = state;
            
            const transaction = state.tr.replaceSelection(text);
            dispatch(transaction);
            
            const newPos = selection.main.from + text.length;
            const newTransaction = this.view.state.tr.setSelection(
                EditorSelection.cursor(newPos) 
            );
            this.view.dispatch(newTransaction);
            
            this.view.focus();
            console.log('✅ [CM6] 已插入文本:', text);
            
        } catch (error) {
            console.error('❌ [CM6] 插入文本失败:', error);
        }
    }
    
    scrollToPos(pos) {
        if (!this.view || typeof pos !== 'number') return;
        
        try {
            const tr = this.view.state.tr;
            const resolvedPos = Math.min(pos, tr.doc.length - 1);
            
            const selection = EditorSelection.cursor(resolvedPos);
            tr.setSelection(selection);
            
            tr.scrollIntoView();
            this.view.dispatch(tr);
            this.view.focus();
            
            console.log(`✅ [CM6] 已滚动到位置: ${pos}`);
        } catch (error) {
            console.error('❌ [CM6] 滚动/移动光标失败:', pos, error);
        }
    }

    loadContent(content) {
        if (!this.view) {
            console.warn('⚠️ CodeMirror 编辑器未初始化');
            return;
        }
        this.isLoading = true;
        try {
            this.view.dispatch({
                changes: {
                    from: 0,
                    to: this.view.state.doc.length,
                    insert: content || ''
                }
            });
            this.currentContent = content || '';
            this.hasUnsavedChanges = false;
            
            this.parseAndEmitOutline();
            
            console.log('✅ 内容加载完成');
        } catch (error) {
            console.error('❌ 加载内容失败:', error);
        } finally {
            setTimeout(() => {
                this.isLoading = false;
            }, 100);
        }
    }

    getContent() {
        if (!this.view) return '';
        return this.view.state.doc.toString();
    }

    setReadonly(readonly) {
        if (!this.view || !this.editableCompartment) return;
        try {
            this.view.dispatch({
                effects: this.editableCompartment.reconfigure(EditorView.editable.of(!readonly))
            });
            console.log(`✅ CodeMirror Readonly 设置为: ${readonly}`);
        } catch (error) {
            console.error('❌ 设置只读模式失败:', error);
        }
    }

    focus() {
        if (this.view) {
            this.view.focus();
        }
    }

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

console.log('✅ codemirror-editor.js (重构版) 加载完成');