// src/js/file-manager.js
// CheetahNote - 文件、文件夹管理 (工作区版本)

'use strict';
import { appState } from './core/AppState.js';
import { tabManager } from './tab_manager.js';

// 在文件顶部,现有导入语句之后添加:
import { showError, showSuccessMessage, showCustomConfirm } from './ui-utils.js';
// 获取 invoke 方法
import { TauriAPI, invoke } from './core/TauriAPI.js';
import { eventBus } from './core/EventBus.js';
import { domElements } from './dom-init.js';  // ⭐ 新增
import { showContextMenu, hideContextMenu } from './context-menu.js';  // ⭐ 新增

import { updateVirtualScrollData, VIRTUAL_SCROLL_CONFIG } from './virtual-scroll.js';

console.log('📜 file-manager.js 开始加载...');
// 在文件顶部导入需要的元素引用
let contextMenu, newNoteBtn, newFolderBtn, deleteFileBtn, pinNoteBtn, unpinNoteBtn, renameItemBtn;

// 在某个初始化函数中赋值这些引用
export function initFileManagerDOM() {
    contextMenu = document.getElementById('context-menu');
    newNoteBtn = document.getElementById('new-note-btn');
    newFolderBtn = document.getElementById('new-folder-btn');
    deleteFileBtn = document.getElementById('delete-file-btn');
    pinNoteBtn = document.getElementById('pin-note-btn');
    unpinNoteBtn = document.getElementById('unpin-note-btn');
    renameItemBtn = document.getElementById('rename-item-btn');
    
    console.log('✅ file-manager DOM 元素已初始化');
}



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

        // --- [修改] ---
        if (relativePath === "") {
            console.log('  📂 更新根目录 (创建虚拟根节点)');
            
            // 1. 恢复展开状态 (如果需要)
            if (appState.expandedFolders.size === 0) {
                 try {
                    const expandedStr = localStorage.getItem('cheetah_expanded_folders');
                    if (expandedStr) {
                        const expandedArray = JSON.parse(expandedStr);
                        appState.expandedFolders = new Set(expandedArray);
                        console.log('🔄 从 localStorage 恢复展开状态:', expandedArray);
                    }
                } catch (error) {
                    console.warn('恢复展开状态失败:', error);
                }
            }
            
            // 2. 创建虚拟根节点
            const virtualRoot = {
                name: appState.rootName || "工作区", // 使用 appState 中的 rootName
                path: "", // 根目录的相对路径是 ""
                is_dir: true,
                has_children: nodes.length > 0,
                level: 0 // 将在 buildVisibleList 中设置
            };
            
            // 3. 将虚拟根节点设置为文件树的唯一根
            appState.fileTreeRoot = [virtualRoot];
            
            // 4. 将实际的根目录内容存入 fileTreeMap
            appState.fileTreeMap.clear(); // 清空旧数据
            appState.fileTreeMap.set("", nodes); // 键是根目录的相对路径 ""

            // 5. 默认展开根目录
            if (!appState.expandedFolders.has("")) {
                appState.expandedFolders.add("");
                saveExpandedFolders();
            }
            
            // 6. 自动加载已展开的子文件夹
            for (const node of nodes) {
                if (node.is_dir && appState.expandedFolders.has(node.path)) {
                    console.log(`  🔄 自动加载展开的文件夹: ${node.name}`);
                    await loadFolderChildren(node.path); // (递归加载)
                }
            }
            // --- [修改结束] ---

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
        updateVirtualScrollData();
        

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
    
    eventBus.emit('ui:makeDraggable', { element: li, item: item });
    
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
        eventBus.emit('open-tab', path)
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
    console.log(`\n🔄 [toggleFolderLazy] 开始处理: ${folderPath}`);
    console.log(`📊 当前 expandedFolders:`, Array.from(appState.expandedFolders));
    
    const isExpanded = appState.expandedFolders.has(folderPath);
    console.log(`📂 文件夹当前状态: ${isExpanded ? '已展开' : '已折叠'}`);
    
    if (isExpanded) {
        // 折叠:直接移除展开状态
        console.log(`➖ 执行折叠操作`);
        appState.expandedFolders.delete(folderPath);
    } else {
        // 展开:添加展开状态并加载子节点
        console.log(`➕ 执行展开操作`);
        appState.expandedFolders.add(folderPath);
        
        // 如果子节点还未加载,则加载
        if (!appState.fileTreeMap.has(folderPath)) {
            console.log(`🔍 子节点未加载,开始加载...`);
            try {
                const children = await invoke('list_dir_lazy', { 
                    rootPath: appState.rootPath, 
                    relativePath: folderPath 
                });
                appState.fileTreeMap.set(folderPath, children);
                console.log(`✅ 成功加载 ${children.length} 个子节点`);
            } catch (error) {
                console.error(`❌ 加载子节点失败:`, error);
                showError(`获取子目录失败: ${error}`);
                // 加载失败,撤销展开状态
                appState.expandedFolders.delete(folderPath);
                return; // 直接返回,不更新UI
            }
        } else {
            console.log(`✓ 子节点已存在,直接使用缓存`);
        }
    }
    
    // 保存展开状态到本地存储
    saveExpandedFolders();
    
    console.log(`📊 操作后 expandedFolders:`, Array.from(appState.expandedFolders));
    console.log(`🎨 开始更新UI...`);
    
    // 更新虚拟滚动视图
    updateVirtualScrollData();
    
    console.log(`✅ [toggleFolderLazy] 完成\n`);
}

