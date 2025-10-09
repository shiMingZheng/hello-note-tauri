// src/js/tag_modal.js

'use strict';
console.log('📜 tag_modal.js 开始加载...');

// [修改] 重命名变量以避免冲突
let modalOverlay, manageTagsBtn, closeModalBtn, doneBtn, cancelBtn, tagModalSearchInput; 
let allTagsContainer, currentTagsContainer;

// 临时存储状态
let tempSelectedTags = new Set();
let allAvailableTags = [];

const tagModal = {
    init() {
        console.log('🎯 初始化标签弹窗模块...');
        
        modalOverlay = document.getElementById('tag-modal-overlay');
        manageTagsBtn = document.getElementById('manage-tags-btn');
        closeModalBtn = document.getElementById('tag-modal-close-btn');
        doneBtn = document.getElementById('tag-modal-done-btn');
        cancelBtn = document.getElementById('tag-modal-cancel-btn');
        tagModalSearchInput = document.getElementById('tag-modal-search-input');
        allTagsContainer = document.getElementById('tag-modal-all-tags');
        currentTagsContainer = document.getElementById('tag-modal-current-tags');

        // [修复] 检查元素是否存在
        if (!modalOverlay) {
            console.error('❌ 未找到标签弹窗元素 #tag-modal-overlay');
            return;
        }

        if (!manageTagsBtn) {
            console.error('❌ 未找到管理标签按钮 #manage-tags-btn');
            return;
        }

        // 绑定事件
        manageTagsBtn.addEventListener('click', () => {
            console.log('🏷️ 点击管理标签按钮');
            this.open();
        });
        
        closeModalBtn.addEventListener('click', () => this.close());
        cancelBtn.addEventListener('click', () => this.close());
        doneBtn.addEventListener('click', () => this.handleDone());
        tagModalSearchInput.addEventListener('keyup', (e) => this.handleSearch(e));
        
        console.log('✅ 标签弹窗模块初始化完成');
    },

    async open() {
        console.log('🔓 尝试打开标签弹窗...');
        console.log('📋 当前激活文件:', appState.activeFilePath);
        
        if (!appState.activeFilePath) {
            showError('请先打开一个笔记');
            return;
        }

        // [修复] 检查文件路径是否有效（排除临时标签页）
        if (appState.activeFilePath.startsWith('untitled-')) {
            showError('请先保存当前笔记');
            return;
        }

        try {
            console.log('📡 请求获取标签数据...');
            
            // 获取最新数据
            const [currentTags, allTags] = await Promise.all([
                invoke('get_tags_for_file', { relativePath: appState.activeFilePath }),
                invoke('get_all_tags')
            ]);
            
            console.log('✅ 获取到当前文件标签:', currentTags);
            console.log('✅ 获取到所有标签:', allTags);
            
            appState.currentFileTags = currentTags;
            appState.allTags = allTags;
            allAvailableTags = allTags.map(t => t.name);
            tempSelectedTags = new Set(currentTags);

            this.render();
            modalOverlay.style.display = 'flex';
            
            // [修复] 使用正确的变量名
            tagModalSearchInput.focus();
            
            console.log('✅ 标签弹窗已打开');
        } catch (error) {
            console.error('❌ 加载标签数据失败:', error);
            showError('加载标签数据失败: ' + error);
        }
    },

    close() {
        console.log('🔒 关闭标签弹窗');
        modalOverlay.style.display = 'none';
        tagModalSearchInput.value = '';
    },

    render(filter = '') {
        console.log('🎨 渲染标签弹窗内容，过滤词:', filter);
        
        // 渲染当前文件的标签
        currentTagsContainer.innerHTML = '';
        if (tempSelectedTags.size === 0) {
            currentTagsContainer.innerHTML = '<p style="color: #999; font-size: 13px; padding: 10px;">暂无标签</p>';
        } else {
            tempSelectedTags.forEach(tagName => {
                const pill = this.createPill(tagName, true);
                currentTagsContainer.appendChild(pill);
            });
        }

        // 渲染所有可选标签
        allTagsContainer.innerHTML = '';
        const filteredTags = allAvailableTags.filter(tagName => 
            tagName.toLowerCase().includes(filter.toLowerCase()) && !tempSelectedTags.has(tagName)
        );

        if (filteredTags.length === 0 && filter) {
            allTagsContainer.innerHTML = `<p style="color: #999; font-size: 13px; padding: 10px;">按 Enter 创建新标签 "${filter}"</p>`;
        } else if (filteredTags.length === 0) {
            allTagsContainer.innerHTML = '<p style="color: #999; font-size: 13px; padding: 10px;">暂无其他标签</p>';
        } else {
            filteredTags.forEach(tagName => {
                const pill = this.createPill(tagName, false);
                allTagsContainer.appendChild(pill);
            });
        }
        
        console.log(`  当前已选: ${tempSelectedTags.size} 个`);
        console.log(`  可选标签: ${filteredTags.length} 个`);
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
        console.log('🖱️ 点击标签:', tagName);
        
        if (tempSelectedTags.has(tagName)) {
            tempSelectedTags.delete(tagName);
            console.log('  ➖ 取消选择');
        } else {
            tempSelectedTags.add(tagName);
            console.log('  ➕ 选择');
        }
        
        // [修复] 使用正确的变量名
        this.render(tagModalSearchInput.value);
    },
    
    handleSearch(e) {
        const query = tagModalSearchInput.value.trim();
        
        if (e.key === 'Enter' && query) {
            console.log('✨ 创建/选择新标签:', query);
            
            // 创建新标签
            const lowerCaseQuery = query.toLowerCase();
            
            // 如果是新标签，添加到可用列表
            if (!allAvailableTags.includes(lowerCaseQuery)) {
                allAvailableTags.push(lowerCaseQuery);
                console.log('  ➕ 添加到可用标签列表');
            }
            
            // 选中这个标签
            this.handlePillClick(lowerCaseQuery);
            
            // 清空搜索框
            tagModalSearchInput.value = '';
            this.render('');
        } else {
            // 普通搜索过滤
            this.render(query);
        }
    },

    async handleDone() {
        console.log('💾 保存标签变更...');
        
        const originalTags = new Set(appState.currentFileTags);
        const newTags = tempSelectedTags;

        const tagsToAdd = [...newTags].filter(t => !originalTags.has(t));
        const tagsToRemove = [...originalTags].filter(t => !newTags.has(t));

        console.log('  ➕ 需要添加:', tagsToAdd);
        console.log('  ➖ 需要移除:', tagsToRemove);

        // 如果没有变更，直接关闭
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
            if (window.updateCurrentFileTagsUI) {
                console.log('🔄 刷新侧边栏标签显示...');
                updateCurrentFileTagsUI(appState.activeFilePath);
            }
            
            // 刷新全局标签列表
            if (window.refreshAllTagsList) {
                console.log('🔄 刷新全局标签列表...');
                refreshAllTagsList();
            }
            
            showSuccessMessage('标签已保存');
        } catch (error) {
            console.error('❌ 更新标签失败:', error);
            showError('更新标签失败: ' + error);
        } finally {
            this.close();
        }
    }
};

// [修复] 确保在 DOM 完全加载后初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM 加载完成，初始化标签模块');
    tagModal.init();
});

// 导出到全局
window.tagModal = tagModal;

console.log('✅ tag_modal.js 加载完成');