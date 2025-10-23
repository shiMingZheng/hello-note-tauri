// src/js/links.js

'use strict';
// [重构] 步骤 2: 导入 eventBus 和 tabManager
import { eventBus } from './core/EventBus.js';
import { tabManager } from './tab_manager.js';
import { invoke } from './core/TauriAPI.js';
console.log('📜 links.js 开始加载...');

let backlinksListElement;

function initializeLinks() {
    backlinksListElement = document.getElementById('backlinks-list');
}

async function updateBacklinksUI(relativePath) {
    if (!backlinksListElement) return;

    if (!relativePath || relativePath.startsWith('untitled-')) {
        backlinksListElement.innerHTML = '<li class="no-tags-info">无反向链接</li>';
        return;
    }

    try {
        const backlinks = await invoke('get_backlinks', { relativePath });
        
        backlinksListElement.innerHTML = '';
        if (backlinks.length === 0) {
            backlinksListElement.innerHTML = '<li class="no-tags-info">无反向链接</li>';
            return;
        }

        backlinks.forEach(link => {
            const li = document.createElement('li');
            li.textContent = link.title;
            li.title = link.path;
            li.addEventListener('click', () => {
                tabManager.openTab(link.path);
            });
            backlinksListElement.appendChild(li);
        });

    } catch (error) {
        console.error(`获取反向链接失败:`, error);
        backlinksListElement.innerHTML = '<li class="no-tags-info">加载失败</li>';
    }
}

// ES Module 导出
export {
    initializeLinks
};

// [重构] 步骤 2: 添加事件订阅
// 监听来自 tab_manager.js 的事件
eventBus.on('ui:updateBacklinks', (relativePath) => {
    updateBacklinksUI(relativePath);
});