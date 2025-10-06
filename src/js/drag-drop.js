// src/js/drag-drop.js
// CheetahNote - 拖拽移动文件和文件夹功能

'use strict';
console.log('📜 drag-drop.js 开始加载...');

let dragIndicator;
let draggedItem = null; // 当前拖拽的项目
let dropTarget = null;  // 当前悬停的目标文件夹

/**
 * 初始化拖拽功能
 */
function initializeDragDrop() {
    console.log('🎯 初始化拖拽功能...');
    
    // [修复] 等待 DOM 元素加载
    if (!fileListElement) {
        console.warn('⚠️ fileListElement 未定义，延迟初始化');
        setTimeout(initializeDragDrop, 100);
        return;
    }
    
    dragIndicator = document.getElementById('drag-indicator');
    
    // 使用事件委托监听文件列表的拖拽事件
    fileListElement.addEventListener('dragstart', handleDragStart);
    fileListElement.addEventListener('dragend', handleDragEnd);
    fileListElement.addEventListener('dragover', handleDragOver);
    fileListElement.addEventListener('dragleave', handleDragLeave);
    fileListElement.addEventListener('drop', handleDrop);
    
    console.log('✅ 拖拽功能已初始化');
}

/**
 * 为文件树项目添加可拖拽属性
 * 在 virtual-scroll.js 的 createFileTreeItem 中调用
 */
function makeDraggable(li, item) {
    // 设置为可拖拽
    li.setAttribute('draggable', 'true');
    li.classList.add('draggable-item');
}

/**
 * 拖拽开始
 */
function handleDragStart(e) {
    const li = e.target.closest('li');
    if (!li) return;
    
    const path = li.dataset.path;
    const isDir = li.dataset.isDir === 'true';
    const name = li.dataset.name;
    
    draggedItem = { path, isDir, name };
    
    // 设置拖拽数据
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', path);
    
    // 添加拖拽样式
    li.classList.add('dragging');
    
    console.log(`🎯 开始拖拽: ${name} (${isDir ? '文件夹' : '文件'})`);
}

/**
 * 拖拽结束
 */
function handleDragEnd(e) {
    const li = e.target.closest('li');
    if (li) {
        li.classList.remove('dragging');
    }
    
    // 清除所有拖拽状态
    document.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
    });
    
    if (dragIndicator) {
        dragIndicator.style.display = 'none';
    }
    
    draggedItem = null;
    dropTarget = null;
    
    console.log('✅ 拖拽结束');
}

/**
 * 拖拽经过
 */
function handleDragOver(e) {
    e.preventDefault();
    
    const li = e.target.closest('li');
    if (!li) return;
    
    const targetPath = li.dataset.path;
    const targetIsDir = li.dataset.isDir === 'true';
    
    // 只允许拖到文件夹上
    if (!targetIsDir) {
        e.dataTransfer.dropEffect = 'none';
        return;
    }
    
    // 不能拖到自己或自己的子文件夹
    if (draggedItem && (
        targetPath === draggedItem.path ||
        targetPath.startsWith(draggedItem.path + '/')
    )) {
        e.dataTransfer.dropEffect = 'none';
        return;
    }
    
    e.dataTransfer.dropEffect = 'move';
    
    // 高亮目标文件夹
    document.querySelectorAll('.drag-over').forEach(el => {
        el.classList.remove('drag-over');
    });
    li.classList.add('drag-over');
    
    dropTarget = { path: targetPath, name: li.dataset.name };
}

/**
 * 拖拽离开
 */
function handleDragLeave(e) {
    const li = e.target.closest('li');
    if (li) {
        li.classList.remove('drag-over');
    }
}

/**
 * 放下
 */
async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const li = e.target.closest('li');
    if (!li) return;
    
    const targetPath = li.dataset.path;
    const targetIsDir = li.dataset.isDir === 'true';
    
    // 移除高亮
    li.classList.remove('drag-over');
    
    if (!targetIsDir || !draggedItem) {
        return;
    }
    
    // 不能移动到自己或自己的子文件夹
    if (targetPath === draggedItem.path || 
        targetPath.startsWith(draggedItem.path + '/')) {
        showError('不能移动到自己或子文件夹中');
        return;
    }
    
    // 确认移动
    const confirmed = await showCustomConfirm(
        '移动文件',
        `确定要将 "${draggedItem.name}" 移动到 "${dropTarget.name}" 吗？`,
        '📦'
    );
    
    if (!confirmed) return;
    
    console.log(`📦 移动: ${draggedItem.path} -> ${targetPath}`);
    
    try {
        // 调用后端移动命令
        const result = await invoke('move_item', {
            rootPath: appState.rootPath,
            sourcePath: draggedItem.path,
            targetDir: targetPath
        });
        
        console.log('✅ 移动成功:', result);
        
        // 更新标签页路径
        if (draggedItem.isDir) {
            // 文件夹移动：批量更新所有子文件的标签页
            const oldPrefix = draggedItem.path;
            const newPrefix = result.new_path;
            
            if (window.tabManager && window.tabManager.updatePathsForRenamedFolder) {
                tabManager.updatePathsForRenamedFolder(oldPrefix, newPrefix);
            }
            
            // 清除缓存
            appState.fileTreeMap.delete(oldPrefix);
            
            // 更新展开状态
            if (appState.expandedFolders.has(oldPrefix)) {
                appState.expandedFolders.delete(oldPrefix);
                appState.expandedFolders.add(newPrefix);
                if (window.saveExpandedFolders) {
                    saveExpandedFolders();
                }
            }
            
        } else {
            // 文件移动：更新标签页
            if (window.tabManager) {
                tabManager.openTabs.forEach(tab => {
                    if (tab.path === draggedItem.path) {
                        tabManager.updateTabId(draggedItem.path, result.new_path);
                    }
                });
            }
        }
        
        // 刷新源文件夹和目标文件夹
        const sourceParent = getParentPath(draggedItem.path);
        
        if (window.refreshFileTree) {
            await refreshFileTree(sourceParent);
            
            if (targetPath !== sourceParent) {
                await refreshFileTree(targetPath);
            }
        }
        
        // 确保目标文件夹展开
        appState.expandedFolders.add(targetPath);
        if (window.saveExpandedFolders) {
            saveExpandedFolders();
        }
        
        if (window.showSuccessMessage) {
            showSuccessMessage(`已移动到 ${dropTarget.name}`);
        }
        
        // 更新虚拟滚动
        if (window.updateVirtualScrollData) {
            updateVirtualScrollData();
        }
        
    } catch (error) {
        console.error('❌ 移动失败:', error);
        showError('移动失败: ' + error);
    }
}

/**
 * 获取父路径
 */
function getParentPath(path) {
    const separator = path.includes('\\') ? '\\' : '/';
    const lastIndex = path.lastIndexOf(separator);
    return lastIndex > 0 ? path.substring(0, lastIndex) : '';
}

// 在 DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', initializeDragDrop);

// 导出函数供其他模块使用
window.makeDraggable = makeDraggable;
window.getParentPath = getParentPath;

console.log('✅ drag-drop.js 加载完成');