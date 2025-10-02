// src/js/file-manager.js
// CheetahNote - 文件、文件夹及本地存储管理 (懒加载优化版)

'use strict';
console.log('📜 file-manager.js 开始加载...');

// ========================================
// 本地存储管理 (保持不变)
// ========================================

function saveLastFolder(folderPath) {
    try {
        localStorage.setItem(STORAGE_KEYS.LAST_FOLDER, folderPath);
    } catch (error) {
        console.warn('保存文件夹路径失败:', error);
    }
}

function saveLastFile(filePath) {
    try {
        localStorage.setItem(STORAGE_KEYS.LAST_FILE, filePath);
    } catch (error) {
        console.warn('保存文件路径失败:', error);
    }
}

function saveExpandedFolders() {
    try {
        const expanded = Array.from(appState.expandedFolders);
        localStorage.setItem(STORAGE_KEYS.EXPANDED_FOLDERS, JSON.stringify(expanded));
    } catch (error) {
        console.warn('保存展开状态失败:', error);
    }
}

async function restoreLastSession() {
    try {
        const lastFolder = localStorage.getItem(STORAGE_KEYS.LAST_FOLDER);
        const lastFile = localStorage.getItem(STORAGE_KEYS.LAST_FILE);
        const expandedStr = localStorage.getItem(STORAGE_KEYS.EXPANDED_FOLDERS);
        
        if (expandedStr) {
            try {
                const expanded = JSON.parse(expandedStr);
                appState.expandedFolders = new Set(expanded);
            } catch (e) {
                console.warn('恢复展开状态失败:', e);
            }
        }
        
        if (lastFolder) {
            console.log('📂 恢复上次的文件夹:', lastFolder);
            await openFolderByPath(lastFolder);
            
            if (lastFile) {
                console.log('📄 恢复上次的文件:', lastFile);
                setTimeout(() => {
                    loadFileToEditor(lastFile).catch(err => {
                        console.warn('恢复文件失败:', err);
                    });
                }, 500);
            }
        }
    } catch (error) {
        console.warn('恢复会话失败:', error);
    }
}

// ========================================
// 文件夹操作 (已修改)
// ========================================

async function handleOpenFolder() {
    console.log('📂 打开文件夹对话框...');
    
    try {
        const selected = await open({
            directory: true,
            multiple: false,
            title: '选择笔记文件夹'
        });
        
        if (selected && typeof selected === 'string') {
            await openFolderByPath(selected);
        }
    } catch (error) {
        console.error('❌ 打开文件夹失败:', error);
        showError('打开文件夹失败: ' + error);
    }
}

async function openFolderByPath(folderPath) {
    if (appState.isLoading) {
        console.warn('正在加载中，请稍候');
        return;
    }
    
    console.log('✅ 打开文件夹:', folderPath);
    appState.isLoading = true;
    appState.rootPath = folderPath;
    
    // 清空旧数据
    appState.fileTreeRoot = [];
    appState.fileTreeMap.clear();
    
    saveLastFolder(folderPath);
    
    try {
        await refreshFileTree(folderPath); // 使用新的刷新函数
        searchBox.classList.add('active');
        showIndexingToast('正在后台建立索引，请稍候...');
        initializeIndexInBackground(folderPath);
    } finally {
        appState.isLoading = false;
    }
}

// [新函数] 用于刷新整个文件树或特定子目录
async function refreshFileTree(path = appState.rootPath) {
    console.log('🌲 刷新文件树:', path);
    try {
        const topLevelNodes = await invoke('list_dir_lazy', { path });
        appState.fileTreeRoot = topLevelNodes;

        // 如果有已展开的文件夹，需要重新加载它们的数据
        const expandedPaths = Array.from(appState.expandedFolders);
        for (const expandedPath of expandedPaths) {
            const children = await invoke('list_dir_lazy', { path: expandedPath });
            appState.fileTreeMap.set(expandedPath, children);
        }

        updateVirtualScrollData();
    } catch (error) {
        console.error('❌ 加载文件夹失败:', error);
        showError('加载文件夹失败: ' + error);
    }
}


async function initializeIndexInBackground(basePath) {
    try {
        console.log('🔧 后台：开始初始化索引...');
        
        await invoke('initialize_index_command', { basePath });
        appState.indexInitialized = true;
        appState.dbInitialized = true;
        
        await invoke('index_files', { basePath });
        showSuccessMessage('索引建立完成，搜索功能已就绪');
        
    } catch (error) {
        console.error('❌ 后台索引失败:', error);
        showError('索引建立失败: ' + error + '\n搜索功能暂不可用');
        appState.indexInitialized = false;
        appState.dbInitialized = false;
    }
}

// ========================================
// 文件树操作 (核心修改)
// ========================================

/**
 * 创建文件树列表项 (已修改)
 */
function createFileTreeItem(item) {
    const li = document.createElement('li');
    let icon = '📄'; // 默认为文件图标

    if (item.is_dir) {
        if (appState.expandedFolders.has(item.path)) {
            icon = '📂'; // 展开的文件夹
        } else {
            icon = '📁'; // 折叠的文件夹
        }
    }
    
    const name = item.name.replace(/\\/g, '/').split('/').pop();
    
    li.textContent = `${icon} ${name}`;
    li.className = item.is_dir ? 'folder' : 'file';
    li.style.cssText = `
        height: ${VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT}px;
        line-height: ${VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT}px;
        padding-left: ${12 + item.level * 20}px;
    `;
    
    li.dataset.path = item.path;
    li.dataset.isDir = item.is_dir;
    li.dataset.name = name;
    
    // 高亮当前文件
    if (!item.is_dir && item.path === appState.activeFilePath) {
        li.classList.add('active');
    }
    
    return li;
}

