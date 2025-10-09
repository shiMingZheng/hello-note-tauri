// src/js/theme.js - 主题管理模块

'use strict';
console.log('📜 theme.js 开始加载...');

const THEME_STORAGE_KEY = 'cheetah_theme';
const THEMES = {
    LIGHT: 'light',
    DARK: 'dark'
};

/**
 * 主题管理器
 */
const themeManager = {
    currentTheme: THEMES.LIGHT,
    themeToggleBtn: null,

    /**
     * 初始化主题系统
     */
    init() {
        console.log('🎨 初始化主题系统...');
        
        this.themeToggleBtn = document.getElementById('theme-toggle-btn');
        
        if (!this.themeToggleBtn) {
            console.warn('⚠️ 未找到主题切换按钮');
            return;
        }

        // 绑定切换按钮事件
        this.themeToggleBtn.addEventListener('click', () => this.toggle());

        // 恢复用户上次选择的主题
        this.restore();

        console.log('✅ 主题系统初始化完成');
    },

    /**
     * 获取当前主题
     */
    getCurrent() {
        return this.currentTheme;
    },

    /**
     * 设置主题
     */
    set(theme) {
        if (!Object.values(THEMES).includes(theme)) {
            console.warn(`⚠️ 无效的主题: ${theme}`);
            return;
        }

        console.log(`🎨 切换主题: ${this.currentTheme} -> ${theme}`);

        this.currentTheme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        
        // 更新按钮图标
        this.updateToggleButton();

        // 持久化到 localStorage
        this.save();

        console.log(`✅ 主题已切换到: ${theme}`);
    },

    /**
     * 切换主题
     */
    toggle() {
        const newTheme = this.currentTheme === THEMES.LIGHT 
            ? THEMES.DARK 
            : THEMES.LIGHT;
        
        this.set(newTheme);
    },

    /**
     * 更新切换按钮的图标
     */
    updateToggleButton() {
        if (!this.themeToggleBtn) return;

        // 浅色主题显示月亮图标（点击切换到深色）
        // 深色主题显示太阳图标（点击切换到浅色）
        const icon = this.currentTheme === THEMES.LIGHT ? '🌙' : '☀️';
        const title = this.currentTheme === THEMES.LIGHT 
            ? '切换到深色主题' 
            : '切换到浅色主题';

        this.themeToggleBtn.textContent = icon;
        this.themeToggleBtn.title = title;
    },

    /**
     * 保存主题偏好到 localStorage
     */
    save() {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, this.currentTheme);
        } catch (error) {
            console.warn('⚠️ 保存主题失败:', error);
        }
    },

    /**
     * 从 localStorage 恢复主题偏好
     */
    restore() {
        try {
            const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
            
            if (savedTheme && Object.values(THEMES).includes(savedTheme)) {
                console.log(`🔄 恢复主题: ${savedTheme}`);
                this.set(savedTheme);
            } else {
                // 默认使用浅色主题
                this.set(THEMES.LIGHT);
            }
        } catch (error) {
            console.warn('⚠️ 恢复主题失败:', error);
            this.set(THEMES.LIGHT);
        }
    },

    /**
     * 获取系统主题偏好（可选功能）
     */
    detectSystemTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return THEMES.DARK;
        }
        return THEMES.LIGHT;
    },

    /**
     * 监听系统主题变化（可选功能）
     */
    watchSystemTheme() {
        if (!window.matchMedia) return;

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        
        mediaQuery.addEventListener('change', (e) => {
            console.log('🔄 系统主题已变化:', e.matches ? 'dark' : 'light');
            // 如果需要，可以在这里自动跟随系统主题
            // this.set(e.matches ? THEMES.DARK : THEMES.LIGHT);
        });
    }
};

// 在 DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM 加载完成，初始化主题系统');
    themeManager.init();
});

// 导出到全局
window.themeManager = themeManager;
window.THEMES = THEMES;

console.log('✅ theme.js 加载完成');
