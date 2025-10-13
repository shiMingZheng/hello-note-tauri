// src/js/sidebar-control.js
'use strict';
console.log('📜 sidebar-control.js 开始加载...');

let sidebarEl, collapseBtn, resizeHandle;
let isSidebarCollapsed = false;
let isResizing = false;
let startX = 0;
let startWidth = 0;

const MIN_WIDTH = 200;
const MAX_WIDTH = 500;

function initSidebarControl() {
    sidebarEl = document.querySelector('.sidebar');
    collapseBtn = document.getElementById('sidebar-collapse-btn');
    
    if (!sidebarEl || !collapseBtn) {
        console.warn('⚠️ 侧边栏功能初始化失败：元素未找到');
        return;
    }
    
    // 初始化折叠功能
    initCollapse();
    
    // 初始化拖动调整功能
    initResize();
    
    console.log('✅ 侧边栏控制功能初始化完成');
}

// ========================================
// 折叠功能
// ========================================
function initCollapse() {
    // 从 localStorage 恢复折叠状态
    const savedState = localStorage.getItem('sidebar_collapsed');
    if (savedState === 'true') {
        toggleCollapse(true);
    }
    
    // 绑定点击事件
    collapseBtn.addEventListener('click', () => toggleCollapse());
}

function toggleCollapse(forceCollapse) {
    isSidebarCollapsed = forceCollapse !== undefined ? forceCollapse : !isSidebarCollapsed;
    
    if (isSidebarCollapsed) {
        // 折叠状态
        sidebarEl.classList.add('collapsed');
        collapseBtn.textContent = '▶';
        collapseBtn.title = '展开侧边栏';
    } else {
        // 展开状态
        sidebarEl.classList.remove('collapsed');
        collapseBtn.textContent = '◀';
        collapseBtn.title = '折叠侧边栏';
        
        // ✅ 新增：展开后延迟触发虚拟滚动更新
        // ✅ 展开后强制重新计算
		setTimeout(() => {
			if (window.setupVirtualScroll) {
				console.log('🔄 侧边栏展开，重新初始化虚拟滚动...');
				window.setupVirtualScroll(); // 重新初始化
			}
			if (window.updateVirtualScrollData) {
				window.updateVirtualScrollData(); // 更新数据
			}
		}, 350); // 等待 CSS 过渡动画完成（300ms + 50ms buffer）
    }
    
    // 保存状态
    localStorage.setItem('sidebar_collapsed', isSidebarCollapsed);
    
    console.log(`${isSidebarCollapsed ? '✅ 侧边栏已折叠' : '✅ 侧边栏已展开'}`);
}

// ========================================
// 拖动调整宽度功能
// ========================================
function initResize() {
    // 创建拖动手柄
    resizeHandle = document.createElement('div');
    resizeHandle.className = 'sidebar-resize-handle';
    sidebarEl.appendChild(resizeHandle);
    
    // 从 localStorage 恢复宽度
    const savedWidth = localStorage.getItem('sidebar_width');
    if (savedWidth) {
        const width = parseInt(savedWidth);
        if (width >= MIN_WIDTH && width <= MAX_WIDTH) {
            sidebarEl.style.width = width + 'px';
        }
    }
    
    // 绑定事件
    resizeHandle.addEventListener('mousedown', startResize);
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
}

function startResize(e) {
    if (isSidebarCollapsed) return; // 折叠状态下不允许调整
    
    isResizing = true;
    startX = e.clientX;
    startWidth = sidebarEl.offsetWidth;
    
    resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    
    e.preventDefault();
}

function doResize(e) {
    if (!isResizing) return;
    
    const deltaX = e.clientX - startX;
    let newWidth = startWidth + deltaX;
    
    // 限制宽度范围
    newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
    
    sidebarEl.style.width = newWidth + 'px';
}

function stopResize() {
    if (!isResizing) return;
    
    isResizing = false;
    resizeHandle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    // 保存宽度
    const currentWidth = sidebarEl.offsetWidth;
    localStorage.setItem('sidebar_width', currentWidth);
    
    console.log('✅ 侧边栏宽度已保存:', currentWidth + 'px');
}

document.addEventListener('DOMContentLoaded', initSidebarControl);
window.toggleSidebarCollapse = toggleCollapse;