/**
 * CheetahNote - 极速 Markdown 笔记软件
 * 主前端脚本文件
 * 
 * 设计原则：
 * - 原生 JavaScript，无框架依赖
 * - 模块化设计，便于维护
 * - 性能优先，最小化 DOM 操作
 * - 错误处理和用户体验优化
 */

// Tauri API 导入
const { invoke } = window.__TAURI__.core;

// 应用状态管理
class AppState {
    constructor() {
        this.isLoading = false;
        this.lastResult = null;
        this.startTime = Date.now();
    }

    setLoading(loading) {
        this.isLoading = loading;
        this.updateLoadingIndicator();
    }

    updateLoadingIndicator() {
        const indicator = document.getElementById('loadingIndicator');
        if (this.isLoading) {
            indicator.classList.remove('hidden');
        } else {
            indicator.classList.add('hidden');
        }
    }

    updateStatus(message) {
        const statusElement = document.getElementById('appStatus');
        if (statusElement) {
            statusElement.textContent = message;
        }
    }
}

// 错误处理工具
class ErrorHandler {
    static show(message) {
        const errorToast = document.getElementById('errorToast');
        const errorMessage = document.getElementById('errorMessage');
        
        if (errorToast && errorMessage) {
            errorMessage.textContent = message;
            errorToast.classList.remove('hidden');
            
            // 5秒后自动隐藏
            setTimeout(() => {
                this.hide();
            }, 5000);
        }
        
        console.error('CheetahNote Error:', message);
    }

    static hide() {
        const errorToast = document.getElementById('errorToast');
        if (errorToast) {
            errorToast.classList.add('hidden');
        }
    }
}

// 结果显示工具
class ResultDisplay {
    static show(data) {
        const resultArea = document.getElementById('resultArea');
        const resultText = document.getElementById('resultText');
        
        if (resultArea && resultText) {
            // 格式化显示数据
            let displayText = '';
            
            if (typeof data === 'string') {
                displayText = data;
            } else if (typeof data === 'object') {
                displayText = this.formatObjectData(data);
            } else {
                displayText = String(data);
            }
            
            resultText.textContent = displayText;
            resultArea.classList.remove('hidden');
            
            // 平滑滚动到结果区域
            resultArea.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest' 
            });
        }
    }

    static hide() {
        const resultArea = document.getElementById('resultArea');
        if (resultArea) {
            resultArea.classList.add('hidden');
        }
    }

    static formatObjectData(obj) {
        if (obj && typeof obj === 'object') {
            return JSON.stringify(obj, null, 2);
        }
        return String(obj);
    }
}

// API 调用封装
class CheetahAPI {
    static async callCommand(command, params = {}) {
        try {
            appState.setLoading(true);
            appState.updateStatus('处理中...');
            
            const result = await invoke(command, params);
            
            appState.updateStatus('完成');
            return result;
            
        } catch (error) {
            const errorMessage = `调用 ${command} 失败: ${error}`;
            ErrorHandler.show(errorMessage);
            appState.updateStatus('错误');
            throw error;
            
        } finally {
            appState.setLoading(false);
        }
    }

    static async greet(name) {
        return this.callCommand('greet', { name });
    }

    static async getAppInfo() {
        return this.callCommand('get_app_info');
    }

    static async checkPerformance() {
        return this.callCommand('check_performance');
    }
}

// 用户交互处理
class InteractionHandler {
    static init() {
        this.bindEvents();
        this.setupKeyboardShortcuts();
    }