/**
 * 处理文件列表点击（事件委托）
 */
function handleFileListClick(e) {
    const li = e.target.closest('li');
    if (!li) return;
    
    e.stopPropagation();
    
    const path = li.dataset.path;
    const isDir = li.dataset.isDir === 'true';
    
    if (isDir) {
        toggleFolderLazy(path);
    } else {
        loadFileToEditor(path);
    }
}

/**
 * 处理文件列表右键菜单（事件委托）
 */
function handleFileListContextMenu(e) {
    const li = e.target.closest('li');
    if (!li) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const item = {
        path: li.dataset.path,
        is_dir: li.dataset.isDir === 'true',
        name: li.dataset.name
    };
    
    showContextMenu(e, item);
}

/**
 * [核心修改] 切换文件夹展开/收起 (懒加载逻辑)
 */
async function toggleFolderLazy(folderPath) {
    console.log('🔄 切换文件夹:', folderPath);
    
    const isExpanded = appState.expandedFolders.has(folderPath);

    if (isExpanded) {
        appState.expandedFolders.delete(folderPath);
    } else {
        appState.expandedFolders.add(folderPath);
        // 如果是首次展开，并且Map中没有数据，则从后端获取
        if (!appState.fileTreeMap.has(folderPath)) {
            try {
                const children = await invoke('list_dir_lazy', { path: folderPath });
                appState.fileTreeMap.set(folderPath, children);
            } catch (error) {
                console.error(`❌ 获取子目录失败: ${folderPath}`, error);
                showError(`获取子目录失败: ${error}`);
                appState.expandedFolders.delete(folderPath); // 获取失败，收起文件夹
            }
        }
    }
    
    saveExpandedFolders();
    
    // 更新虚拟滚动数据并重新渲染
    updateVirtualScrollData();
}

// ========================================
// 文件增删改查操作 (已适配)
// ========================================

async function handleCreateNote() {
    hideContextMenu();
    const fileName = prompt('请输入笔记名称 (无需添加.md后缀):');
    if (!fileName || fileName.trim() === '') return;
    
    const fullFileName = fileName.trim().endsWith('.md') 
        ? fileName.trim() 
        : fileName.trim() + '.md';
    
    try {
        const targetPath = appState.contextTarget.path;
        await invoke('create_new_file', { dirPath: targetPath, fileName: fullFileName });
        showSuccessMessage('笔记已创建: ' + fullFileName);
        
        // 确保父文件夹是展开的，并刷新其内容
        appState.expandedFolders.add(targetPath);
        const children = await invoke('list_dir_lazy', { path: targetPath });
        appState.fileTreeMap.set(targetPath, children);
        
        saveExpandedFolders();
        updateVirtualScrollData();
        
        if (appState.indexInitialized) {
            invoke('index_files', { basePath: appState.rootPath }).catch(err => console.warn('后台索引失败:', err));
        }
    } catch (error) {
        console.error('❌ 创建笔记失败:', error);
        showError('创建笔记失败: ' + error);
    }
}

async function handleCreateFolder() {
    hideContextMenu();
    const folderName = prompt('请输入文件夹名称:');
    if (!folderName || folderName.trim() === '') return;
    
    try {
        const targetPath = appState.contextTarget.path;
        await invoke('create_new_folder', { parentPath: targetPath, folderName: folderName.trim() });
        showSuccessMessage('文件夹已创建: ' + folderName);
        
        // 确保父文件夹是展开的，并刷新其内容
        appState.expandedFolders.add(targetPath);
        const children = await invoke('list_dir_lazy', { path: targetPath });
        appState.fileTreeMap.set(targetPath, children);
        
        saveExpandedFolders();
        updateVirtualScrollData();
    } catch (error) {
        console.error('❌ 创建文件夹失败:', error);
        showError('创建文件夹失败: ' + error);
    }
}

async function handleDeleteFile() {
    hideContextMenu();
    const target = appState.contextTarget;
    if (!target) return;
    
    const itemType = target.is_dir ? '文件夹' : '文件';
    const itemName = target.name;
    const message = `确定要删除${itemType} "${itemName}" 吗？\n\n此操作无法撤销。`;
    
    const confirmed = await showCustomConfirm(`删除${itemType}`, message, '🗑️');
    if (!confirmed) return;
    
    await performDelete(target, itemType, itemName);
}

async function performDelete(target, itemType, itemName) {
    try {
        if (target.is_dir) {
            await invoke('delete_folder', { path: target.path });
        } else {
            await invoke('delete_item', { path: target.path });
        }
        
        showSuccessMessage(`${itemType}已删除: ${itemName}`);
        
        // 清理前端状态
        appState.fileTreeMap.delete(target.path);
        appState.expandedFolders.delete(target.path);

        // 如果删除的是当前打开的文件
        if (appState.activeFilePath === target.path) {
            markdownEditor.value = '';
            appState.activeFilePath = null;
            welcomeScreen.style.display = 'block'; // 使用 block 或 flex 取决于你的样式
            editorWrapper.style.display = 'none';
            localStorage.removeItem(STORAGE_KEYS.LAST_FILE);
        }
        
        await refreshFileTree(); // 全局刷新以更新UI

        if (appState.indexInitialized) {
            invoke('index_files', { basePath: appState.rootPath }).catch(err => console.warn('后台索引失败:', err));
        }
    } catch (error) {
        console.error(`❌ 删除${itemType}失败:`, error);
        showError(`删除${itemType}失败: ` + error);
    }
}