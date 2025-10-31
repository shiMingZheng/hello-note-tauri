// src/js/outline.js
'use strict';

import { appState } from './core/AppState.js';
import { eventBus } from './core/EventBus.js';

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
        // 获取 DOM 引用
        this.outlinePopover = domElements.outlinePopover;
        this.outlineList = domElements.outlineList;
        this.backButton = document.getElementById('outline-back-btn');

        if (!this.outlinePopover || !this.outlineList || !this.backButton) {
            console.warn('⚠️ 大纲面板、列表或返回按钮元素未找到');
            return;
        }

        // 监听事件
        eventBus.on('outline:toggle-visibility', () => this.toggleVisibility());
        eventBus.on('outline:updated', (outlineData) => this.handleOutlineUpdate(outlineData));
        
        eventBus.on('tab:switch', (tabId) => {
            if (tabId === 'home') {
                this.clearOutline();
                if (this.isVisible) this.hide();
            } else if (this.isVisible) {
                 // ⭐ 改造：现在由 codemirror-editor.js 负责响应
                 eventBus.emit('outline:request-update');
            }
        });

        this.backButton.addEventListener('click', () => {
            this.hide();
            console.log('◀️ 点击了大纲返回按钮');
        });

        // 点击大纲项跳转
        this.outlineList.addEventListener('click', (e) => {
            const target = e.target.closest('.outline-item');
            // ⭐ 改造：现在使用 pos (character position) 而不是 line
            if (target && target.dataset.pos) {
                const pos = parseInt(target.dataset.pos, 10);
                if (!isNaN(pos)) {
                    console.log(`🚀 跳转到位置: ${pos}`);
                    eventBus.emit('editor:scroll-to-pos', pos);
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
        if (this.isVisible) {
            this.renderOutline();
        }
    }

    /**
     * 渲染大纲列表
     */
    renderOutline() {
        if (!this.outlineList) return;

        this.outlineList.innerHTML = '';

        if (this.currentOutlineData.length === 0) {
            this.outlineList.innerHTML = '<li class="outline-empty">无大纲</li>';
            return;
        }

        const fragment = document.createDocumentFragment();
        this.currentOutlineData.forEach(item => {
            const li = document.createElement('li');
            li.className = `outline-item outline-item-h${item.level}`;
            li.textContent = item.text;
            li.dataset.pos = item.pos; // ⭐ 改造：存储位置信息
            li.style.paddingLeft = `${(item.level - 1) * 15}px`;
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
        // ⭐ 改造：显示时主动请求一次大纲
        eventBus.emit('outline:request-update');
        this.renderOutline(); // (即使是旧数据也先渲染)
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
		
        if (domElements.fileViewContainer) {
             domElements.fileViewContainer.style.display = 'block';
		}
		if (domElements.searchResultsList) {
            if(domElements.searchResultsList.style.display === 'block'){
               domElements.searchResultsList.style.display = 'none';
            }
        }
    }
}

// 创建单例
const outlineManager = new OutlineManager();

// ES Module 导出
export { outlineManager };