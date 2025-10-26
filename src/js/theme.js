// src/js/theme.js
'use strict';
// [重构] 步骤 2: 导入 milkdownEditor
import { milkdownEditor } from './milkdown-editor.js';
console.log('📜 theme.js 开始加载...');

class ThemeManager {
    constructor() {
        if (ThemeManager.instance) {
            return ThemeManager.instance;
        }
        
        this.themeToggleBtn = null;
        this.currentTheme = 'light';
        
        ThemeManager.instance = this;
    }
    
    /**
     * 初始化主题系统
     */
    init() {
        this.themeToggleBtn = document.getElementById('theme-toggle-btn');
        
        if (!this.themeToggleBtn) {
            console.warn('⚠️ 主题切换按钮未找到');
            return;
        }
        
        // 从 localStorage 恢复主题
        const savedTheme = localStorage.getItem('cheetah_theme') || 'light';
        this.applyTheme(savedTheme);
        
        // 绑定切换事件
        this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
        
        console.log('✅ 主题系统初始化完成');
    }
    
    /**
     * 切换主题
     */
    toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme(newTheme);
    }
    
    /**
     * 应用主题
     * @param {string} theme - 主题名称 ('light' | 'dark')
     */
    applyTheme(theme) {
        this.currentTheme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        
        // --- 修改开始 ---
        // 更新按钮图标
        if (this.themeToggleBtn) {
            const themeIconImg = this.themeToggleBtn.querySelector('img'); // 获取按钮内的 img 元素

            if (themeIconImg) {
                // 根据主题设置不同的图标源
                themeIconImg.src = theme === 'light' ? 'assets/SolarMoonStarsBold.svg' : 'assets/IconoirSunLight.svg';
                // themeIconImg.alt = theme === 'light' ? '切换深色' : '切换浅色'; // 可选：更新 alt 文本
            } else {
                console.warn('⚠️ 未找到主题切换按钮内的 img 元素');
                // 如果找不到 img，可以保留或移除文本回退逻辑
                this.themeToggleBtn.textContent = theme === 'light' ? '🌙' : '☀️';
            }
            this.themeToggleBtn.title = theme === 'light' ? '切换到深色模式' : '切换到浅色模式';

            // 移除或注释掉原来修改 textContent 的行 (如果上面没有保留回退逻辑)
            // this.themeToggleBtn.textContent = theme === 'light' ? '🌙' : '☀️';
        }
        // --- 修改结束 ---
        
        // 保存到 localStorage
        localStorage.setItem('cheetah_theme', theme);
        
        // 同步 Milkdown 编辑器主题
        if (milkdownEditor && milkdownEditor.setTheme) {
            milkdownEditor.setTheme(theme);
        }
        
        console.log(`🎨 主题已切换: ${theme}`);
    }
    
    /**
     * 获取当前主题
     * @returns {string} 当前主题名称
     */
    getCurrentTheme() {
        return this.currentTheme;
    }
}

// 创建单例
const themeManager = new ThemeManager();


// ES Module 导出
export {
    themeManager
};


console.log('✅ theme.js 加载完成');