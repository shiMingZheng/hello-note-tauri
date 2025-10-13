// src/js/file-manager.js
// CheetahNote - 文件、文件夹管理 (工作区版本)

'use strict';
console.log('📜 file-manager.js 开始加载...');

// [保留] saveLastFile 用于在工作区内记忆上次打开的文件
function saveLastFile(relativePath) {
    try {
        localStorage.setItem('cheetah_last_file', relativePath);
    } catch (error) {
        console.warn('保存文件路径失败:', error);
    }
}

function saveExpandedFolders() {
    try {
        const expanded = Array.from(appState.expandedFolders);
        localStorage.setItem('cheetah_expanded_folders', JSON.stringify(expanded));
    } catch (error) {
        console.warn('保存展开状态失败:', error);
    }
}

/**
 * [保留] 刷新文件树
 */
async function refreshFileTree(relativePath = "") {
    if (!appState.rootPath) {
        console.warn('⚠️ rootPath 未设置，无法刷新文件树');
        return;
    }

    console.log(`🔄 刷新文件树: ${relativePath || '(根目录)'}`);
    
    try {
        const nodes = await invoke('list_dir_lazy', { 
            rootPath: appState.rootPath, 
            relativePath: relativePath 
        });

        console.log(`  ✅ 获取到 ${nodes.length} 个节点`);

        if (relativePath === "") {
            console.log('  📂 更新根目录');
            appState.fileTreeRoot = nodes;
            appState.fileTreeMap.clear();
            
            // ✅ 调试:显示根目录的节点(可选,完成后删除)
            console.log('📋 根目录节点列表:');
            nodes.forEach(node => {
                console.log(`  - ${node.is_dir ? '📁' : '📄'} ${node.name} (${node.path})`);
            });
            
            // ✅ 关键修改:自动加载所有展开文件夹的子节点
            for (const node of nodes) {
                if (node.is_dir && appState.expandedFolders.has(node.path)) {
                    console.log(`  🔄 自动加载展开的文件夹: ${node.name}`);
                    await loadFolderChildren(node.path);
                }
            }
        } else {
            console.log(`  📁 更新子目录: ${relativePath}`);
            appState.fileTreeMap.set(relativePath, nodes);
            
            if (!appState.expandedFolders.has(relativePath)) {
                appState.expandedFolders.add(relativePath);
                saveExpandedFolders();
            }
        }

        console.log('🔍 当前展开的文件夹:', Array.from(appState.expandedFolders));
        
        console.log('  🔄 更新虚拟滚动数据');
        if (window.updateVirtualScrollData) {
            updateVirtualScrollData();
        }

        console.log('✅ 文件树刷新完成');

    } catch (error) {
        console.error('❌ 刷新文件树失败:', error);
        showError('加载文件夹失败: ' + error);
    }
}

/**
 * 加载文件夹的子节点(不触发虚拟滚动更新)
 * @param {string} folderPath - 文件夹相对路径
 */
async function loadFolderChildren(folderPath) {
    try {
        const children = await invoke('list_dir_lazy', { 
            rootPath: appState.rootPath, 
            relativePath: folderPath 
        });
        
        appState.fileTreeMap.set(folderPath, children);
        console.log(`    ✅ 加载了 ${children.length} 个子节点: ${folderPath}`);
        
        // 递归加载嵌套展开的文件夹
        for (const child of children) {
            if (child.is_dir && appState.expandedFolders.has(child.path)) {
                console.log(`    🔄 递归加载: ${child.name}`);
                await loadFolderChildren(child.path);
            }
        }
    } catch (error) {
        console.error(`❌ 加载文件夹失败: ${folderPath}`, error);
    }
}

