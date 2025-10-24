// src/js/graph.js
'use strict';

import { appState } from './core/AppState.js';
import { eventBus } from './core/EventBus.js';
import { TauriAPI } from './core/TauriAPI.js';
// import { tabManager } from './tab_manager.js'; // 关系图谱不再需要打开标签页

console.log('📜 graph.js 开始加载 (关系图谱功能已移除)...');

let hasSubscribed = false; // 保持这个变量，以防止重复初始化

/**
 * 关系图谱类 (功能已移除)
 */
class Graph {
    constructor() {
        // 保留构造函数，但内容置空或简化
        // this.graphContainer = null;
        // this.network = null;
        // this.graphData = null;
        this.init();
    }

    /**
     * 初始化图谱 (简化)
     */
    init() {
        if (hasSubscribed) {
            console.warn('⚠️ graph.js 尝试重复初始化 (关系图谱功能已移除)');
            return;
        }
        hasSubscribed = true;
        // 移除 graphContainer 的获取
        // this.graphContainer = document.getElementById('graph-container');
        // if (!this.graphContainer) {
        //     console.error('❌ 关系图谱容器 #graph-container 未找到');
        //     return;
        // }

        // 订阅事件 (简化，只保留日志)
        this.subscribeToEvents();
        console.log('✅ 关系图谱模块已加载 (功能已禁用)');
    }

    /**
     * 订阅事件 (简化)
     */
    subscribeToEvents() {
        // 订阅“打开关系图谱”事件，但什么都不做
        eventBus.on('graph:show', () => {
            console.log('ℹ️ 尝试显示关系图谱，但功能已移除。');
            // this.show(); // 移除调用
        });

        // 其他订阅可以保留，用于 needsRefresh 的日志，但实际功能移除
        eventBus.on('workspace:opened', () => {
            // this.loadData(); // 移除调用
            console.log('ℹ️ 工作区已打开 (关系图谱无需预加载数据)');
        });
        eventBus.on('file:saved', () => this.needsRefresh());
        eventBus.on('file:renamed', () => this.needsRefresh());
        eventBus.on('file:deleted', () => this.needsRefresh());
    }

    /**
     * 标记图谱数据需要刷新 (简化)
     */
    needsRefresh() {
        // this.graphData = null; // 移除数据缓存清理
        console.log('🔄 关系图谱数据已标记为需要刷新 (功能已移除)');
    }

    /**
     * 显示图谱 (功能移除)
     */
    async show() {
        console.log('ℹ️ 尝试显示关系图谱，但功能已移除。');
        // 所有原有逻辑移除
    }

    /**
     * 从后端加载图谱数据 (功能移除)
     */
    async loadData() {
        console.log('ℹ️ 尝试加载关系图谱数据，但功能已移除。');
        // 所有原有逻辑移除
    }

    /**
     * 渲染图谱 (功能移除)
     */
    render() {
        console.log('ℹ️ 尝试渲染关系图谱，但功能已移除。');
        // 所有原有逻辑移除
    }
}

// 创建单例，但它现在是一个空壳
const graphView = new Graph();

// ES Module 导出
export { graphView };

console.log('✅ graph.js 加载完成 (关系图谱功能已移除)');