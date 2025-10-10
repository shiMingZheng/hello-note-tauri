// src/js/plugin-context.js
// CheetahNote 插件上下文 API

'use strict';
console.log('📜 plugin-context.js 开始加载...');

/**
 * 插件上下文
 * 为插件提供访问应用功能的 API
 */
class PluginContext {
    constructor() {
        this.menuItems = new Map(); // 插件添加的菜单项
    }

    /**
     * 编辑器 API
     */
    editor = {
        /**
         * 获取当前编辑器内容
         * @returns {string} Markdown 内容
         */
        getContent() {
            if (!window.milkdownEditor) {
                console.warn('⚠️ 编辑器未初始化');
                return '';
            }
            return window.milkdownEditor.getMarkdown();
        },

        /**
         * 设置编辑器内容
         * @param {string} content - Markdown 内容
         */
        async setContent(content) {
            if (!window.milkdownEditor) {
                console.warn('⚠️ 编辑器未初始化');
                return;
            }
            await window.milkdownEditor.loadContent(content);
        },

        /**
         * 在光标位置插入文本
         * @param {string} text - 要插入的文本
         */
        insertText(text) {
            if (!window.milkdownEditor || !window.milkdownEditor.editor) {
                console.warn('⚠️ 编辑器未初始化');
                return;
            }

            try {
                const currentContent = this.getContent();
                const newContent = currentContent + '\n' + text;
                window.milkdownEditor.loadContent(newContent);
            } catch (error) {
                console.error('❌ 插入文本失败:', error);
            }
        },

        /**
         * 插入图片
         * @param {string} url - 图片路径或 URL
         * @param {string} alt - 图片描述（可选）
         */
        insertImage(url, alt = '图片') {
            const imageMarkdown = `![${alt}](${url})`;
            this.insertText(imageMarkdown);
        },

        /**
         * 获取当前选中的文本
         * @returns {string} 选中的文本
         */
        getSelection() {
            // TODO: 实现获取选中文本的逻辑
            return '';
        }
    };

