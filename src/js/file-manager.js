// src/js/file-manager.js
// CheetahNote - 文件、文件夹及本地存储管理 (最终修复版)

'use strict';
console.log('📜 file-manager.js 开始加载...');

function saveLastFolder(folderPath) {
    try {
        localStorage.setItem(STORAGE_KEYS.LAST_FOLDER, folderPath);
    } catch (error) {
        console.warn('保存文件夹路径失败:', error);
    }
}

function saveLastFile(relativePath) {
    try {
        localStorage.setItem(STORAGE_KEYS.LAST_FILE, relativePath);
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
        const lastFile = localStorage.getItem(STORAGE_KEYS.LAST_FILE); // This is a relative path
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
            await openFolderByPath(lastFolder);
            
            if (lastFile) {
                // lastFile is relative, openTab handles it correctly
                tabManager.openTab(lastFile);
            }
        }
    } catch (error) {
        console.warn('恢复会话失败:', error);
    }
}

async function handleOpenFolder() {
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
        showError('打开文件夹失败: ' + error);
    }
}

async function openFolderByPath(folderPath) {
    if (appState.isLoading) return;
    
    try {
        await invoke('migrate_paths_to_relative', { rootPath: folderPath });
    } catch (e) {
        console.error("数据库迁移失败:", e);
        showError("数据库迁移失败，部分数据可能不兼容。");
    }

    appState.isLoading = true;
    appState.rootPath = folderPath;
    
    appState.fileTreeRoot = [];
    appState.fileTreeMap.clear();
    appState.activeTagFilter = null;
    
    saveLastFolder(folderPath);
    
    try {
        await refreshFileTree(""); // Refresh root with empty relative path
        
        searchBox.classList.add('active');
        if (window.refreshAllTagsList) {
             await refreshAllTagsList();
        }
        showIndexingToast('正在后台建立索引，请稍候...');
        initializeIndexInBackground(folderPath);
    } finally {
        appState.isLoading = false;
    }
}

async function refreshFileTree(relativePath = "") {
    if (!appState.rootPath) return;
    try {
        const topLevelNodes = await invoke('list_dir_lazy', { rootPath: appState.rootPath, relativePath });
        appState.fileTreeRoot = topLevelNodes;

        for (const expandedPath of appState.expandedFolders) {
            const children = await invoke('list_dir_lazy', { rootPath: appState.rootPath, relativePath: expandedPath });
            appState.fileTreeMap.set(expandedPath, children);
        }

        updateVirtualScrollData();
    } catch (error) {
        showError('加载文件夹失败: ' + error);
    }
}

// ▼▼▼【核心修改】在这里 ▼▼▼
async function initializeIndexInBackground(folderPath) {
    try {
        // [修复] 将参数键 basePath 修改为 rootPath
        await invoke('initialize_index_command', { rootPath: folderPath });
        appState.indexInitialized = true;
        appState.dbInitialized = true;
        // [修复] 将参数键 basePath 修改为 rootPath
        await invoke('index_files', { rootPath: folderPath });
        showSuccessMessage('索引建立完成');
    } catch (error) {
        showError('索引建立失败: ' + error);
    }
}
// ▲▲▲【核心修改】在这里 ▲▲▲

function createFileTreeItem(item) {
    const li = document.createElement('li');
    let icon = item.is_dir 
        ? (appState.expandedFolders.has(item.path) ? '📂' : '📁') 
        : '📄';
    
    const name = item.name.replace(/\\/g, '/').split('/').pop();
    li.textContent = `${icon} ${name}`;
    li.className = item.is_dir ? 'folder' : 'file';
    li.style.cssText = `height: ${VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT}px; line-height: ${VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT}px; padding-left: ${12 + item.level * 20}px;`;
    li.dataset.path = item.path;
    li.dataset.isDir = item.is_dir;
    li.dataset.name = name;
    
    if (!item.is_dir && item.path === appState.activeFilePath) {
        li.classList.add('active');
    }
    
    return li;
}

function handleFileListClick(e) {
    const li = e.target.closest('li');
    if (!li) return;
    const path = li.dataset.path;
    const isDir = li.dataset.isDir === 'true';
    if (isDir) {
        toggleFolderLazy(path);
    } else {
        tabManager.openTab(path);
    }
}

function handleFileListContextMenu(e) {
    e.preventDefault();
    const li = e.target.closest('li');
    if (!li) return;
    const item = { path: li.dataset.path, is_dir: li.dataset.isDir === 'true', name: li.dataset.name };
    showContextMenu(e, item);
}

async function toggleFolderLazy(folderPath) {
    const isExpanded = appState.expandedFolders.has(folderPath);
    if (isExpanded) {
        appState.expandedFolders.delete(folderPath);
    } else {
        appState.expandedFolders.add(folderPath);
        if (!appState.fileTreeMap.has(folderPath)) {
            try {
                const children = await invoke('list_dir_lazy', { rootPath: appState.rootPath, relativePath: folderPath });
                appState.fileTreeMap.set(folderPath, children);
            } catch (error) {
                showError(`获取子目录失败: ${error}`);
                appState.expandedFolders.delete(folderPath);
            }
        }
    }
    saveExpandedFolders();
    updateVirtualScrollData();
}

