// src/js/milkdown-editor.js
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, parserCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm'; // ✅ 直接导入 GFM
import { history } from '@milkdown/plugin-history';
import { clipboard } from '@milkdown/plugin-clipboard';
import { cursor } from '@milkdown/plugin-cursor';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { nord } from '@milkdown/theme-nord';
import { EditorState } from '@milkdown/prose/state';
import { getMarkdown } from '@milkdown/utils';
import { createWikilinkPlugin } from './milkdown-wikilink-plugin.js';

class MilkdownEditorManager {
    constructor() {
        this.editor = null;
        this.currentContent = '';
        this.hasUnsavedChanges = false;
        this.onContentChange = null;
        this.isLoading = false;
        this.enableWikilinkJump = true;
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
                .use(gfm)           // ✅ 初始化时就加载 GFM
                .use(history)
                .use(clipboard)
                .use(cursor)
                .use(listener)
                .use(createWikilinkPlugin((target) => {
                    this.handleWikilinkClick(target);
                }))
                .create();
            
            console.log('✅ Milkdown 编辑器初始化成功（已加载 GFM）');
            
            this.applyTheme(window.themeManager?.getCurrent() || 'light');
            
            return this.editor;
        } catch (error) {
            console.error('❌ Milkdown 编辑器初始化失败:', error);
            throw error;
        }
    }

    /**
     * 加载内容到编辑器（简化版，移除动态 GFM 加载）
     */
    async loadContent(markdown) {
        if (!this.editor) {
            console.warn('⚠️ 编辑器未初始化');
            return;
        }

        console.log('📝 加载内容，长度:', markdown.length);
        
        this.isLoading = true;
        
        try {
            // ✅ 直接更新内容，GFM 已在初始化时加载
            await this.editor.action((ctx) => {
                const view = ctx.get(editorViewCtx);
                const parser = ctx.get(parserCtx);
                const doc = parser(markdown);
                
                const newState = EditorState.create({
                    doc: doc,
                    plugins: view.state.plugins,
                    schema: view.state.schema
                });
                
                view.updateState(newState);
            });
            
            this.currentContent = markdown;
            this.hasUnsavedChanges = false;
            
            console.log('✅ 内容加载成功');
        } catch (error) {
            console.error('❌ 加载内容失败:', error);
            throw error;
        } finally {
            setTimeout(() => {
                this.isLoading = false;
            }, 100);
        }
    }

    // 【删除】移除 loadGFMPlugin 方法
    // 【删除】移除 _needsGFM 方法
    // 【删除】移除 loadedPlugins 属性

    /**
     * 处理 Wikilink 点击
     */
    async handleWikilinkClick(linkTarget) {
        console.log('🔗 处理 Wikilink 跳转:', linkTarget);
        
        if (!linkTarget || typeof linkTarget !== 'string') {
            console.warn('⚠️ 无效的链接目标');
            return;
        }
        
        if (!window.appState || !window.appState.rootPath) {
            console.warn('⚠️ 工作区未初始化');
            if (window.showError) {
                window.showError('请先打开一个笔记仓库');
            }
            return;
        }
        
        try {
            const filePath = await this.findFileByTitle(linkTarget);
            
            if (!filePath) {
                console.warn('⚠️ 未找到目标文件:', linkTarget);
                if (window.showError) {
                    window.showError(`未找到笔记: ${linkTarget}`);
                }
                return;
            }
            
            console.log('✅ 找到目标文件:', filePath);
            
            if (window.tabManager && typeof window.tabManager.openTab === 'function') {
                window.tabManager.openTab(filePath);
            } else {
                console.error('❌ tabManager 未定义');
                if (window.showError) {
                    window.showError('无法打开文件：标签管理器未初始化');
                }
            }
        } catch (error) {
            console.error('❌ 处理链接失败:', error);
            console.error('❌ 错误堆栈:', error.stack);
            
            if (window.showError) {
                window.showError('打开链接失败: ' + error.message);
            }
        }
    }

    /**
     * 根据标题查找文件
     */
    async findFileByTitle(target) {
        const appState = window.appState;
        
        if (!appState || !appState.fileTreeRoot) {
            console.warn('⚠️ appState 未初始化');
            return null;
        }
        
        if (!appState.fileTreeCache || typeof appState.fileTreeCache.get !== 'function') {
            console.warn('⚠️ fileTreeCache 未初始化');
            return null;
        }
        
        console.log('🔍 查找文件:', target);
        
        const targetName = target.replace(/\.md$/i, '').toLowerCase();
        
        function searchNodes(nodes) {
            if (!nodes || !Array.isArray(nodes)) return null;
            
            for (const node of nodes) {
                if (!node || !node.name) continue;
                
                if (!node.is_dir) {
                    const fileName = node.name.replace(/\.md$/i, '').toLowerCase();
                    
                    if (fileName === targetName) {
                        console.log('✅ 找到文件:', node.path);
                        return node.path;
                    }
                }
                
                if (node.is_dir && 
                    appState.expandedFolders && 
                    appState.expandedFolders.has(node.path)) {
                    
                    const children = appState.fileTreeCache.get(node.path);
                    if (children) {
                        const found = searchNodes(children);
                        if (found) return found;
                    }
                }
            }
            
            return null;
        }
        
        const result = searchNodes(appState.fileTreeRoot);
        
        if (!result) {
            console.warn('⚠️ 未找到文件:', target);
        }
        
        return result;
    }

    /**
     * 获取当前 Markdown 内容
     */
    getMarkdown() {
        if (!this.editor) {
            console.warn('⚠️ 编辑器未初始化');
            return this.currentContent || '';
        }

        try {
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

// 导出到全局
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