async function handleCreateNote() {
    hideContextMenu();
    const fileName = prompt('请输入笔记名称 (无需添加.md后缀):');
    if (!fileName || fileName.trim() === '') return;
    
    try {
        // --- [修改] ---
        // contextTarget.path 现在可能是 "" (代表根目录)
        const relativeDirPath = appState.contextTarget.path;
        // --- [修改结束] ---
        
        const newRelativePath = await invoke('create_new_file', { 
            rootPath: appState.rootPath, 
            relativeDirPath, 
            fileName
        });
        showSuccessMessage('笔记已创建');
        
        // --- [修改] ---
        // 确保父目录 (根目录 "" 或其他目录) 是展开的
        appState.expandedFolders.add(relativeDirPath);
        // 刷新父目录
        await refreshFileTree(relativeDirPath);
        // --- [修改结束] ---
        
        if (newRelativePath) {
			 // 修改这里 👇
			eventBus.emit('open-tab', newRelativePath);
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
        // --- [修改] ---
        // contextTarget.path 现在可能是 "" (代表根目录)
        const relativeParentPath = appState.contextTarget.path;
        // --- [修改结束] ---

        await invoke('create_new_folder', { 
            rootPath: appState.rootPath, 
            relativeParentPath, 
            folderName
        });
        showSuccessMessage('文件夹已创建');
        
        // --- [修改] ---
        // 确保父目录 (根目录 "" 或其他目录) 是展开的
        appState.expandedFolders.add(relativeParentPath);
        // 刷新父目录
        await refreshFileTree(relativeParentPath);
        // --- [修改结束] ---
    } catch (error) {
        showError('创建文件夹失败: ' + error);
    }
}

async function handleDeleteFile() {
    hideContextMenu();
    const target = appState.contextTarget;
    if (!target) return;
    
    // --- [修改] ---
    // 增加对根目录的保护，不允许删除根目录
    if (target.path === "") {
        showError("不能删除整个工作区根目录");
        return;
    }
    // --- [修改结束] ---

    const confirmed = await showCustomConfirm(`删除`, `确定要删除 "${target.name}" 吗？`);
    if (!confirmed) return;
    
    try {
        await invoke('delete_item', { rootPath: appState.rootPath, relativePath: target.path });
        showSuccessMessage(`已删除: ${target.name}`);
        
		// ✅ 发布删除成功事件, 📢 通知其他模块: 删除完成了!
		eventBus.emit('file:deleted', {
			path: target.path,
			isDir: target.is_dir,
			name: target.name
		});
		
        
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
		showSuccessMessage('已置顶笔记');
		
		// ✅ 发布置顶事件
		eventBus.emit('file:pinned', { path: targetPath });
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
		showSuccessMessage('已取消置顶');

		// ✅ 发布取消置顶事件
		eventBus.emit('file:unpinned', { path: targetPath });
    } catch (error) {
        showError("取消置顶失败: " + error);
    }
}

// file-manager.js

function handleRenameItem() {
    hideContextMenu();
    const targetItem = appState.contextTarget;
    if (!targetItem) return;

    // --- [修改] ---
    // 增加对根目录的保护，不允许重命名根目录
    if (targetItem.path === "") {
        showError("不能重命名工作区根目录");
        return;
    }
    // --- [修改结束] ---

    const li = document.querySelector(`li[data-path="${CSS.escape(targetItem.path)}"]`);
    if (!li) return;

    const textSpan = li.querySelector('.item-name');
    const originalContent = textSpan.innerHTML; // ✅ 改用 innerHTML 保留箭头
    const isFile = !targetItem.is_dir;

    let originalName = targetItem.name;
    if (isFile && originalName.endsWith('.md')) {
        originalName = originalName.slice(0, -3);
    }
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'rename-input';
    input.value = originalName;
    input.style.cssText = 'flex: 1; border: 1px solid #4a9eff; padding: 2px 6px; outline: none; background: white; border-radius: 2px;';

    // ✅ 保留图标
    const icon = isFile ? '📄' : (textSpan.querySelector('.folder-arrow') ? textSpan.innerHTML.split('</span>')[0] + '</span>' : '📁');
    textSpan.innerHTML = icon + ' ';
    textSpan.appendChild(input);

    // ✅ 延迟聚焦,避免事件冲突
    setTimeout(() => {
        input.focus();
        input.select();
    }, 0);

    let isRenaming = false; // ✅ 防止重复提交

    const finishRename = async () => {
        if (isRenaming) {
            console.log('⚠️ 重命名正在进行中,跳过');
            return;
        }
        
        const newName = input.value.trim();
        
        // ✅ 验证输入
        if (!newName) {
            console.log('❌ 新名称为空,取消重命名');
            textSpan.innerHTML = originalContent;
            return;
        }
        
        if (newName === originalName) {
            console.log('ℹ️ 名称未改变,取消重命名');
            textSpan.innerHTML = originalContent;
            return;
        }

        isRenaming = true;
        
        try {
            // ✅ 构造完整文件名
            let finalNewName = newName;
            if (isFile && !finalNewName.endsWith('.md')) {
                finalNewName = finalNewName + '.md';
            }
            
            console.log(`🔄 开始重命名: ${targetItem.path} -> ${finalNewName}`);
            console.log(`📍 rootPath: ${appState.rootPath}`);
            console.log(`📍 oldRelativePath: ${targetItem.path}`);
            console.log(`📍 newName: ${finalNewName}`);
            
            // ✅ 显示加载状态
            input.disabled = true;
            input.style.opacity = '0.6';
            
            const result = await invoke('rename_item', {
                rootPath: appState.rootPath,
                oldRelativePath: targetItem.path,
                newName: finalNewName
            });

            console.log('✅ 重命名成功:', result);
            
            // 发布事件
            eventBus.emit('file:renamed', {
                oldPath: targetItem.path,
                newPath: result.new_path,
                isDir: result.is_dir
            });

            // 更新 UI (由事件处理器负责)
            
        } catch (error) {
            console.error('❌ 重命名失败:', error);
            showError('重命名失败: ' + error);
            textSpan.innerHTML = originalContent;
        } finally {
            isRenaming = false;
        }
    };

    const cancelRename = () => {
        console.log('🚫 取消重命名');
        textSpan.innerHTML = originalContent;
    };

    // ✅ Enter 键提交
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            finishRename();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancelRename();
        }
    });

    // ✅ 失去焦点时提交 (延迟执行,避免与其他事件冲突)
    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (!isRenaming && input.parentNode) {
                finishRename();
            }
        }, 200);
    });
}