async function handleCreateNote() {
    hideContextMenu();
    const fileName = prompt('请输入笔记名称 (无需添加.md后缀):');
    if (!fileName || fileName.trim() === '') return;
    
    try {
        const relativeDirPath = appState.contextTarget.path;
        const newRelativePath = await invoke('create_new_file', { 
            rootPath: appState.rootPath, 
            relativeDirPath, 
            fileName
        });
        showSuccessMessage('笔记已创建');
        
        appState.expandedFolders.add(relativeDirPath);
        const children = await invoke('list_dir_lazy', { rootPath: appState.rootPath, relativePath: relativeDirPath });
        appState.fileTreeMap.set(relativeDirPath, children);
        
        saveExpandedFolders();
        updateVirtualScrollData();
        
        if (newRelativePath) {
            tabManager.openTab(newRelativePath);
        }
    } catch (error) {
        showError('创建笔记失败: ' + error);
    }
}

async function handleCreateFolder() {
    hideContextMenu();
    const folderName = prompt('请输入文件夹名称:');
    if (!folderName || folderName.trim() === '') return;
    
    try {
        const relativeParentPath = appState.contextTarget.path;
        await invoke('create_new_folder', { 
            rootPath: appState.rootPath, 
            relativeParentPath, 
            folderName
        });
        showSuccessMessage('文件夹已创建');
        
        appState.expandedFolders.add(relativeParentPath);
        const children = await invoke('list_dir_lazy', { rootPath: appState.rootPath, relativePath: relativeParentPath });
        appState.fileTreeMap.set(relativeParentPath, children);
        
        saveExpandedFolders();
        updateVirtualScrollData();
    } catch (error) {
        showError('创建文件夹失败: ' + error);
    }
}

async function handleDeleteFile() {
    hideContextMenu();
    const target = appState.contextTarget;
    if (!target) return;
    
    const confirmed = await showCustomConfirm(`删除`, `确定要删除 "${target.name}" 吗？`);
    if (!confirmed) return;
    
    try {
        await invoke('delete_item', { rootPath: appState.rootPath, relativePath: target.path });
        showSuccessMessage(`已删除: ${target.name}`);
        
        if (appState.activeFilePath === target.path) {
            tabManager.closeTab(target.path);
        }
        
        await refreshFileTree();
        if (window.refreshAllTagsList) {
            await refreshAllTagsList();
        }
    } catch (error) {
        showError(`删除失败: ` + error);
    }
}

async function handlePinNote() {
    hideContextMenu();
    const targetPath = appState.contextTarget.path;
    if (!targetPath) return;
    try {
        await invoke('pin_note', { relativePath: targetPath });
        if (window.loadPinnedNotes) window.loadPinnedNotes();
    } catch (error) {
        showError("置顶失败: " + error);
    }
}

async function handleUnpinNote() {
    hideContextMenu();
    const targetPath = appState.contextTarget.path;
    if (!targetPath) return;
    try {
        await invoke('unpin_note', { relativePath: targetPath });
        if (window.loadPinnedNotes) window.loadPinnedNotes();
    } catch (error) {
        showError("取消置顶失败: " + error);
    }
}

async function showContextMenu(event, file) {
    event.preventDefault();
    event.stopPropagation();
    appState.contextTarget = { path: file.path, isDir: file.is_dir, name: file.name };
    
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    contextMenu.classList.add('visible');

    pinNoteBtn.style.display = 'none';
    unpinNoteBtn.style.display = 'none';
    newNoteBtn.style.display = 'none';
    newFolderBtn.style.display = 'none';
    deleteFileBtn.style.display = 'none';

    if (file.from === 'pinned-section') {
        unpinNoteBtn.style.display = 'block';
    } else if (file.is_dir) {
        newNoteBtn.style.display = 'block';
        newFolderBtn.style.display = 'block';
        deleteFileBtn.style.display = 'block';
    } else {
        deleteFileBtn.style.display = 'block';
        try {
            const pinnedNotes = await invoke('get_pinned_notes');
            const isPinned = pinnedNotes.some(note => note.path === file.path);
            if (isPinned) {
                unpinNoteBtn.style.display = 'block';
            } else {
                pinNoteBtn.style.display = 'block';
            }
        } catch (error) {
            console.error("检查置顶状态失败:", error);
        }
    }
}

window.handleOpenFolder = handleOpenFolder;
window.handleFileListClick = handleFileListClick;
window.handleFileListContextMenu = handleFileListContextMenu;
window.handleCreateNote = handleCreateNote;
window.handleCreateFolder = handleCreateFolder;
window.handleDeleteFile = handleDeleteFile;
window.restoreLastSession = restoreLastSession;
window.handlePinNote = handlePinNote;
window.handleUnpinNote = handleUnpinNote;