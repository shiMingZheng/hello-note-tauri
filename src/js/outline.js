// src/js/outline.js
'use strict';

import { appState } from './core/AppState.js';
import { eventBus } from './core/EventBus.js';
import { milkdownEditor } from './milkdown-editor.js'; // 需要访问编辑器实例
import { domElements } from './dom-init.js'; // 需要访问 DOM

console.log('📜 outline.js 开始加载...');

class OutlineManager {
    constructor() {
        if (OutlineManager.instance) {
            return OutlineManager.instance;
        }
        this.outlinePopover = null;
        this.outlineList = null;
        this.isVisible = false;
        this.currentOutlineData = []; // 存储当前大纲数据

        OutlineManager.instance = this;
    }

    /**
     * 初始化大纲模块
     */
    init() {
        // 获取 DOM 引用 (假设它们已在 dom-init.js 中定义并初始化)
        this.outlinePopover = domElements.outlinePopover; // 需要在 index.html 和 dom-init.js 添加
        this.outlineList = domElements.outlineList;     // 需要在 index.html 和 dom-init.js 添加

        if (!this.outlinePopover || !this.outlineList) {
            console.warn('⚠️ 大纲面板或列表元素未找到 (outlinePopover, outlineList)');
            return;
        }

        // 监听事件
        eventBus.on('outline:toggle-visibility', () => this.toggleVisibility());
        eventBus.on('outline:updated', (outlineData) => this.handleOutlineUpdate(outlineData));
        // 当标签页切换时，如果大纲是可见的，尝试更新；如果切换到home，则清空
        eventBus.on('tab:switch', (tabId) => {
            if (tabId === 'home') {
                this.clearOutline();
                if (this.isVisible) this.hide(); // 如果在首页，隐藏大纲
            } else if (this.isVisible) {
                // 如果切换到笔记标签页且大纲可见，请求编辑器发送最新大纲
                 eventBus.emit('outline:request-update');
            }
        });

        // 点击大纲项跳转
        this.outlineList.addEventListener('click', (e) => {
            const target = e.target.closest('.outline-item');
            if (target && target.dataset.pos) {
                const pos = parseInt(target.dataset.pos, 10);
                if (!isNaN(pos)) {
                    console.log(`🚀 跳转到位置: ${pos}`);
                    eventBus.emit('editor:scroll-to-pos', pos); // 发送跳转事件给编辑器
                    // this.hide(); // 点击后可以选择隐藏大纲面板
                }
            }
        });

        console.log('✅ 大纲模块初始化完成');
    }

    /**
     * 处理从编辑器接收到的大纲数据
     * @param {Array} outlineData - [{ level: number, text: string, pos: number }, ...]
     */
    handleOutlineUpdate(outlineData) {
        console.log('🔄 收到大纲更新数据:', outlineData);
        this.currentOutlineData = outlineData || [];
        // 只有当面板可见时才立即渲染
        if (this.isVisible) {
            this.renderOutline();
        }
    }

    /**
     * 渲染大纲列表
     */
    renderOutline() {
        if (!this.outlineList) return;

        this.outlineList.innerHTML = ''; // 清空旧列表

        if (this.currentOutlineData.length === 0) {
            this.outlineList.innerHTML = '<li class="outline-empty">无大纲</li>';
            return;
        }

        const fragment = document.createDocumentFragment();
        this.currentOutlineData.forEach(item => {
            const li = document.createElement('li');
            li.className = `outline-item outline-item-h${item.level}`;
            li.textContent = item.text;
            li.dataset.pos = item.pos; // 存储位置信息
            li.style.paddingLeft = `${(item.level - 1) * 15}px`; // 根据级别缩进
            li.title = `跳转到 "${item.text}"`;
            fragment.appendChild(li);
        });
        this.outlineList.appendChild(fragment);
        console.log('✅ 大纲列表已渲染');
    }

    /**
     * 清空大纲
     */
     clearOutline() {
        this.currentOutlineData = [];
        if (this.outlineList) {
            this.outlineList.innerHTML = '<li class="outline-empty">无大纲</li>';
        }
    }


    /**
     * 切换大纲面板的可见性
     */
    toggleVisibility() {
        if (this.isVisible) {
            this.hide();
        } else {
            // 只有当当前有活动文件时才显示大纲
            if (appState.activeFilePath && appState.activeFilePath !== 'home') {
                this.show();
            } else {
                console.log('ℹ️ 首页或无活动文件，不显示大纲');
            }
        }
    }

    /**
     * 显示大纲面板
     */
    show() {
        if (!this.outlinePopover) return;
        // 在显示前确保渲染的是最新的大纲
        this.renderOutline();
        this.outlinePopover.style.display = 'block';
        this.isVisible = true;
        console.log('⬆️ 显示大纲面板');
    }

    /**
     * 隐藏大纲面板
     */
    hide() {
        if (!this.outlinePopover) return;
        this.outlinePopover.style.display = 'none';
        this.isVisible = false;
        console.log('⬇️ 隐藏大纲面板');
    }
}

// 创建单例
const outlineManager = new OutlineManager();

// ES Module 导出
export { outlineManager };