    /**
     * UI API
     */
    ui = {
        /**
         * 显示提示消息
         * @param {string} message - 消息内容
         */
        showToast(message) {
            if (window.showSuccessMessage) {
                window.showSuccessMessage(message);
            } else {
                console.log('📢', message);
            }
        },

        /**
         * 显示错误消息
         * @param {string} message - 错误消息
         */
        showError(message) {
            if (window.showError) {
                window.showError(message);
            } else {
                console.error('❌', message);
            }
        },

        /**
         * 打开模态窗口
         * @param {string} url - 模态窗口的 HTML 文件路径
         * @param {Object} data - 传递给模态窗口的数据
         * @returns {Promise<any>} 模态窗口返回的结果
         */
        async openModal(url, data = {}) {
            return new Promise((resolve) => {
                // 创建模态窗口容器
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
                    width: 90%;
                    height: 90%;
                    max-width: 1200px;
                    max-height: 800px;
                    border: none;
                    border-radius: 8px;
                    background: white;
                `;

                overlay.appendChild(iframe);
                document.body.appendChild(overlay);

                // 传递数据到 iframe
                iframe.onload = () => {
                    iframe.contentWindow.postMessage({
                        type: 'PLUGIN_DATA',
                        data: data
                    }, '*');
                };

                // 监听 iframe 返回结果
                const handleMessage = (event) => {
                    if (event.data.type === 'PLUGIN_RESULT') {
                        document.body.removeChild(overlay);
                        window.removeEventListener('message', handleMessage);
                        resolve(event.data.result);
                    }
                };

                window.addEventListener('message', handleMessage);

                // 点击遮罩层关闭
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) {
                        document.body.removeChild(overlay);
                        window.removeEventListener('message', handleMessage);
                        resolve(null);
                    }
                });
            });
        },

        /**
         * 显示确认对话框
         * @param {string} title - 标题
         * @param {string} message - 消息
         * @returns {Promise<boolean>} 用户是否确认
         */
        async confirm(title, message) {
            if (window.showCustomConfirm) {
                return await window.showCustomConfirm(title, message);
            }
            return window.confirm(message);
        }
    };

    /**
     * 菜单 API
     */
    menu = {
        /**
         * 添加菜单项
         * @param {string} location - 菜单位置（'tools' 等）
         * @param {Object} item - 菜单项配置
         */
        addItem(location, item) {
            const menuId = `plugin-menu-${item.id}`;
            
            // 查找目标菜单容器
            let menuContainer;
            
            if (location === 'tools') {
                // 在工具栏添加按钮
                menuContainer = document.querySelector('.sidebar-header-actions');
            } else if (location === 'header') {
                // 在顶部标题栏添加按钮
                menuContainer = document.querySelector('.main-header-actions');
            }

            if (!menuContainer) {
                console.warn(`⚠️ 未找到菜单容器: ${location}`);
                return;
            }

            // 创建菜单按钮
            const button = document.createElement('button');
            button.id = menuId;
            button.className = 'icon-btn plugin-menu-item';
            button.textContent = item.label;
            button.title = item.label;
            
            if (item.accelerator) {
                button.title += ` (${item.accelerator})`;
            }

            button.addEventListener('click', item.onClick);

            // 添加到容器
            menuContainer.appendChild(button);

            // 记录菜单项
            window.pluginManager.context.menuItems.set(menuId, {
                element: button,
                location: location
            });

            // 注册快捷键
            if (item.accelerator) {
                this.registerShortcut(item.accelerator, item.onClick);
            }

            console.log(`✅ 菜单项已添加: ${item.label}`);
        },

        /**
         * 移除菜单项
         * @param {string} id - 菜单项 ID
         */
        removeItem(id) {
            const menuId = `plugin-menu-${id}`;
            const menuItem = window.pluginManager.context.menuItems.get(menuId);

            if (menuItem) {
                menuItem.element.remove();
                window.pluginManager.context.menuItems.delete(menuId);
                console.log(`✅ 菜单项已移除: ${id}`);
            }
        },

        /**
         * 注册快捷键
         * @param {string} accelerator - 快捷键（如 'Ctrl+Shift+A'）
         * @param {Function} callback - 回调函数
         */
        registerShortcut(accelerator, callback) {
            const keys = accelerator.toLowerCase().split('+');
            
            document.addEventListener('keydown', (e) => {
                const ctrl = keys.includes('ctrl') || keys.includes('control');
                const shift = keys.includes('shift');
                const alt = keys.includes('alt');
                const meta = keys.includes('meta') || keys.includes('cmd');
                const key = keys[keys.length - 1];

                if (
                    (ctrl ? e.ctrlKey : true) &&
                    (shift ? e.shiftKey : !e.shiftKey) &&
                    (alt ? e.altKey : !e.altKey) &&
                    (meta ? e.metaKey : !e.metaKey) &&
                    e.key.toLowerCase() === key
                ) {
                    e.preventDefault();
                    callback();
                }
            });

            console.log(`✅ 快捷键已注册: ${accelerator}`);
        }
    };

    /**
     * 工作区 API
     */
    workspace = {
        /**
         * 获取当前工作区根路径
         * @returns {string|null} 根路径
         */
        getRootPath() {
            return window.appState?.rootPath || null;
        },

        /**
         * 获取当前激活的文件路径
         * @returns {string|null} 文件路径
         */
        getActiveFile() {
            return window.appState?.activeFilePath || null;
        },

        /**
         * 获取应用状态
         * @returns {Object} 应用状态
         */
        getAppState() {
            return window.appState || {};
        }
    };

    /**
     * 调用 Tauri 命令
     * @param {string} command - 命令名称
     * @param {Object} args - 命令参数
     * @returns {Promise<any>} 命令结果
     */
    async invoke(command, args = {}) {
        if (!window.__TAURI__) {
            throw new Error('Tauri API 不可用');
        }

        try {
            return await window.__TAURI__.core.invoke(command, args);
        } catch (error) {
            console.error(`❌ 调用命令失败: ${command}`, error);
            throw error;
        }
    }
}

// 创建全局插件上下文实例
const pluginContext = new PluginContext();

// 导出到全局
window.pluginContext = pluginContext;

console.log('✅ plugin-context.js 加载完成');