function createFileTreeItem(item) {
    const li = document.createElement('li');
    const isExpanded = appState.expandedFolders.has(item.path);
    
    // 根据文件夹展开状态选择图标
    let icon = item.is_dir ? (isExpanded ? '📂' : '📁') : '📄';
    const name = item.name.replace(/\\/g, '/').split('/').pop();
    
    const textSpan = document.createElement('span');
    textSpan.className = 'item-name';

    if (item.is_dir) {
        // 🔧 关键修改:使用 innerHTML 而不是 appendChild
        const arrow = isExpanded ? '▼' : '▶';
        textSpan.innerHTML = `<span class="folder-arrow">${arrow}</span>${icon} ${name}`;
    } else {
        textSpan.textContent = `${icon} ${name}`;
    }

    li.appendChild(textSpan);
    li.className = item.is_dir ? 'folder' : 'file';
    
    // 其余代码保持不变...
    li.dataset.path = item.path;
    li.dataset.isDir = item.is_dir;
    li.dataset.name = item.name;
    li.style.height = `${VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT}px`;
    li.style.lineHeight = `${VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT}px`;
    li.style.paddingLeft = `${item.level * 20 + 12}px`;
    
    if (appState.activeFilePath === item.path) {
        li.classList.add('active');
    }
    
    if (window.makeDraggable) {
        makeDraggable(li, item);
    }
    
    return li;
}

function handleFileListClick(e) {
    const li = e.target.closest('li');
    if (!li) return;
    if (li.querySelector('.rename-input')) return;
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

function handleRenameItem() {
    hideContextMenu();
    const targetItem = appState.contextTarget;
    if (!targetItem) return;

    const li = document.querySelector(`li[data-path="${CSS.escape(targetItem.path)}"]`);
    if (!li) return;

    const textSpan = li.querySelector('.item-name');
    const originalContent = textSpan.textContent;
    const isFile = !targetItem.is_dir;

    let originalName = targetItem.name;
    if (isFile && originalName.endsWith('.md')) {
        originalName = originalName.slice(0, -3);
    }
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.value = originalName;

    textSpan.innerHTML = (isFile ? '📄' : '📁') + ' ';
    textSpan.appendChild(input);
    input.focus();
    input.select();

    const finishRename = async (newName) => {
        if (!newName || newName === originalName) {
            textSpan.textContent = originalContent;
            return;
        }

        try {
            console.log(`🔄 开始重命名: ${targetItem.path} -> ${newName}`);
            
            const result = await invoke('rename_item', {
                rootPath: appState.rootPath,
                oldRelativePath: targetItem.path,
                newName: newName
            });

            console.log('✅ 重命名成功:', result);

            if (result.is_dir) {
                const oldPrefix = targetItem.path;
                const newPrefix = result.new_path;
                
                if (tabManager.updatePathsForRenamedFolder) {
                    tabManager.updatePathsForRenamedFolder(oldPrefix, newPrefix);
                }

                appState.fileTreeMap.delete(oldPrefix);
                
                if (appState.expandedFolders.has(oldPrefix)) {
                    appState.expandedFolders.delete(oldPrefix);
                    appState.expandedFolders.add(newPrefix);
                    saveExpandedFolders();
                }
            } else {
                const tabsToUpdate = tabManager.openTabs.filter(tab => tab.path === targetItem.path);
                tabsToUpdate.forEach(tab => {
                    tabManager.updateTabId(targetItem.path, result.new_path);
                });
            }

            const separator = result.new_path.includes('\\') ? '\\' : '/';
            const lastSlashIndex = targetItem.path.lastIndexOf(separator);
            const parentPath = lastSlashIndex > 0 
                ? targetItem.path.substring(0, lastSlashIndex)
                : "";

            await refreshFileTree(parentPath);
            
            if (window.updateVirtualScrollData) {
                updateVirtualScrollData();
            }
       
            // [新增] 刷新首页数据
            if (window.loadPinnedNotes) {
                window.loadPinnedNotes();
            }
            if (window.loadHistory) {
                window.loadHistory();
            }

            showSuccessMessage('重命名成功');

        } catch (error) {
            console.error('❌ 重命名失败:', error);
            showError('重命名失败: ' + error);
            textSpan.textContent = originalContent;
        }
    };

    input.addEventListener('blur', () => {
        finishRename(input.value.trim());
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            input.value = originalName;
            input.blur();
        }
    });
}

