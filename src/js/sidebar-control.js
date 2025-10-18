// src/js/sidebar-control.js
'use strict';
import { setupVirtualScroll, updateVirtualScrollData } from './virtual-scroll.js';
console.log('📜 sidebar-control.js 开始加载...');

class SidebarControl {
    constructor() {
        if (SidebarControl.instance) {
            return SidebarControl.instance;
        }
        
        // DOM 元素引用
        this.sidebarEl = null;
        this.collapseBtn = null;
        this.resizeHandle = null;
        
        // 状态
        this.isSidebarCollapsed = false;
        this.isResizing = false;
        this.startX = 0;
        this.startWidth = 0;
        
        // 常量
        this.MIN_WIDTH = 200;
        this.MAX_WIDTH = 500;
        
        SidebarControl.instance = this;
    }
    
    /**
     * 初始化侧边栏控制功能
     */
    init() {
        this.sidebarEl = document.querySelector('.sidebar');
        this.collapseBtn = document.getElementById('sidebar-collapse-btn');
        
        if (!this.sidebarEl || !this.collapseBtn) {
            console.warn('⚠️ 侧边栏功能初始化失败：元素未找到');
            return;
        }
        
        // 初始化折叠功能
        this.initCollapse();
        
        // 初始化拖动调整功能
        this.initResize();
        
        console.log('✅ 侧边栏控制功能初始化完成');
    }
    
    // ========================================
    // 折叠功能
    // ========================================
    
    /**
     * 初始化折叠功能
     */
    initCollapse() {
        // 从 localStorage 恢复折叠状态
        const savedState = localStorage.getItem('sidebar_collapsed');
        if (savedState === 'true') {
            this.toggleCollapse(true);
        }
        
        // 绑定点击事件
        this.collapseBtn.addEventListener('click', () => this.toggleCollapse());
    }
    
    /**
     * 切换侧边栏折叠状态
     * @param {boolean} forceCollapse - 强制设置折叠状态
     */
    toggleCollapse(forceCollapse) {
        this.isSidebarCollapsed = forceCollapse !== undefined ? forceCollapse : !this.isSidebarCollapsed;
        
        if (this.isSidebarCollapsed) {
            // 折叠状态
            this.sidebarEl.classList.add('collapsed');
            this.collapseBtn.textContent = '▶';
            this.collapseBtn.title = '展开侧边栏';
        } else {
            // 展开状态
            this.sidebarEl.classList.remove('collapsed');
            this.collapseBtn.textContent = '◀';
            this.collapseBtn.title = '折叠侧边栏';
            
            // ✅ 展开后延迟触发虚拟滚动更新
            setTimeout(() => {
				console.log('🔄 侧边栏展开，重新初始化虚拟滚动...');
				setupVirtualScroll();
				updateVirtualScrollData();
			}, 350); // 等待 CSS 过渡动画完成（300ms + 50ms buffer）
        }
        
        // 保存状态
        localStorage.setItem('sidebar_collapsed', this.isSidebarCollapsed);
        
        console.log(`${this.isSidebarCollapsed ? '✅ 侧边栏已折叠' : '✅ 侧边栏已展开'}`);
    }
    
    // ========================================
    // 拖动调整宽度功能
    // ========================================
    
    /**
     * 初始化拖动调整宽度功能
     */
    initResize() {
        // 创建拖动手柄
        this.resizeHandle = document.createElement('div');
        this.resizeHandle.className = 'sidebar-resize-handle';
        this.sidebarEl.appendChild(this.resizeHandle);
        
        // 从 localStorage 恢复宽度
        const savedWidth = localStorage.getItem('sidebar_width');
        if (savedWidth) {
            const width = parseInt(savedWidth);
            if (width >= this.MIN_WIDTH && width <= this.MAX_WIDTH) {
                this.sidebarEl.style.width = width + 'px';
            }
        }
        
        // 绑定事件
        this.resizeHandle.addEventListener('mousedown', (e) => this.startResize(e));
        document.addEventListener('mousemove', (e) => this.doResize(e));
        document.addEventListener('mouseup', () => this.stopResize());
    }
    
    /**
     * 开始拖动调整宽度
     */
    startResize(e) {
        if (this.isSidebarCollapsed) return; // 折叠状态下不允许调整
        
        this.isResizing = true;
        this.startX = e.clientX;
        this.startWidth = this.sidebarEl.offsetWidth;
        
        this.resizeHandle.classList.add('dragging');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        
        e.preventDefault();
    }
    
    /**
     * 拖动中调整宽度
     */
    doResize(e) {
        if (!this.isResizing) return;
        
        const deltaX = e.clientX - this.startX;
        let newWidth = this.startWidth + deltaX;
        
        // 限制宽度范围
        newWidth = Math.max(this.MIN_WIDTH, Math.min(this.MAX_WIDTH, newWidth));
        
        this.sidebarEl.style.width = newWidth + 'px';
    }
    
    /**
     * 停止拖动调整宽度
     */
    stopResize() {
        if (!this.isResizing) return;
        
        this.isResizing = false;
        this.resizeHandle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        
        // 保存宽度
        const currentWidth = this.sidebarEl.offsetWidth;
        localStorage.setItem('sidebar_width', currentWidth);
        
        console.log('✅ 侧边栏宽度已保存:', currentWidth + 'px');
    }
}

// 创建单例
const sidebarControl = new SidebarControl();


// ES Module 导出
export {
    sidebarControl
};

console.log('✅ sidebar-control.js 加载完成');