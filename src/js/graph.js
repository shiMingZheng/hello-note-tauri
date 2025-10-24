// src/js/graph.js
'use strict';

import { appState } from './core/AppState.js';
import { eventBus } from './core/EventBus.js';
// [重构] 步骤 2: 导入封装好的 TauriAPI
// 之前: const { invoke } = window.__TAURI__.core;
import { TauriAPI } from './core/TauriAPI.js';
import { tabManager } from './tab_manager.js';

console.log('📜 graph.js 开始加载...');

// [重构] 步骤 2: 在模块顶部缓存全局库
// 这是在 ES 模块中处理非模块化第三方库 (如 vis.js) 的标准做法
// 它将隐式的全局依赖 (window.vis) 变成了模块顶层的显式依赖
const vis = window.vis; 
let hasSubscribed = false;
/**
 * 关系图谱类
 */
class Graph {
    constructor() {
        this.graphContainer = null;
        this.network = null;
        this.graphData = null;
        this.init();
    }
    
    /**
     * 初始化图谱
     */
    init() {
		if (hasSubscribed) {
			console.warn('⚠️ graph.js 尝试重复订阅事件，已跳过');
			return;
		}
	
		hasSubscribed = true;
        this.graphContainer = document.getElementById('graph-container');
		
        if (!this.graphContainer) {
            console.error('❌ 关系图谱容器 #graph-container 未找到');
            return;
        }

        // 订阅事件
        this.subscribeToEvents();
        console.log('✅ 关系图谱已订阅事件');
    }

    /**
     * 订阅事件
     */
    subscribeToEvents() {
        // 订阅“打开关系图谱”事件（通常由侧边栏按钮触发）
        eventBus.on('graph:show', () => {
            this.show();
        });

        // 订阅“工作区打开”事件，以预加载数据
        eventBus.on('workspace:opened', () => {
            this.loadData();
        });

        // 订阅“文件保存/重命名/删除”事件，以刷新数据
        eventBus.on('file:saved', () => this.needsRefresh());
        eventBus.on('file:renamed', () => this.needsRefresh());
        eventBus.on('file:deleted', () => this.needsRefresh());
    }

    /**
     * 标记图谱数据需要刷新
     */
    needsRefresh() {
        this.graphData = null; // 清空缓存，下次打开时将重新加载
        console.log('🔄 关系图谱数据已标记为需要刷新');
    }

    /**
     * 显示图谱（打开弹窗）
     */
    async show() {
        if (!this.graphContainer) return;
        
        // TODO: 这里可以添加显示弹窗的逻辑 (例如 modal.show())
        
        // 确保数据已加载
        if (!this.graphData) {
            await this.loadData();
        }

        // 渲染图谱
        if (this.graphData) {
            this.render();
        }
    }

    /**
     * 从后端加载图谱数据
     */
    async loadData() {
        console.log('🔄 正在加载关系图谱数据...');
        if (!appState.rootPath) {
            console.warn('⚠️ 无法加载图谱，rootPath 未设置');
            return;
        }

        try {
            // [重构] 步骤 2: 使用封装的 TauriAPI
            // 之前: const data = await invoke('get_graph_data');
            const data = await TauriAPI.links.getGraphData();
            
            this.graphData = data;
            console.log(`✅ 关系图谱数据加载成功: ${data.nodes.length} 个节点, ${data.edges.length} 条边`);
        } catch (error) {
            console.error('❌ 加载关系图谱数据失败:', error);
        }
    }

    /**
     * 渲染图谱
     */
    render() {
        console.log('🎨 正在渲染关系图谱...');
        
        // [重构] 步骤 2: 使用局部的 'vis' 常量
        // 之前: if (!window.vis) {
        if (!vis) {
            console.error('❌ 渲染失败: vis.js 库未加载');
            this.graphContainer.innerHTML = '错误: vis.js 库未加载';
            return;
        }

        if (!this.graphData) {
            console.warn('⚠️ 渲染被跳过：没有图谱数据');
            return;
        }

        // 1. 创建数据集
        // [重构] 步骤 2: 使用局部的 'vis' 常量
        // 之前: const nodes = new window.vis.DataSet(
        const nodes = new vis.DataSet(
            this.graphData.nodes.map(n => ({
                id: n.id,
                label: n.label,
                title: n.path
            }))
        );

        // [重构] 步骤 2: 使用局部的 'vis' 常量
        // 之前: const edges = new window.vis.DataSet(
        const edges = new vis.DataSet(
            this.graphData.edges.map(e => ({
                from: e.source,
                to: e.target
            }))
        );

        // 2. 配置选项
        const options = {
            nodes: {
                shape: 'dot',
                size: 16,
                font: {
                    size: 14,
                    color: '#333'
                },
                borderWidth: 2
            },
            edges: {
                width: 1,
                arrows: {
                    to: { enabled: true, scaleFactor: 0.5 }
                }
            },
            physics: {
                forceAtlas2Based: {
                    gravitationalConstant: -26,
                    centralGravity: 0.005,
                    springLength: 230,
                    springConstant: 0.18
                },
                maxVelocity: 146,
                solver: 'forceAtlas2Based',
                timestep: 0.35,
                stabilization: { iterations: 150 }
            },
            interaction: {
                tooltipDelay: 200,
                hideEdgesOnDrag: true
            }
        };

        // 3. 创建网络
        const data = { nodes: nodes, edges: edges };
        
        // [重构] 步骤 2: 使用局部的 'vis' 常量
        // 之前: this.network = new window.vis.Network(this.graphContainer, data, options);
        this.network = new vis.Network(this.graphContainer, data, options);

        // 4. 绑定事件
        this.network.on('click', (params) => {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const node = nodes.get(nodeId);
                console.log('🖱️ 点击了图谱节点:', node.title);
                if (node.title) {
                    // 使用事件总线打开文件
                    eventBus.emit('open-tab', node.title);
                    // TODO: 关闭图谱弹窗
                }
            }
        });
        
        console.log('✅ 关系图谱渲染完成');
    }
}

// 创建单例
const graphView = new Graph();

// ES Module 导出
export { graphView };

console.log('✅ graph.js 加载完成');