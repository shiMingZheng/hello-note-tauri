// src/js/file-manager.js
// CheetahNote - 文件、文件夹及本地存储管理

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
    
    saveLastFolder(folderPath);
    
    try {
        await loadFolderTreeLazy(folderPath);
        searchBox.classList.add('active');
        showIndexingToast('正在后台建立索引，请稍候...');
        initializeIndexInBackground(folderPath);
    } finally {
        appState.isLoading = false;
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

async function loadFolderTreeLazy(path) {
    console.log('🌲 加载文件树:', path);
    
    try {
        const filesNested = await invoke('list_dir_tree', { path });
        appState.fullFileTree = filesNested;
        
        // 使用虚拟滚动渲染
        updateVirtualScrollData();
        
    } catch (error) {
        console.error('❌ 加载文件夹失败:', error);
        showError('加载文件夹失败: ' + error);
    }
}

/**
 * 获取应该显示的文件项（根据展开状态）
 */
function getVisibleItems(nodes, parentPath, level) {
    const result = [];
    
    for (const node of nodes) {
        const item = {
            name: node.name,
            path: node.path,
            is_dir: node.is_dir,
            level: level,
            hasChildren: node.children && node.children.length > 0
        };
        
        result.push(item);
        
        if (node.is_dir && appState.expandedFolders.has(node.path) && node.children) {
            const childItems = getVisibleItems(node.children, node.path, level + 1);
            result.push(...childItems);
        }
    }
    
    return result;
}

/**
 * 创建文件树列表项
 */
function createFileTreeItem(item) {
    const li = document.createElement('li');
    const indent = '  '.repeat(item.level);
    
    let icon;
    if (item.is_dir) {
        icon = item.hasChildren && appState.expandedFolders.has(item.path) ? '📂' : '📁';
    } else {
        icon = '📄';
    }
    
    const name = item.name.replace(/\\/g, '/').split('/').pop();
    
    li.textContent = `${indent}${icon} ${name}`;
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
 * 切换文件夹展开/收起
 */
function toggleFolderLazy(folderPath) {
    console.log('🔄 切换文件夹:', folderPath);
    
    if (appState.expandedFolders.has(folderPath)) {
        appState.expandedFolders.delete(folderPath);
    } else {
        appState.expandedFolders.add(folderPath);
    }
    
    saveExpandedFolders();
    
    // 更新虚拟滚动数据并重新渲染
    updateVirtualScrollData();
}

async function handleCreateNote() {
    hideContextMenu();
    
    const fileName = prompt('请输入笔记名称 (无需添加.md后缀):');
    
    if (!fileName || fileName.trim() === '') {
        return;
    }
    
    const fullFileName = fileName.trim().endsWith('.md') 
        ? fileName.trim() 
        : fileName.trim() + '.md';
    
    try {
        const targetPath = appState.contextTarget.path;
        
        await invoke('create_new_file', { 
            dirPath: targetPath, 
            fileName: fullFileName 
        });
        
        showSuccessMessage('笔记已创建: ' + fullFileName);
        
        appState.expandedFolders.add(targetPath);
        saveExpandedFolders();
        
        await loadFolderTreeLazy(appState.rootPath);
        
        if (appState.indexInitialized) {
            invoke('index_files', { basePath: appState.rootPath }).catch(err => {
                console.warn('后台索引失败:', err);
            });
        }
        
    } catch (error) {
        console.error('❌ 创建笔记失败:', error);
        showError('创建笔记失败: ' + error);
    }
}

async function handleCreateFolder() {
    hideContextMenu();
    
    const folderName = prompt('请输入文件夹名称:');
    
    if (!folderName || folderName.trim() === '') {
        return;
    }
    
    try {
        const targetPath = appState.contextTarget.path;
        
        await invoke('create_new_folder', { 
            parentPath: targetPath, 
            folderName: folderName.trim() 
        });
        
        showSuccessMessage('文件夹已创建: ' + folderName);
        
        appState.expandedFolders.add(targetPath);
        saveExpandedFolders();
        
        await loadFolderTreeLazy(appState.rootPath);
        
    } catch (error) {
        console.error('❌ 创建文件夹失败:', error);
        showError('创建文件夹失败: ' + error);
    }
}

async function handleDeleteFile() {
    hideContextMenu();
    
    const target = appState.contextTarget;
    
    if (!target) {
        showError('未选择要删除的项目');
        return;
    }
    
    const itemType = target.isDir ? '文件夹' : '文件';
    const itemName = target.name.replace(/^[📁📂📄]\s*/, '');
    
    let title, message, icon;
    
    if (target.isDir) {
        title = '删除文件夹';
        message = `确定要删除文件夹 "${itemName}" 吗？\n\n⚠️ 警告：此操作将删除文件夹内的所有文件和子文件夹！\n\n此操作无法撤销。`;
        icon = '🗑️';
    } else {
        title = '删除文件';
        message = `确定要删除文件 "${itemName}" 吗？\n\n此操作无法撤销。`;
        icon = '🗑️';
    }
    
    const confirmed = await showCustomConfirm(title, message, icon);
    
    if (!confirmed) {
        return;
    }
    
    await performDelete(target, itemType, itemName);
}

async function performDelete(target, itemType, itemName) {
    try {
        if (target.isDir) {
            await invoke('delete_folder', { path: target.path });
        } else {
            await invoke('delete_item', { path: target.path });
        }
        
        showSuccessMessage(`${itemType}已删除: ${itemName}`);
        
        if (appState.activeFilePath === target.path) {
            markdownEditor.value = '';
            appState.activeFilePath = null;
            welcomeScreen.style.display = 'flex';
            editorWrapper.style.display = 'none';
            localStorage.removeItem(STORAGE_KEYS.LAST_FILE);
        }
        
        await loadFolderTreeLazy(appState.rootPath);
        
        if (appState.indexInitialized) {
            invoke('index_files', { basePath: appState.rootPath }).catch(err => {
                console.warn('后台索引失败:', err);
            });
        }
        
    } catch (error) {
        console.error(`❌ 删除${itemType}失败:`, error);
        showError(`删除${itemType}失败: ` + error);
    }
}


console.log('✅ file-manager.js 加载完成');