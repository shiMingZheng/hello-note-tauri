// src/js/graph.js

'use strict';
console.log('📜 graph.js 开始加载...');

let graphViewBtn, graphOverlay, closeGraphBtn, graphContainer;
let network = null; // 用于存储图谱实例

function initializeGraph() {
    graphViewBtn = document.getElementById('graph-view-btn');
    graphOverlay = document.getElementById('graph-overlay');
    closeGraphBtn = document.getElementById('close-graph-btn');
    graphContainer = document.getElementById('graph-container');

    graphViewBtn.addEventListener('click', openGraphView);
    closeGraphBtn.addEventListener('click', closeGraphView);
}

async function openGraphView() {
    graphOverlay.style.display = 'flex';

    try {
        // 从后端获取节点和边的数据
        const graphData = await invoke('get_graph_data');

        // vis-network 的数据格式
        const nodes = new vis.DataSet(graphData.nodes);
        const edges = new vis.DataSet(graphData.edges);

        // vis-network 的配置选项
        const options = {
            nodes: {
                shape: 'dot',
                size: 16,
                font: {
                    size: 66,
                    color: '#ffffff'
                },
                borderWidth: 2,
                color: {
                    background: '#3B82F6',
                    border: '#8EB9F9',
                }
            },
            edges: {
                width: 1,
                color: {
                    color: '#8D8D8D',
                    highlight: '#ffffff'
                }
            },
            physics: {
                enabled: true,
                barnesHut: {
                    gravitationalConstant: -15000,
                    centralGravity: 0.1,
                    springLength: 150,
                },
            },
            interaction: {
                hover: true,
                tooltipDelay: 200
            },
        };

        // 创建图谱实例
        network = new vis.Network(graphContainer, { nodes, edges }, options);

        // 为图谱节点添加点击事件
        network.on("click", function (params) {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const nodeData = nodes.get(nodeId); // 从 DataSet 中获取节点完整信息
                if (nodeData && nodeData.path) {
                    tabManager.openTab(nodeData.path);
                    closeGraphView();
                }
            }
        });

    } catch (error) {
        console.error("加载关系图谱失败:", error);
        graphContainer.innerHTML = `<p style="color: white; text-align: center;">加载图谱数据失败: ${error}</p>`;
    }
}

function closeGraphView() {
    graphOverlay.style.display = 'none';
    // 销毁旧的图谱实例以释放内存
    if (network) {
        network.destroy();
        network = null;
    }
    graphContainer.innerHTML = '';
}

document.addEventListener('DOMContentLoaded', initializeGraph);