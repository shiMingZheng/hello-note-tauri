// src/js/tag_modal.js

'use strict';
console.log('📜 tag_modal.js 开始加载...');

let modalOverlay, addTagBtn, closeModalBtn, doneBtn, cancelBtn, searchInput;
let allTagsContainer, currentTagsContainer;

// 临时存储状态
let tempSelectedTags = new Set();
let allAvailableTags = [];

const tagModal = {
    init() {
        modalOverlay = document.getElementById('tag-modal-overlay');
        addTagBtn = document.getElementById('add-tag-btn');
        closeModalBtn = document.getElementById('tag-modal-close-btn');
        doneBtn = document.getElementById('tag-modal-done-btn');
        cancelBtn = document.getElementById('tag-modal-cancel-btn');
        searchInput = document.getElementById('tag-modal-search-input');
        allTagsContainer = document.getElementById('tag-modal-all-tags');
        currentTagsContainer = document.getElementById('tag-modal-current-tags');

        addTagBtn.addEventListener('click', this.open);
        closeModalBtn.addEventListener('click', this.close);
        cancelBtn.addEventListener('click', this.close);
        doneBtn.addEventListener('click', this.handleDone);
        searchInput.addEventListener('keyup', this.handleSearch);
    },

    async open() {
        if (!appState.activeFilePath) return;

        // 获取最新数据
        const [currentTags, allTags] = await Promise.all([
            invoke('get_tags_for_file', { path: appState.activeFilePath }),
            invoke('get_all_tags')
        ]);
        
        appState.currentFileTags = currentTags;
        appState.allTags = allTags;
        allAvailableTags = allTags.map(t => t.name);
        tempSelectedTags = new Set(currentTags);

        tagModal.render();
        modalOverlay.style.display = 'flex';
        searchInput.focus();
    },

    close() {
        modalOverlay.style.display = 'none';
    },

    render(filter = '') {
        // 渲染当前文件的标签
        currentTagsContainer.innerHTML = '';
        tempSelectedTags.forEach(tagName => {
            const pill = this.createPill(tagName, true);
            currentTagsContainer.appendChild(pill);
        });

        // 渲染所有可选标签
        allTagsContainer.innerHTML = '';
        const filteredTags = allAvailableTags.filter(tagName => 
            tagName.includes(filter.toLowerCase()) && !tempSelectedTags.has(tagName)
        );

        filteredTags.forEach(tagName => {
            const pill = this.createPill(tagName, false);
            allTagsContainer.appendChild(pill);
        });
    },

    createPill(tagName, isSelected) {
        const pill = document.createElement('div');
        pill.className = 'tag-pill';
        pill.textContent = tagName;
        pill.dataset.tagName = tagName;
        if (isSelected) {
            pill.classList.add('selected');
        }
        pill.addEventListener('click', () => this.handlePillClick(tagName));
        return pill;
    },

    handlePillClick(tagName) {
        if (tempSelectedTags.has(tagName)) {
            tempSelectedTags.delete(tagName);
        } else {
            tempSelectedTags.add(tagName);
        }
        this.render(searchInput.value);
    },
    
    handleSearch(e) {
        const query = searchInput.value.trim();
        if (e.key === 'Enter' && query) {
            // 创建新标签
            tagModal.handlePillClick(query.toLowerCase());
            searchInput.value = '';
            tagModal.render('');
        } else {
            tagModal.render(query);
        }
    },

    async handleDone() {
        const originalTags = new Set(appState.currentFileTags);
        const newTags = tempSelectedTags;

        const tagsToAdd = [...newTags].filter(t => !originalTags.has(t));
        const tagsToRemove = [...originalTags].filter(t => !newTags.has(t));

        try {
            // 并行处理所有标签变更
            await Promise.all([
                ...tagsToAdd.map(tagName => invoke('add_tag_to_file', { path: appState.activeFilePath, tagName })),
                ...tagsToRemove.map(tagName => invoke('remove_tag_from_file', { path: appState.activeFilePath, tagName }))
            ]);
            
            appState.currentFileTags = [...newTags].sort();
            console.log('✅ 标签更新成功');
            // 可以在这里刷新侧边栏标签列表
            if(window.refreshAllTagsList) refreshAllTagsList();
        } catch (error) {
            console.error('更新标签失败:', error);
            showError('更新标签失败: ' + error);
        } finally {
            tagModal.close();
        }
    }
};

document.addEventListener('DOMContentLoaded', () => tagModal.init());
window.tagModal = tagModal;