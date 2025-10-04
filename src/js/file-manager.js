// src/js/file-manager.js
// CheetahNote - 文件、文件夹及本地存储管理 (最终修复版)

'use strict';
console.log('📜 file-manager.js 开始加载...');

// ========================================
// 本地存储管理
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
// 文件夹操作
// ========================================

/**
 * [修复] 补上这个缺失的函数定义
 * 这是“打开文件夹”按钮的直接事件处理器
 */
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


/**
 * [修复] 移除重复的定义，只保留这一个版本
 * 根据指定路径打开文件夹
 * @param {string} folderPath 
 */
async function openFolderByPath(folderPath) {
    if (appState.isLoading) {
        console.warn('正在加载中，请稍候');
        return;
    }
    
    console.log('✅ 打开文件夹:', folderPath);
    appState.isLoading = true;
    appState.rootPath = folderPath;
    
    // 清理旧文件夹的状态
    appState.fileTreeRoot = [];
    appState.fileTreeMap.clear();
    appState.activeTagFilter = null;
    
    saveLastFolder(folderPath);
    
    try {
        // 刷新文件树 (只加载顶层)
        await refreshFileTree(folderPath); 
        
        searchBox.classList.add('active');

        // 刷新侧边栏的全局标签列表
        if (window.refreshAllTagsList) {
             await refreshAllTagsList();
        }

        // 后台启动索引进程
        showIndexingToast('正在后台建立索引，请稍候...');
        initializeIndexInBackground(folderPath);
    } finally {
        appState.isLoading = false;
    }
}


async function refreshFileTree(path = appState.rootPath) {
    console.log('🌲 刷新文件树:', path);
    try {
        const topLevelNodes = await invoke('list_dir_lazy', { path });
        appState.fileTreeRoot = topLevelNodes;

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
// 文件树操作
// ========================================

function createFileTreeItem(item) {
    const li = document.createElement('li');
    let icon = item.is_dir 
        ? (appState.expandedFolders.has(item.path) ? '📂' : '📁') 
        : '📄';
    
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
    
    if (!item.is_dir && item.path === appState.activeFilePath) {
        li.classList.add('active');
    }
    
    return li;
}

// 找到 handleFileListClick 函数并修改
function handleFileListClick(e) {
    const li = e.target.closest('li');
    if (!li) return;
    
    e.stopPropagation();
    const path = li.dataset.path;
    const isDir = li.dataset.isDir === 'true';
    
    if (isDir) {
        toggleFolderLazy(path);
    } else {
        // [修改] 不再直接调用 loadFileToEditor，而是通过 tabManager 打开
        tabManager.openTab(path);
    }
}

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

async function toggleFolderLazy(folderPath) {
    console.log('🔄 切换文件夹:', folderPath);
    const isExpanded = appState.expandedFolders.has(folderPath);

    if (isExpanded) {
        appState.expandedFolders.delete(folderPath);
    } else {
        appState.expandedFolders.add(folderPath);
        if (!appState.fileTreeMap.has(folderPath)) {
            try {
                const children = await invoke('list_dir_lazy', { path: folderPath });
                appState.fileTreeMap.set(folderPath, children);
            } catch (error) {
                console.error(`❌ 获取子目录失败: ${folderPath}`, error);
                showError(`获取子目录失败: ${error}`);
                appState.expandedFolders.delete(folderPath);
            }
        }
    }
    saveExpandedFolders();
    updateVirtualScrollData();
}

// ========================================
// 文件增删改查操作
// ========================================

async function handleCreateNote() {
    hideContextMenu();
    const fileName = prompt('请输入笔记名称 (无需添加.md后缀):');
    if (!fileName || fileName.trim() === '') return;
    
    const fullFileName = fileName.trim().endsWith('.md') ? fileName.trim() : fileName.trim() + '.md';
    
    try {
        const targetPath = appState.contextTarget.path;
        await invoke('create_new_file', { dirPath: targetPath, fileName: fullFileName });
        showSuccessMessage('笔记已创建: ' + fullFileName);
        
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
        
        appState.fileTreeMap.delete(target.path);
        appState.expandedFolders.delete(target.path);

        if (appState.activeFilePath === target.path) {
            markdownEditor.value = '';
            appState.activeFilePath = null;
            welcomeScreen.style.display = 'block';
            editorWrapper.style.display = 'none';
            localStorage.removeItem(STORAGE_KEYS.LAST_FILE);
        }
        
        await refreshFileTree();
        if (window.refreshAllTagsList) {
            await refreshAllTagsList();
        }

        if (appState.indexInitialized) {
            invoke('index_files', { basePath: appState.rootPath }).catch(err => console.warn('后台索引失败:', err));
        }
    } catch (error) {
        console.error(`❌ 删除${itemType}失败:`, error);
        showError(`删除${itemType}失败: ` + error);
    }
}

// [修改] showContextMenu 函数，以根据文件状态显示/隐藏置顶选项,这个实际是新增的，原先看不到这个函数


// [新增] 两个处理置顶/取消置顶的函数
async function handlePinNote() {
    hideContextMenu();
    const targetPath = appState.contextTarget.path;
    if (!targetPath) return;
    try {
        await invoke('pin_note', { path: targetPath });
        if (window.loadPinnedNotes) {
            window.loadPinnedNotes(); // 刷新首页
        }
    } catch (error) {
        showError("置顶失败: " + error);
    }
}

async function handleUnpinNote() {
    hideContextMenu();
    const targetPath = appState.contextTarget.path;
    if (!targetPath) return;
    try {
        await invoke('unpin_note', { path: targetPath });
        if (window.loadPinnedNotes) {
            window.loadPinnedNotes(); // 刷新首页
        }
    } catch (error) {
        showError("取消置顶失败: " + error);
    }
}


console.log('✅ file-manager.js 加载完成');

// [最终修复] 将核心函数显式挂载到全局 window 对象上
window.handleOpenFolder = handleOpenFolder;
window.handleFileListClick = handleFileListClick;
window.handleFileListContextMenu = handleFileListContextMenu;
window.handleCreateNote = handleCreateNote;
window.handleCreateFolder = handleCreateFolder;
window.handleDeleteFile = handleDeleteFile;
window.restoreLastSession = restoreLastSession;
// ... 在文件末尾的 window 对象挂载处添加 ...
window.handlePinNote = handlePinNote;
window.handleUnpinNote = handleUnpinNote;