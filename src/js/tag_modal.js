// src/js/tag_modal.js
'use strict';

import { appState } from './core/AppState.js';
import { sidebar } from './sidebar.js';
import { showError, showSuccessMessage } from './ui-utils.js';
import { invoke } from './core/TauriAPI.js';

console.log('📜 tag_modal.js 开始加载...');



class TagModal {
    constructor() {
        if (TagModal.instance) {
            return TagModal.instance;
        }
        
        // DOM 元素引用
        this.modalOverlay = null;
        this.manageTagsBtn = null;
        this.closeModalBtn = null;
        this.doneBtn = null;
        this.cancelBtn = null;
        this.tagModalSearchInput = null;
        this.allTagsContainer = null;
        this.currentTagsContainer = null;
        
        // 临时状态
        this.tempSelectedTags = new Set();
        this.allAvailableTags = [];
        
        TagModal.instance = this;
    }
    
    /**
     * 初始化标签弹窗
     */
    init() {
        console.log('🎯 初始化标签弹窗模块...');
        
        this.modalOverlay = document.getElementById('tag-modal-overlay');
        this.manageTagsBtn = document.getElementById('manage-tags-btn');
        this.closeModalBtn = document.getElementById('tag-modal-close-btn');
        this.doneBtn = document.getElementById('tag-modal-done-btn');
        this.cancelBtn = document.getElementById('tag-modal-cancel-btn');
        this.tagModalSearchInput = document.getElementById('tag-modal-search-input');
        this.allTagsContainer = document.getElementById('tag-modal-all-tags');
        this.currentTagsContainer = document.getElementById('tag-modal-current-tags');
        
        if (!this.modalOverlay || !this.manageTagsBtn) {
            console.error('❌ 标签弹窗元素未找到');
            return;
        }
        
        // 绑定事件
        this.manageTagsBtn.addEventListener('click', () => this.open());
        this.closeModalBtn.addEventListener('click', () => this.close());
        this.cancelBtn.addEventListener('click', () => this.close());
        this.doneBtn.addEventListener('click', () => this.handleDone());
        this.tagModalSearchInput.addEventListener('keyup', (e) => this.handleSearch(e));
        
        console.log('✅ 标签弹窗模块初始化完成');
    }
    
    /**
     * 打开标签弹窗
     */
    async open() {
        console.log('🔓 尝试打开标签弹窗...');
        
        if (!appState.activeFilePath) {
            showError('请先打开一个笔记');
            return;
        }
        
        if (appState.activeFilePath.startsWith('untitled-')) {
            showError('请先保存当前笔记');
            return;
        }
        
        // 初始化临时选择集
        this.tempSelectedTags = new Set(appState.currentFileTags);
        
        // 加载所有可用标签
        try {
            this.allAvailableTags = await invoke('get_all_tags');
            console.log('📋 加载了', this.allAvailableTags.length, '个标签');
        } catch (error) {
            console.error('❌ 加载标签失败:', error);
            this.allAvailableTags = [];
        }
        
        // 渲染标签列表
        this.renderCurrentTags();
        this.renderAllTags();
        
        // 显示弹窗
        this.modalOverlay.style.display = 'flex';
        this.tagModalSearchInput.value = '';
        this.tagModalSearchInput.focus();
        
        console.log('✅ 标签弹窗已打开');
    }
    
    /**
     * 关闭标签弹窗
     */
    close() {
        this.modalOverlay.style.display = 'none';
        console.log('🔒 标签弹窗已关闭');
    }
    
    /**
     * 渲染当前文件的标签
     */
    renderCurrentTags() {
        this.currentTagsContainer.innerHTML = '';
        
        if (this.tempSelectedTags.size === 0) {
            this.currentTagsContainer.innerHTML = '<span class="no-tags-hint">暂无标签</span>';
            return;
        }
        
        this.tempSelectedTags.forEach(tagName => {
            const pill = document.createElement('span');
            pill.className = 'tag-pill selected';
            pill.textContent = tagName;
            
            const removeBtn = document.createElement('span');
            removeBtn.className = 'tag-remove-btn';
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', () => this.removeTag(tagName));
            
            pill.appendChild(removeBtn);
            this.currentTagsContainer.appendChild(pill);
        });
    }
    
