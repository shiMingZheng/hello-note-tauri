// 新文件：src/js/dev-tools.js
// 用途：开发环境下的内存监控

'use strict';

class MemoryMonitor {
    constructor() {
        this.enabled = false;
        this.intervalId = null;
    }
    
    start() {
        if (!performance.memory) {
            console.warn('⚠️ 当前浏览器不支持 performance.memory');
            return;
        }
        
        this.enabled = true;
        this.createUI();
        
        this.intervalId = setInterval(() => {
            this.update();
        }, 1000);
        
        console.log('📊 内存监控已启动');
    }
    
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        this.enabled = false;
        
        const panel = document.getElementById('memory-monitor');
        if (panel) panel.remove();
    }
    
    createUI() {
        const panel = document.createElement('div');
        panel.id = 'memory-monitor';
        panel.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: #0f0;
            padding: 10px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            z-index: 10000;
            min-width: 200px;
        `;
        document.body.appendChild(panel);
    }
    
    update() {
        const mem = performance.memory;
        const panel = document.getElementById('memory-monitor');
        if (!panel) return;
        
        const used = (mem.usedJSHeapSize / 1024 / 1024).toFixed(2);
        const total = (mem.totalJSHeapSize / 1024 / 1024).toFixed(2);
        const limit = (mem.jsHeapSizeLimit / 1024 / 1024).toFixed(2);
        
        // 【新增】显示窗口状态
        const windowStatus = window.windowManager?.resourcesReleased 
            ? '💤 资源已释放' 
            : '✅ 正常运行';
        
        panel.innerHTML = `
            <div><strong>内存监控</strong></div>
            <div>状态: ${windowStatus}</div>
            <div>已用: ${used} MB</div>
            <div>总量: ${total} MB</div>
            <div>限制: ${limit} MB</div>
            <div>使用率: ${(used / limit * 100).toFixed(1)}%</div>
            ${window.windowManager?.resourcesReleased ? '<div style="color: #0f0;">目标: < 20MB</div>' : ''}
        `;
        
        // 【新增】资源释放时颜色变化
        if (window.windowManager?.resourcesReleased && used < 20) {
            panel.style.background = 'rgba(0, 128, 0, 0.8)';
        } else {
            panel.style.background = 'rgba(0, 0, 0, 0.8)';
        }
    }
}

// 自动启动（仅开发环境）
if (window.location.hostname === 'localhost') {
    const monitor = new MemoryMonitor();
    monitor.start();
    
    window.memoryMonitor = monitor;
}