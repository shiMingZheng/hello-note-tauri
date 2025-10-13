// src/js/virtual-scroll.js
// CheetahNote - 虚拟滚动核心逻辑

'use strict';
console.log('📜 virtual-scroll.js 开始加载...');

/**
 * 设置虚拟滚动
 */
function setupVirtualScroll() {
    console.log('🎯 设置虚拟滚动...');
    
    // 创建哨兵元素（撑开滚动条）
    fileListSpacer = document.createElement('div');
    fileListSpacer.id = 'file-list-spacer';
    fileListSpacer.style.cssText = 'height: 0; width: 1px;';
    fileListContainer.insertBefore(fileListSpacer, fileListElement);
    
    // 设置列表为绝对定位
    fileListElement.style.position = 'absolute';
    fileListElement.style.top = '0';
    fileListElement.style.left = '0';
    fileListElement.style.right = '0';
    fileListElement.style.willChange = 'transform';
    
    // 监听滚动事件（节流处理）
    let scrollTimeout = null;
    fileListContainer.addEventListener('scroll', () => {
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
        
        scrollTimeout = setTimeout(() => {
            handleVirtualScroll();
        }, VIRTUAL_SCROLL_CONFIG.THROTTLE_DELAY);
    }, { passive: true });
    
    // 监听窗口大小变化
    let resizeTimeout = null;
    window.addEventListener('resize', () => {
        if (resizeTimeout) {
            clearTimeout(resizeTimeout);
        }
        
        resizeTimeout = setTimeout(() => {
            appState.virtualScroll.containerHeight = fileListContainer.clientHeight;
            handleVirtualScroll();
        }, 100);
    });
    
    // 初始化容器高度
    appState.virtualScroll.containerHeight = fileListContainer.clientHeight;
    
    console.log('✅ 虚拟滚动已设置');
}
// ✅ 新增：监听窗口大小变化
window.addEventListener('resize', debounce(() => {
    if (window.updateVirtualScrollData) {
        console.log('🔄 窗口大小改变，重新计算虚拟滚动...');
        window.updateVirtualScrollData();
    }
}, 200));
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

/**
 * 处理虚拟滚动
 * 这是虚拟滚动的核心函数，根据滚动位置计算并渲染可见项
 */
function handleVirtualScroll() {
    const { visibleItems } = appState.virtualScroll;
    
    if (!visibleItems || visibleItems.length === 0) {
        return;
    }
    
    const scrollTop = fileListContainer.scrollTop;
    const containerHeight = appState.virtualScroll.containerHeight;
    const itemHeight = VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT;
    const bufferSize = VIRTUAL_SCROLL_CONFIG.BUFFER_SIZE;
    
    // 计算可视范围的起始和结束索引
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
    const endIndex = Math.min(
        visibleItems.length,
        Math.ceil((scrollTop + containerHeight) / itemHeight) + bufferSize
    );
    
    // 更新状态
    appState.virtualScroll.scrollTop = scrollTop;
    appState.virtualScroll.renderedRange = { start: startIndex, end: endIndex };
    
    // 渲染可见项
    renderVisibleItems(startIndex, endIndex);
    
    // 调整列表位置
    const offsetY = startIndex * itemHeight;
    fileListElement.style.transform = `translateY(${offsetY}px)`;
}

/**
 * 渲染可见项
 * @param {number} startIndex - 起始索引
 * @param {number} endIndex - 结束索引
 */
function renderVisibleItems(startIndex, endIndex) {
    const { visibleItems } = appState.virtualScroll;
    const fragment = document.createDocumentFragment();
    
    // 只渲染当前视口内的项
    for (let i = startIndex; i < endIndex; i++) {
        const item = visibleItems[i];
        if (!item) continue;
        
        const li = createFileTreeItem(item);
        fragment.appendChild(li);
    }
    
    // 一次性更新 DOM（性能优化）
    fileListElement.innerHTML = '';
    fileListElement.appendChild(fragment);
}

/**
 * [新函数] 递归地从 Map 构建扁平化的可见列表
 */
function buildVisibleList(nodes, level, result) {
    if (!nodes) return;
    
    for (const node of nodes) {
        const item = { ...node, level };
        result.push(item);

        // 如果目录是展开的，并且我们已经加载了它的子节点，则递归添加
        if (node.is_dir && appState.expandedFolders.has(node.path)) {
            const children = appState.fileTreeMap.get(node.path);
            buildVisibleList(children, level + 1, result);
        }
    }
}
/**
 * 更新虚拟滚动数据源 (已修改)
 * 当文件树数据变化时调用此函数
 * [修改] `updateVirtualScrollData` 现在可以接收一个可选的文件路径数组
 * @param {string[]} [filteredPaths=null] - 如果提供，则只显示这些路径的文件
 */
function updateVirtualScrollData(filteredPaths = null) {
    let visibleItems = [];

    if (filteredPaths) {
        // 如果有筛选路径，我们只从 fileTreeMap 中构建这些文件的视图
        const filteredNodes = [];
        const pathSet = new Set(filteredPaths);

        function findNodesByPaths(nodes) {
            if (!nodes) return;
            for (const node of nodes) {
                if (pathSet.has(node.path)) {
                    filteredNodes.push(node);
                }
                // 即便父目录不在Set中，也要继续查找其子目录
                if (node.is_dir) {
                    const children = appState.fileTreeMap.get(node.path);
                    findNodesByPaths(children);
                }
            }
        }
        findNodesByPaths(appState.fileTreeRoot);
        // 注意：这里的实现很简单，只会显示一个扁平的筛选后列表。
        // 一个更复杂的实现会保留原始的目录结构。
        // 为了简单起见，我们暂时将筛选结果扁平化显示。
        buildVisibleList(filteredNodes, 0, visibleItems);

    } else {
        // 无筛选，构建完整的文件树视图
        buildVisibleList(appState.fileTreeRoot, 0, visibleItems);
    }
    
    appState.virtualScroll.visibleItems = visibleItems;
    
    const totalHeight = visibleItems.length * VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT;
    fileListSpacer.style.height = `${totalHeight}px`;
    
    handleVirtualScroll();
    
    console.log(`📊 虚拟滚动数据已更新: ${visibleItems.length} 项`);
}

console.log('✅ virtual-scroll.js 加载完成');