    /**
     * 渲染所有可用标签
     */
    renderAllTags(filterText = '') {
        this.allTagsContainer.innerHTML = '';
        
        const filtered = this.allAvailableTags.filter(tag => 
            tag.name.toLowerCase().includes(filterText.toLowerCase())
        );
        
        if (filtered.length === 0 && filterText) {
            const createHint = document.createElement('div');
            createHint.className = 'create-tag-hint';
            createHint.textContent = `按 Enter 创建新标签 "${filterText}"`;
            this.allTagsContainer.appendChild(createHint);
            return;
        }
        
        filtered.forEach(tag => {
            const pill = document.createElement('span');
            pill.className = 'tag-pill';
            
            if (this.tempSelectedTags.has(tag.name)) {
                pill.classList.add('selected');
            }
            
            pill.textContent = `${tag.name} (${tag.count})`;
            pill.addEventListener('click', () => this.toggleTag(tag.name));
            
            this.allTagsContainer.appendChild(pill);
        });
    }
    
    /**
     * 处理搜索
     */
    handleSearch(e) {
        const query = e.target.value.trim();
        
        if (e.key === 'Enter' && query) {
            // 创建新标签
            this.addTag(query);
            e.target.value = '';
            return;
        }
        
        this.renderAllTags(query);
    }
    
    /**
     * 添加标签
     */
    addTag(tagName) {
        if (!tagName || this.tempSelectedTags.has(tagName)) {
            return;
        }
        
        this.tempSelectedTags.add(tagName);
        
        // 如果是新标签,添加到可用标签列表
        if (!this.allAvailableTags.find(t => t.name === tagName)) {
            this.allAvailableTags.push({ name: tagName, count: 0 });
        }
        
        this.renderCurrentTags();
        this.renderAllTags();
    }
    
    /**
     * 移除标签
     */
    removeTag(tagName) {
        this.tempSelectedTags.delete(tagName);
        this.renderCurrentTags();
        this.renderAllTags();
    }
    
    /**
     * 切换标签选择状态
     */
    toggleTag(tagName) {
        if (this.tempSelectedTags.has(tagName)) {
            this.removeTag(tagName);
        } else {
            this.addTag(tagName);
        }
    }
    
    /**
     * 完成编辑
     */
    async handleDone() {
        console.log('💾 保存标签变更...');
        
        const originalTags = new Set(appState.currentFileTags);
        const newTags = this.tempSelectedTags;
        
        const tagsToAdd = [...newTags].filter(t => !originalTags.has(t));
        const tagsToRemove = [...originalTags].filter(t => !newTags.has(t));
        
        console.log('  ➕ 需要添加:', tagsToAdd);
        console.log('  ➖ 需要移除:', tagsToRemove);
        
        if (tagsToAdd.length === 0 && tagsToRemove.length === 0) {
            console.log('  ℹ️ 没有变更，直接关闭');
            this.close();
            return;
        }
        
        try {
            // 并行处理所有标签变更
            await Promise.all([
                ...tagsToAdd.map(tagName => 
                    invoke('add_tag_to_file', { 
                        relativePath: appState.activeFilePath, 
                        tagName 
                    }).then(() => console.log(`    ✅ 已添加: ${tagName}`))
                ),
                ...tagsToRemove.map(tagName => 
                    invoke('remove_tag_from_file', { 
                        relativePath: appState.activeFilePath, 
                        tagName 
                    }).then(() => console.log(`    ✅ 已移除: ${tagName}`))
                )
            ]);
            
            appState.currentFileTags = [...newTags].sort();
            console.log('✅ 标签更新成功');
            
            // 刷新侧边栏显示
            sidebar.updateCurrentFileTagsUI(appState.activeFilePath);
            sidebar.refreshAllTagsList();
            
            showSuccessMessage('标签已保存');
        } catch (error) {
            console.error('❌ 更新标签失败:', error);
            showError('更新标签失败: ' + error);
        } finally {
            this.close();
        }
    }
}

// 创建单例
const tagModal = new TagModal();



// ES Module 导出
export {
    tagModal
};

// 为了兼容性,也导出初始化函数
export function initializeTagModal() {
    if (tagModal.modalOverlay) {
        return;
    }
    tagModal.init();
}

console.log('✅ tag_modal.js 加载完成');