/**
 * 在根目录新建笔记 - 内联输入
 */
async function handleCreateNoteInRoot() {
    if (!appState.rootPath) {
        showError('请先打开一个笔记仓库');
        return;
    }

    // --- [修改] ---
    // 移除内联输入框逻辑，改为调用 handleCreateNote
    console.log('➕ 在根目录创建笔记...');
    appState.contextTarget = {
        path: "", // 根目录的相对路径
        is_dir: true,
        name: appState.rootName
    };
    await handleCreateNote();
    // --- [修改结束] ---
}

/**
 * 在根目录新建文件夹 - 内联输入
 */
async function handleCreateFolderInRoot() {
    if (!appState.rootPath) {
        showError('请先打开一个笔记仓库');
        return;
    }

    // --- [修改] ---
    // 移除内联输入框逻辑，改为调用 handleCreateFolder
    console.log('➕ 在根目录创建文件夹...');
    appState.contextTarget = {
        path: "", // 根目录的相对路径
        is_dir: true,
        name: appState.rootName
    };
    await handleCreateFolder();
    // --- [修改结束] ---
}

// ============================================
// 收藏功能处理函数
// ============================================

/**
 * 处理收藏笔记
 */
async function handleFavoriteNote() {
    hideContextMenu();
    
    const targetPath = appState.contextTarget.path;
    
    try {
        await invoke('favorite_note', { relativePath: targetPath });
        showSuccessMessage('已添加到收藏');
        eventBus.emit('file:favorited', targetPath);
        console.log('⭐ 笔记已收藏:', targetPath);
    } catch (error) {
        console.error('❌ 收藏失败:', error);
        showError('收藏失败: ' + error);
    }
}