    static bindEvents() {
        // 问候按钮
        const greetBtn = document.getElementById('greetBtn');
        if (greetBtn) {
            greetBtn.addEventListener('click', this.handleGreet.bind(this));
        }

        // 应用信息按钮
        const appInfoBtn = document.getElementById('appInfoBtn');
        if (appInfoBtn) {
            appInfoBtn.addEventListener('click', this.handleAppInfo.bind(this));
        }

        // 性能检查按钮
        const performanceBtn = document.getElementById('performanceBtn');
        if (performanceBtn) {
            performanceBtn.addEventListener('click', this.handlePerformanceCheck.bind(this));
        }

        // 清除结果按钮
        const clearResult = document.getElementById('clearResult');
        if (clearResult) {
            clearResult.addEventListener('click', () => {
                ResultDisplay.hide();
            });
        }

        // 关闭错误按钮
        const closeError = document.getElementById('closeError');
        if (closeError) {
            closeError.addEventListener('click', () => {
                ErrorHandler.hide();
            });
        }

        // 输入框回车事件
        const nameInput = document.getElementById('nameInput');
        if (nameInput) {
            nameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleGreet();
                }
            });
        }
    }

    static setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Enter: 快速问候
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.handleGreet();
            }
            
            // Ctrl/Cmd + I: 应用信息
            if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
                e.preventDefault();
                this.handleAppInfo();
            }
            
            // Ctrl/Cmd + P: 性能检查
            if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
                e.preventDefault();
                this.handlePerformanceCheck();
            }
            
            // Escape: 清除结果或关闭错误
            if (e.key === 'Escape') {
                ResultDisplay.hide();
                ErrorHandler.hide();
            }
        });
    }

    static async handleGreet() {
        try {
            const nameInput = document.getElementById('nameInput');
            const name = nameInput ? nameInput.value.trim() : '';
            
            const response = await CheetahAPI.greet(name);
            
            if (response && response.success && response.data) {
                ResultDisplay.show(response.data);
                appState.lastResult = response.data;
            } else {
                ErrorHandler.show(response?.message || '未知错误');
            }
            
        } catch (error) {
            // 错误已在 CheetahAPI 中处理
        }
    }

    static async handleAppInfo() {
        try {
            const response = await CheetahAPI.getAppInfo();
            
            if (response && response.success && response.data) {
                ResultDisplay.show(response.data);
                appState.lastResult = response.data;
            } else {
                ErrorHandler.show(response?.message || '获取应用信息失败');
            }
            
        } catch (error) {
            // 错误已在 CheetahAPI 中处理
        }
    }

    static async handlePerformanceCheck() {
        try {
            const response = await CheetahAPI.checkPerformance();
            
            if (response && response.success && response.data) {
                // 添加运行时间信息
                const runtimeMs = Date.now() - appState.startTime;
                const runtimeInfo = {
                    ...response.data,
                    runtime_ms: runtimeMs,
                    runtime_formatted: this.formatRuntime(runtimeMs)
                };
                
                ResultDisplay.show(runtimeInfo);
                appState.lastResult = runtimeInfo;
            } else {
                ErrorHandler.show(response?.message || '性能检查失败');
            }
            
        } catch (error) {
            // 错误已在 CheetahAPI 中处理
        }
    }

    static formatRuntime(ms) {
        if (ms < 1000) {
            return `${ms}ms`;
        } else if (ms < 60000) {
            return `${(ms / 1000).toFixed(1)}s`;
        } else {
            const minutes = Math.floor(ms / 60000);
            const seconds = Math.floor((ms % 60000) / 1000);
            return `${minutes}m ${seconds}s`;
        }
    }
}

// 性能监控
class PerformanceMonitor {
    static init() {
        this.startTime = performance.now();
        this.measureLoadTime();
        this.setupPerformanceObserver();
    }

    static measureLoadTime() {
        window.addEventListener('load', () => {
            const loadTime = performance.now() - this.startTime;
            console.log(`CheetahNote 加载时间: ${loadTime.toFixed(2)}ms`);
            
            if (loadTime < 500) {
                console.log('✅ 达到启动性能目标 (< 500ms)');
            } else {
                console.warn('⚠️ 启动时间超过目标值');
            }
        });
    }

    static setupPerformanceObserver() {
        if ('PerformanceObserver' in window) {
            try {
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (entry.entryType === 'measure') {
                            console.log(`性能测量 - ${entry.name}: ${entry.duration.toFixed(2)}ms`);
                        }
                    }
                });
                
                observer.observe({ entryTypes: ['measure', 'navigation'] });
            } catch (error) {
                console.warn('性能监控初始化失败:', error);
            }
        }
    }

    static mark(name) {
        if ('performance' in window && 'mark' in performance) {
            performance.mark(name);
        }
    }

    static measure(name, startMark, endMark) {
        if ('performance' in window && 'measure' in performance) {
            try {
                performance.measure(name, startMark, endMark);
            } catch (error) {
                console.warn(`性能测量失败 - ${name}:`, error);
            }
        }
    }
}

// 全局应用状态
const appState = new AppState();

// 应用初始化
class CheetahNoteApp {
    static async init() {
        try {
            console.log('🚀 CheetahNote 初始化开始');
            PerformanceMonitor.mark('app-init-start');
            
            // 检查 Tauri 环境
            if (!window.__TAURI__) {
                throw new Error('Tauri 环境未检测到');
            }
            
            // 初始化各个模块
            InteractionHandler.init();
            PerformanceMonitor.init();
            
            // 设置初始状态
            appState.updateStatus('就绪');
            
            PerformanceMonitor.mark('app-init-end');
            PerformanceMonitor.measure('app-init', 'app-init-start', 'app-init-end');
            
            console.log('✅ CheetahNote 初始化完成');
            
            // 显示欢迎信息
            this.showWelcomeMessage();
            
        } catch (error) {
            console.error('❌ CheetahNote 初始化失败:', error);
            ErrorHandler.show(`应用初始化失败: ${error.message}`);
        }
    }

    static showWelcomeMessage() {
        // 3秒后显示欢迎提示
        setTimeout(() => {
            appState.updateStatus('欢迎使用 CheetahNote！');
            
            // 再过5秒恢复到就绪状态
            setTimeout(() => {
                appState.updateStatus('就绪');
            }, 5000);
        }, 3000);
    }
}

// 页面加载完成后初始化应用
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', CheetahNoteApp.init);
} else {
    CheetahNoteApp.init();
}

// 导出供其他模块使用
window.CheetahNote = {
    appState,
    ErrorHandler,
    ResultDisplay,
    CheetahAPI,
    PerformanceMonitor
};