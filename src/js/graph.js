// src/js/graph.js
'use strict';

import { appState } from './core/AppState.js';
import { showError } from './ui-utils.js';

console.log('📜 graph.js 开始加载...');

const { invoke } = window.__TAURI__.core;

class GraphView {
    constructor() {
        if (GraphView.instance) {
            return GraphView.instance;
        }
        
        this.graphViewBtn = null;
        this.graphOverlay = null;
        this.graphContainer = null;
        this.closeGraphBtn = null;
        this.network = null;
        
        GraphView.instance = this;
    }
    
    /**
     * 初始化图谱功能
     */
    init() {
        console.log('🎯 初始化关系图谱...');
        
        this.graphViewBtn = document.getElementById('graph-view-btn');
        
        if (!this.graphViewBtn) {
            console.warn('⚠️ 图谱按钮未找到');
            return;
        }
        
        // 创建图谱覆盖层
        this.createGraphOverlay();
        
        // 绑定事件
        this.graphViewBtn.addEventListener('click', () => this.openGraph());
        
        console.log('✅ 关系图谱初始化完成');
    }
    
    /**
     * 创建图谱覆盖层
     */
    createGraphOverlay() {
        this.graphOverlay = document.createElement('div');
        this.graphOverlay.id = 'graph-overlay';
        this.graphOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            z-index: 9999;
            display: none;
            align-items: center;
            justify-content: center;
        `;
        
        const graphPanel = document.createElement('div');
        graphPanel.style.cssText = `
            width: 90%;
            height: 90%;
            background: var(--bg-primary);
            border-radius: 10px;
            position: relative;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        `;
        
        // 关闭按钮
        this.closeGraphBtn = document.createElement('button');
        this.closeGraphBtn.textContent = '✕';
        this.closeGraphBtn.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            width: 36px;
            height: 36px;
            border: none;
            background: var(--danger-color);
            color: white;
            border-radius: 50%;
            font-size: 20px;
            cursor: pointer;
            z-index: 10;
        `;
        this.closeGraphBtn.addEventListener('click', () => this.closeGraph());
        
        // 图谱容器
        this.graphContainer = document.createElement('div');
        this.graphContainer.id = 'graph-container';
        this.graphContainer.style.cssText = `
            width: 100%;
            height: 100%;
            border-radius: 10px;
        `;
        
        graphPanel.appendChild(this.closeGraphBtn);
        graphPanel.appendChild(this.graphContainer);
        this.graphOverlay.appendChild(graphPanel);
        document.body.appendChild(this.graphOverlay);
    }
    
    /**
     * 打开图谱视图
     */
    async openGraph() {
        if (!appState.rootPath) {
            showError('请先打开一个笔记仓库');
            return;
        }
        
        console.log('🌐 打开关系图谱...');
        
        try {
            // 从后端获取图谱数据
            const graphData = await invoke('get_graph_data');
            
            if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
                showError('没有找到笔记链接关系');
                return;
            }
            
            console.log(`📊 图谱数据: ${graphData.nodes.length} 个节点, ${graphData.edges.length} 条边`);
            
            // 显示覆盖层
            this.graphOverlay.style.display = 'flex';
            
            // 渲染图谱
            this.renderGraph(graphData);
            
        } catch (error) {
            console.error('❌ 加载图谱失败:', error);
            showError('加载图谱失败: ' + error);
        }
    }
    
    /**
     * 关闭图谱视图
     */
    closeGraph() {
        this.graphOverlay.style.display = 'none';
        
        if (this.network) {
            this.network.destroy();
            this.network = null;
        }
        
        console.log('🔒 关系图谱已关闭');
    }
    
    /**
     * 渲染图谱
     * @param {Object} graphData - 图谱数据
     */
    renderGraph(graphData) {
        if (!window.vis) {
            console.error('❌ vis-network 库未加载');
            showError('图谱库加载失败');
            return;
        }
        
        // 转换数据格式
        const nodes = new window.vis.DataSet(
            graphData.nodes.map(node => ({
                id: node.id,
                label: node.title || node.id,
                title: node.path
            }))
        );
        
        const edges = new window.vis.DataSet(
            graphData.edges.map(edge => ({
                from: edge.from,
                to: edge.to,
                arrows: 'to'
            }))
        );
        
        const data = { nodes, edges };
        
        // 配置选项
        const options = {
            nodes: {
                shape: 'box',
                margin: 10,
                widthConstraint: {
                    maximum: 200
                },
                font: {
                    size: 14,
                    color: '#333'
                },
                color: {
                    background: '#97C2FC',
                    border: '#2B7CE9',
                    highlight: {
                        background: '#FFA500',
                        border: '#FF8C00'
                    }
                }
            },
            edges: {
                width: 2,
                color: { color: '#848484' },
                smooth: {
                    type: 'continuous'
                }
            },
            physics: {
                stabilization: {
                    iterations: 200
                },
                barnesHut: {
                    gravitationalConstant: -8000,
                    springConstant: 0.04,
                    springLength: 95
                }
            },
            interaction: {
                hover: true,
                navigationButtons: true,
                keyboard: true
            }
        };
        
        // 创建网络图
        this.network = new window.vis.Network(this.graphContainer, data, options);
        
        // 绑定点击事件
        this.network.on('click', (params) => {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const node = graphData.nodes.find(n => n.id === nodeId);
                
                if (node && window.tabManager) {
                    console.log('📄 打开笔记:', node.path);
                    window.tabManager.openTab(node.path);
                    this.closeGraph();
                }
            }
        });
        
        console.log('✅ 图谱渲染完成');
    }
}

// 创建单例
const graphView = new GraphView();

// ES Module 导出
export {
    graphView
};


console.log('✅ graph.js 加载完成');