/**
 * 处理取消收藏笔记
 */
async function handleUnfavoriteNote() {
    hideContextMenu();
    
    const targetPath = appState.contextTarget.path;
    
    try {
        await invoke('unfavorite_note', { relativePath: targetPath });
        showSuccessMessage('已取消收藏');
        eventBus.emit('file:unfavorited', targetPath);
        console.log('⭐ 已取消收藏:', targetPath);
    } catch (error) {
        console.error('❌ 取消收藏失败:', error);
        showError('取消收藏失败: ' + error);
    }
}

// ES Module 导出
export {
    handleCreateNoteInRoot,
    handleCreateFolderInRoot,
    saveLastFile,
    saveExpandedFolders,
    refreshFileTree,
    createFileTreeItem,
    handleFileListClick,
    handleFileListContextMenu,
    handleCreateNote,
    handleCreateFolder,
    handleDeleteFile,
    handlePinNote,
    handleUnpinNote,
    handleRenameItem,
    toggleFolderLazy,  // 👈 确保有这一行
	handleFavoriteNote,      // ✅ 新增
    handleUnfavoriteNote,   // ✅ 新增
};

// ⭐ 订阅右键菜单事件
eventBus.on('context-menu:create-note', handleCreateNote);
eventBus.on('context-menu:create-folder', handleCreateFolder);
eventBus.on('context-menu:delete-item', handleDeleteFile);
eventBus.on('context-menu:rename-item', handleRenameItem);
eventBus.on('context-menu:pin-note', handlePinNote);
eventBus.on('context-menu:unpin-note', handleUnpinNote);
// --- [添加下面这两行] ---
eventBus.on('context-menu:favorite-note', handleFavoriteNote);
eventBus.on('context-menu:unfavorite-note', handleUnfavoriteNote);

// ⭐ 订阅根目录操作事件
eventBus.on('root-action:create-note', handleCreateNoteInRoot);
eventBus.on('root-action:create-folder', handleCreateFolderInRoot);

// ⭐ 订阅文件操作完成事件
eventBus.on('file:renamed', async (data) => {
    console.log('📝 处理重命名事件:', data);
    
    // 1. 刷新文件树
    // --- [修改] ---
    // 刷新父目录
    const parentPath = data.oldPath.substring(0, data.oldPath.lastIndexOf('/'));
    await refreshFileTree(parentPath);
    // --- [修改结束] ---
    
    // 2. 如果是文件,更新标签页
    if (!data.isDir) {
         // ✅ 新代码
        eventBus.emit('tab:update-path', {
            oldPath: data.oldPath,
            newPath: data.newPath
        });

    } else {
        // 文件夹重命名
        eventBus.emit('tab:update-folder-paths', {
            oldPrefix: data.oldPath,
            newPrefix: data.newPath
        });
    }

    
    // 3. 刷新标签列表
    eventBus.emit('ui:refreshAllTags');
});