async function showContextMenu(event, file) {
    event.preventDefault();
    event.stopPropagation();
    appState.contextTarget = { path: file.path, is_dir: file.is_dir, name: file.name };
    
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    contextMenu.classList.add('visible');

    renameItemBtn.style.display = 'block';
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

/**
 * 在根目录新建笔记 - 内联输入
 */
async function handleCreateNoteInRoot() {
    if (!appState.rootPath) {
        showError('请先打开一个笔记仓库');
        return;
    }

    // 创建内联输入框
    const inputWrapper = document.createElement('li');
    inputWrapper.className = 'file-tree-inline-input';
    inputWrapper.style.cssText = `
        height: ${VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT}px;
        line-height: ${VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT}px;
        padding-left: 12px;
        display: flex;
        align-items: center;
        background: #f0f8ff;
    `;
    
    inputWrapper.innerHTML = `
        <span>📄 </span>
        <input type="text" 
               class="inline-file-input" 
               placeholder="笔记名称" 
               autocomplete="off"
               style="flex: 1; border: 1px solid #4a9eff; padding: 2px 6px; outline: none; background: white; border-radius: 2px;">
    `;
    
    // 插入到文件树顶部
    fileListElement.insertBefore(inputWrapper, fileListElement.firstChild);
    
    const input = inputWrapper.querySelector('input');
    input.focus();
    
    const finishCreate = async () => {
        const fileName = input.value.trim();
        inputWrapper.remove();
        
        if (!fileName) return;
        
        try {
            const newRelativePath = await invoke('create_new_file', { 
                rootPath: appState.rootPath, 
                relativeDirPath: "",
                fileName: fileName.replace(/\.md$/, '')
            });
            
            showSuccessMessage('笔记已创建');
            await refreshFileTree("");
            
            if (newRelativePath) {
                tabManager.openTab(newRelativePath);
            }
        } catch (error) {
            showError('创建笔记失败: ' + error);
        }
    };
    
    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (inputWrapper.parentNode) {
                inputWrapper.remove();
            }
        }, 200);
    });
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishCreate();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            inputWrapper.remove();
        }
    });
}

/**
 * 在根目录新建文件夹 - 内联输入
 */
async function handleCreateFolderInRoot() {
    if (!appState.rootPath) {
        showError('请先打开一个笔记仓库');
        return;
    }

    const inputWrapper = document.createElement('li');
    inputWrapper.className = 'file-tree-inline-input';
    inputWrapper.style.cssText = `
        height: ${VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT}px;
        line-height: ${VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT}px;
        padding-left: 12px;
        display: flex;
        align-items: center;
        background: #f0f8ff;
    `;
    
    inputWrapper.innerHTML = `
        <span>📁 </span>
        <input type="text" 
               class="inline-file-input" 
               placeholder="文件夹名称" 
               autocomplete="off"
               style="flex: 1; border: 1px solid #4a9eff; padding: 2px 6px; outline: none; background: white; border-radius: 2px;">
    `;
    
    fileListElement.insertBefore(inputWrapper, fileListElement.firstChild);
    
    const input = inputWrapper.querySelector('input');
    input.focus();
    
    const finishCreate = async () => {
        const folderName = input.value.trim();
        inputWrapper.remove();
        
        if (!folderName) return;
        
        try {
            await invoke('create_new_folder', { 
                rootPath: appState.rootPath, 
                relativeParentPath: "",
                folderName: folderName
            });
            
            showSuccessMessage('文件夹已创建');
            await refreshFileTree("");
            
            if (window.updateVirtualScrollData) {
                updateVirtualScrollData();
            }
        } catch (error) {
            showError('创建文件夹失败: ' + error);
        }
    };
    
    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (inputWrapper.parentNode) {
                inputWrapper.remove();
            }
        }, 200);
    });
    
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            finishCreate();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            inputWrapper.remove();
        }
    });
}

// 在导出部分添加这两个函数
window.handleCreateNoteInRoot = handleCreateNoteInRoot;
window.handleCreateFolderInRoot = handleCreateFolderInRoot;

window.saveLastFile = saveLastFile;
window.saveExpandedFolders = saveExpandedFolders;
window.refreshFileTree = refreshFileTree;
window.createFileTreeItem = createFileTreeItem;

// [修改] 移除 handleOpenFolder 的导出
window.handleFileListClick = handleFileListClick;
window.handleFileListContextMenu = handleFileListContextMenu;
window.handleCreateNote = handleCreateNote;
window.handleCreateFolder = handleCreateFolder;
window.handleDeleteFile = handleDeleteFile;
window.handlePinNote = handlePinNote;
window.handleUnpinNote = handleUnpinNote;
window.handleRenameItem = handleRenameItem;


console.log('✅ file-manager.js 加载完成');