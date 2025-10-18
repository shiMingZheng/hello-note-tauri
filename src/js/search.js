// src/js/search.js
// 搜索功能独立模块

'use strict';

import { appState } from './core/AppState.js';
import { invoke } from './core/TauriAPI.js';
import { domElements } from './dom-init.js';
import { showError } from './ui-utils.js';
import { eventBus } from './core/EventBus.js';

console.log('📜 search.js 开始加载...');

const SEARCH_INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5分钟

/**
 * 搜索管理器类
 */
class SearchManager {
    constructor() {
        if (SearchManager.instance) {
            return SearchManager.instance;
        }
        
        this.searchInactivityTimer = null;
        
        SearchManager.instance = this;
    }
    
    /**
     * 初始化搜索模块
     */
    init() {
        console.log('🎯 初始化搜索模块...');
        
        // 绑定事件
        if (domElements.searchInput) {
            domElements.searchInput.addEventListener('input', this.debounce(() => this.handleSearch(), 300));
        }
        
        if (domElements.clearSearchBtn) {
            domElements.clearSearchBtn.addEventListener('click', () => this.clearSearch());
        }
        
        console.log('✅ 搜索模块初始化完成');
    }
    
    /**
     * 防抖函数
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    /**
     * 重置搜索不活动计时器
     */
    resetSearchInactivityTimer() {
        if (this.searchInactivityTimer) {
            clearTimeout(this.searchInactivityTimer);
        }
        
        this.searchInactivityTimer = setTimeout(() => {
            invoke('release_index').catch(err => console.error('释放索引失败:', err));
        }, SEARCH_INACTIVITY_TIMEOUT);
    }
    
    /**
     * 执行搜索
     */
    async handleSearch() {
        this.resetSearchInactivityTimer();
        
        const query = domElements.searchInput?.value.trim();
        
        if (!query) {
            this.clearSearch();
            return;
        }
        
        if (!appState.rootPath) {
            showError('请先打开一个文件夹再进行搜索。');
            return;
        }
        
        if (domElements.clearSearchBtn) {
            domElements.clearSearchBtn.style.display = 'block';
        }
        
        try {
            appState.isSearching = true;
            
            // 确保索引已加载
            await invoke('ensure_index_is_loaded', { rootPath: appState.rootPath });
            
            // 执行搜索
            const results = await invoke('search_notes', { query });
            
            // 显示结果
            this.displaySearchResults(results);
            
        } catch (error) {
            console.error('❌ 搜索失败:', error);
            showError('搜索失败: ' + error);
        } finally {
            appState.isSearching = false;
        }
    }
    
    /**
     * 显示搜索结果
     */
    displaySearchResults(results) {
        if (!domElements.searchResultsList) return;
        
        domElements.searchResultsList.innerHTML = '';
        
        if (results.length === 0) {
            domElements.searchResultsList.innerHTML = '<li style="padding: 10px; color: #999;">没有找到相关笔记</li>';
        } else {
            results.forEach(result => {
                const li = document.createElement('li');
                li.style.cssText = 'padding: 10px; cursor: pointer;';
                
                const snippetHTML = result.snippet || '';
                
                li.innerHTML = `
                    <div class="search-result-title">${result.title}</div>
                    <div class="search-result-snippet">${snippetHTML}</div>
                `;
                
                li.addEventListener('click', () => {
                    console.log('🔍 点击搜索结果:', result.path);
                    eventBus.emit('open-tab', result.path);
                    this.clearSearch();
                });
                
                domElements.searchResultsList.appendChild(li);
            });
        }
        
        // 显示/隐藏相关元素
        if (domElements.fileListElement) {
            domElements.fileListElement.style.display = 'none';
        }
        if (domElements.searchResultsList) {
            domElements.searchResultsList.style.display = 'block';
        }
    }
    
    /**
     * 清除搜索
     */
    clearSearch() {
        this.resetSearchInactivityTimer();
        
        if (domElements.searchInput) {
            domElements.searchInput.value = '';
        }
        
        if (domElements.clearSearchBtn) {
            domElements.clearSearchBtn.style.display = 'none';
        }
        
        if (domElements.searchResultsList) {
            domElements.searchResultsList.style.display = 'none';
        }
        
        if (domElements.fileListElement) {
            domElements.fileListElement.style.display = 'block';
        }
        
        appState.searchQuery = '';
        appState.isSearching = false;
        
        console.log('🧹 搜索已清除');
    }
}

// 创建单例
const searchManager = new SearchManager();

// ES Module 导出
export {
    searchManager
};

// 导出便捷函数
export const handleSearch = () => searchManager.handleSearch();
export const clearSearch = () => searchManager.clearSearch();

console.log('✅ search.js 加载完成');