eventBus.on('file:deleted', async (data) => {
    console.log('🗑️ 处理删除事件:', data);
    
    // 1. 关闭标签页(如果打开)
    if (appState.activeFilePath === data.path) {
          // ✅ 新代码
        eventBus.emit('tab:close', data.path);

    }
    
    // 2. 刷新文件树
    // --- [修改] ---
    // 刷新父目录
    const parentPath = data.path.substring(0, data.path.lastIndexOf('/'));
    await refreshFileTree(parentPath);
    // --- [修改结束] ---
    
    // 3. 刷新标签列表
    eventBus.emit('ui:refreshAllTags');
});

// file-manager.js

eventBus.on('file:saved', async (data) => {
    console.log('💾 处理保存事件:', data);
    
    // 1. 记录历史
    try {
        await invoke('record_file_event', {
            rootPath: appState.rootPath,
            relativePath: data.path,
            eventType: 'edited'
        });
    } catch (error) {
        console.warn('记录历史失败:', error);
    }
    
    // ✅ 2. 更新标签页状态（改为事件驱动）
    eventBus.emit('tab:mark-saved', data.path);
});

// ⭐ 订阅文件夹展开/折叠事件
eventBus.on('folder:toggle', async (folderPath) => {
    console.log('📁 处理文件夹展开/折叠:', folderPath);
    await toggleFolderLazy(folderPath);
});

// ⭐ 订阅文件夹状态变化事件
eventBus.on('folder:state-changed', () => {
    console.log('📁 处理文件夹状态变化');
    saveExpandedFolders();
});

// ⭐ 订阅文件移动事件
eventBus.on('file:moved', async (data) => {
    console.log('📦 处理文件移动事件:', data);
    
    const { oldPath, newPath, isDir, sourceParent, targetParent } = data;
    
    try {
        // 1. 更新标签页路径
        if (isDir) {
            // 文件夹移动：批量更新标签页
            // ✅ 新代码
			eventBus.emit('tab:update-folder-paths', {
				oldPrefix: oldPath,
				newPrefix: newPath
			});
        } else {
            // 文件移动：更新单个标签页
			eventBus.emit('tab:update-path', {
				oldPath: oldPath,
				newPath: newPath
			});
        }
        
        // 2. 清除旧路径缓存
        appState.fileTreeMap.delete(oldPath);
        
        // 3. 更新展开状态
        if (isDir && appState.expandedFolders.has(oldPath)) {
            appState.expandedFolders.delete(oldPath);
            appState.expandedFolders.add(newPath);
            saveExpandedFolders();
        }
        
        // 4. 刷新源和目标文件夹
        await refreshFileTree(sourceParent);
        if (targetParent !== sourceParent) {
            await refreshFileTree(targetParent);
        }
        
        // 5. 确保目标文件夹展开
        appState.expandedFolders.add(targetParent);
        saveExpandedFolders();
        
        // 6. 更新虚拟滚动
        updateVirtualScrollData();
        
        console.log('✅ 文件移动处理完成');
        
    } catch (error) {
        console.error('❌ 处理文件移动失败:', error);
        showError('更新界面失败: ' + error);
    }
});

// [重构] 步骤 2: 订阅 'ui:refreshFileTree' 事件
// (这个事件由 workspace.js 在启动时发布)
eventBus.on('ui:refreshFileTree', (relativePath) => {
    console.log('🔄 收到 ui:refreshFileTree 事件, 刷新: ', relativePath);
    // 调用本文件内定义的 refreshFileTree 函数
    refreshFileTree(relativePath || "");
});
console.log('✅ file-manager 已订阅文件夹操作\文件操作\事件根目录操作\文件夹展开/折叠事件\refreshFileTree');


console.log('✅ file-manager.js 加载完成');