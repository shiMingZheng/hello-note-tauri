// src/js/virtual-scroll.js
'use strict';

import { appState } from './core/AppState.js';
import { eventBus } from './core/EventBus.js';
import { showContextMenu } from './context-menu.js';
console.log('📜 virtual-scroll.js 开始加载...');

// 虚拟滚动配置
export const VIRTUAL_SCROLL_CONFIG = {
    ITEM_HEIGHT: 32,
    BUFFER_SIZE: 5,
    THROTTLE_DELAY: 16
};

// DOM 元素引用
let fileListContainer = null;
let fileListElement = null;
let fileListSpacer = null;

/**
 * 设置虚拟滚动
 */
export function setupVirtualScroll() {
    console.log('🎯 设置虚拟滚动...');
	// ⭐ 防止重复初始化
    if (fileListElement && fileListElement.dataset.initialized === 'true') {
        console.warn('⚠️ 虚拟滚动已初始化，跳过');
        return;
    }


    fileListContainer = document.querySelector('.file-list-container');
    fileListElement = document.getElementById('file-list');
    
    if (!fileListContainer || !fileListElement) {
        console.error('❌ 虚拟滚动元素未找到');
        return;
    }
	  // ⭐ 标记已初始化
    fileListElement.dataset.initialized = 'true';

    
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
	// 🆕 添加点击事件委托
	fileListElement.addEventListener('click', (e) => {
		const li = e.target.closest('li');
		if (!li) return;
		if (li.querySelector('.rename-input')) return;
		
		const path = li.dataset.path;
		const isDir = li.dataset.isDir === 'true';
		
		console.log('🖱️ [虚拟滚动] 点击文件项:', path, isDir ? '(文件夹)' : '(文件)');
		
		    if (isDir) {
				// ✅ 使用事件总线触发文件夹展开/折叠
				eventBus.emit('folder:toggle', path);
			} else {
				// ✅ 使用事件总线触发文件打开
				eventBus.emit('open-tab', path);
			}
	});
	
	// 🆕 添加右键菜单事件委托
	fileListElement.addEventListener('contextmenu', (e) => {
		e.preventDefault();
		const li = e.target.closest('li');
		if (!li) return;
		
		const item = {
			path: li.dataset.path,
			is_dir: li.dataset.isDir === 'true',
			name: li.dataset.name
		};
		
		console.log('🖱️ [虚拟滚动] 右键点击:', item);
		

		showContextMenu(e, item);

	});
	
	console.log('✅ 虚拟滚动事件委托已绑定');
}

/**
 * 处理虚拟滚动
 * 根据滚动位置计算并渲染可见项
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
 * 创建文件树项
 * @param {Object} item - 文件树项数据
 * @returns {HTMLElement} DOM 元素
 */
function createFileTreeItem(item) {
    const li = document.createElement('li');
    
    // 实时检查展开状态
    const isExpanded = appState.expandedFolders.has(item.path);
    
    // 根据实际展开状态选择图标和箭头
    let icon = item.is_dir ? (isExpanded ? '📂' : '📁') : '📄';
    const name = item.name.replace(/\\/g, '/').split('/').pop();
    
    const textSpan = document.createElement('span');
    textSpan.className = 'item-name';

    if (item.is_dir) {
        const arrow = isExpanded ? '▼' : '▶';
        textSpan.innerHTML = `<span class="folder-arrow">${arrow}</span>${icon} ${name}`;
    } else {
        textSpan.textContent = `${icon} ${name}`;
    }

    li.appendChild(textSpan);
    li.className = item.is_dir ? 'folder' : 'file';
    
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
        window.makeDraggable(li, item);
    }
    
    return li;
}

/**
 * 递归构建扁平化的可见列表
 * @param {Array} nodes - 节点列表
 * @param {number} level - 层级
 * @param {Array} result - 结果数组
 */
function buildVisibleList(nodes, level, result) {
    if (!nodes) return;
    
    if (level === 0) {
        console.log('🔍 [buildVisibleList] 当前展开的文件夹:', Array.from(appState.expandedFolders));
    }
    
    for (const node of nodes) {
        const item = { ...node, level };
        result.push(item);

        if (node.is_dir) {
            const isExpanded = appState.expandedFolders.has(node.path);
            
            console.log(`📁 [buildVisibleList] 文件夹: ${node.name}, 路径: ${node.path}, 是否展开: ${isExpanded}, fileTreeMap中有子节点: ${appState.fileTreeMap.has(node.path)}`);
            
            // 只有在展开状态下才递归添加子节点
            if (isExpanded && appState.fileTreeMap.has(node.path)) {
                const children = appState.fileTreeMap.get(node.path);
                console.log(`  └─ 递归加载 ${children.length} 个子节点`);
                buildVisibleList(children, level + 1, result);
            } else {
				console.warn(`  ⚠️ 文件夹 ${node.path} 被标记为展开,但 fileTreeMap 中没有子节点!`);
			}
        }
    }
}

/**
 * 更新虚拟滚动数据源
 * @param {string[]} [filteredPaths=null] - 筛选的文件路径列表
 */
export function updateVirtualScrollData(filteredPaths = null) {
      // ⭐ 防止短时间内重复调用
    if (updateVirtualScrollData.lastCallTime) {
        const timeSinceLastCall = Date.now() - updateVirtualScrollData.lastCallTime;
        if (timeSinceLastCall < 50) {  // 50ms 内不重复执行
            console.log('⏭️ 跳过重复的虚拟滚动更新');
            return;
        }
    }
	updateVirtualScrollData.lastCallTime = Date.now();
	let visibleItems = [];

    if (filteredPaths) {
        // 如果有筛选路径，只显示这些文件
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
        buildVisibleList(filteredNodes, 0, visibleItems);

    } else {
        // 无筛选，构建完整的文件树视图
        buildVisibleList(appState.fileTreeRoot, 0, visibleItems);
    }
    
    appState.virtualScroll.visibleItems = visibleItems;
    
    const totalHeight = visibleItems.length * VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT;
    if (fileListSpacer) {
        fileListSpacer.style.height = `${totalHeight}px`;
    }
    
    handleVirtualScroll();
    
        // ⭐ 只在必要时输出日志
    if (visibleItems.length > 0) {
        console.log(`📊 虚拟滚动数据已更新: ${visibleItems.length} 项`);
    }
}

console.log('✅ virtual-scroll.js 加载完成');

