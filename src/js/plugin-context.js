// src/js/plugin-context.js
'use strict';

import { appState } from './core/AppState.js';
import { showSuccessMessage, showError } from './ui-utils.js';
import { invoke,IS_TAURI_APP } from './core/TauriAPI.js';
// ⭐ 改造：导入 CodeMirror 核心
import { codemirrorEditor } from './codemirror-editor.js';

console.log('📜 plugin-context.js 开始加载...');

/**
 * 插件上下文
 * 为插件提供访问应用功能的 API
 */
class PluginContext {
    constructor() {
        if (PluginContext.instance) {
            return PluginContext.instance;
        }
        
        this.menuItems = new Map();
        
        PluginContext.instance = this;
    }

    /**
     * 编辑器 API
     */
    editor = {
        /**
         * 获取当前编辑器内容
         */
        getContent() {
            // ⭐ 改造：使用 CodeMirror
            if (!codemirrorEditor) {
                console.warn('⚠️ 编辑器未初始化');
                return '';
            }
            return codemirrorEditor.getContent();
        },

        /**
         * 设置编辑器内容
         */
        async setContent(content) {
            // ⭐ 改造：使用 CodeMirror
            if (!codemirrorEditor) {
                console.warn('⚠️ 编辑器未初始化');
                return;
            }
            await codemirrorEditor.loadContent(content);
        },

        /**
         * 在光标位置插入文本
         */
        insertText(text) {
            // ⭐ 改造：使用 CodeMirror
            if (!codemirrorEditor || !codemirrorEditor.view) {
                console.warn('⚠️ 编辑器未初始化');
                return;
            }
            
            try {
                // (我们将在 codemirror-editor.js 中实现这个 insertText 方法)
                codemirrorEditor.insertText(text);
            } catch (error) {
                console.error('❌ 插入文本失败:', error);
            }
        },

        /**
         * 插入图片
         */
        insertImage(url, alt = '图片') {
            const imageMarkdown = `![${alt}](${url})`;
            this.insertText(imageMarkdown);
        },

        /**
         * 获取当前选中的文本
         */
        getSelection() {
            // ⭐ 改造：使用 CodeMirror
            if (!codemirrorEditor || !codemirrorEditor.view) {
                return '';
            }
            const { state } = codemirrorEditor.view;
            const { from, to } = state.selection.main;
            return state.doc.sliceString(from, to);
        }
    };

    /**
     * UI API
     */
    ui = {
        /**
         * 显示提示消息
         */
        showToast(message) {
            showSuccessMessage(message);
        },

        /**
         * 显示错误消息
         */
        showError(message) {
            showError(message);
        },

        /**
         * 打开模态窗口
         */
        async openModal(url, data = {}) {
            return new Promise((resolve) => {
                const overlay = document.createElement('div');
                overlay.className = 'plugin-modal-overlay';
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10000;
                `;
                
                const iframe = document.createElement('iframe');
                iframe.src = url;
                iframe.style.cssText = `
                    width: 80%;
                    height: 80%;
                    border: none;
                    border-radius: 8px;
                    background: white;
                `;
                
                overlay.appendChild(iframe);
                document.body.appendChild(overlay);
                
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) {
                        overlay.remove();
                        resolve(null);
                    }
                });
            });
        }
    };

    /**
     * 文件 API
     */
    file = {
        /**
         * 获取当前打开的文件路径
         */
        getCurrentFilePath() {
            return appState.activeFilePath;
        },

        /**
         * 获取工作区根路径
         */
        getRootPath() {
            return appState.rootPath;
        },

        /**
         * 读取文件内容
         */
        async readFile(relativePath) {
            if (!IS_TAURI_APP) return null;
            
            try {
                return await invoke('read_file_content', {
                    rootPath: appState.rootPath,
                    relativePath
                });
            } catch (error) {
                console.error('❌ 读取文件失败:', error);
                return null;
            }
        },

        /**
         * 保存文件内容
         */
        async saveFile(relativePath, content) {
            if (!IS_TAURI_APP) return false;
            
            try {
                
                await invoke('save_file', {
                    rootPath: appState.rootPath,
                    relativePath,
                    content
                });
                return true;
            } catch (error) {
                console.error('❌ 保存文件失败:', error);
                return false;
            }
        }
    };

    /**
     * 应用 API
     */
    app = {
        /**
         * 获取应用状态
         */
        getState() {
            return appState;
        },

        /**
         * 注册命令
         */
        registerCommand(commandId, handler) {
            console.log(`📝 注册命令: ${commandId}`);
            // TODO: 实现命令注册
        }
    };
}

// 创建单例
const pluginContext = new PluginContext();

// ES Module 导出
export {
    pluginContext,
    PluginContext
};

console.log('✅ plugin-context.js 加载完成');