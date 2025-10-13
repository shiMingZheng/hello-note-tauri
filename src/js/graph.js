// 位置：src/js/graph.js
// 改造点：整个文件需要重写

'use strict';
console.log('📜 graph.js 开始加载...');

let graphViewBtn, graphOverlay, closeGraphBtn, graphContainer;
let network = null;
let visModule = null; // 【新增】存储 vis-network 模块

// 【新增】动态加载 vis-network
async function loadVisNetwork() {
    if (visModule) return visModule;
    
    console.log('📦 动态加载 vis-network...');
    
    // 【改进】等待 CSS 加载完成
    if (!document.querySelector('link[href*="vis-network"]')) {
        await new Promise((resolve) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'vendor/vis/vis-network.min.css';
            link.onload = resolve;
            link.onerror = () => {
                console.warn('⚠️ vis-network CSS 加载失败，使用默认样式');
                resolve(); // 即使失败也继续
            };
            document.head.appendChild(link);
        });
    }
    
    // 【改进】添加超时机制
    if (!window.vis) {
        await Promise.race([
            new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'vendor/vis/vis-network.min.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('加载超时')), 10000)
            )
        ]);
    }
    
    visModule = window.vis;
    console.log('✅ vis-network 加载完成');
    return visModule;
}

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
	 // 【新增】显示加载提示
    graphContainer.innerHTML = `
        <div style="color: white; text-align: center; padding: 40px;">
            <div style="font-size: 24px; margin-bottom: 10px;">🔄</div>
            <div>正在加载关系图谱...</div>
        </div>
    `;


    try {
        // 【新增】动态加载 vis-network
        const vis = await loadVisNetwork();
		// 清空加载提示
        graphContainer.innerHTML = '';

        
        const graphData = await invoke('get_graph_data');
        const nodes = new vis.DataSet(graphData.nodes);
        const edges = new vis.DataSet(graphData.edges);

        const options = {
            nodes: {
                shape: 'dot',
                size: 16,
                font: { size: 66, color: '#ffffff' },
                borderWidth: 2,
                color: { background: '#3B82F6', border: '#8EB9F9' }
            },
            edges: {
                width: 1,
                color: { color: '#8D8D8D', highlight: '#ffffff' }
            },
            physics: {
                enabled: true,
                barnesHut: {
                    gravitationalConstant: -15000,
                    centralGravity: 0.1,
                    springLength: 150,
                }
            },
            interaction: { hover: true, tooltipDelay: 200 }
        };

        network = new vis.Network(graphContainer, { nodes, edges }, options);

        network.on("click", function (params) {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const nodeData = nodes.get(nodeId);
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

// 位置：graph.js closeGraphView 函数
function closeGraphView() {
    graphOverlay.style.display = 'none';
    
    if (network) {
        try {
            // 【新增】先移除所有事件监听器
            network.off('click');
            network.off('hoverNode');
            network.off('blurNode');
            
            network.destroy();
            network = null;
            console.log('🗑️ vis-network 实例已销毁');
        } catch (error) {
            console.warn('销毁图谱时出错:', error);
        }
    }
    
    // 【关键】清空容器并强制清理 Canvas
    graphContainer.innerHTML = '';
    
    // 【新增】尝试手动释放 Canvas（如果存在）
    const canvases = graphContainer.querySelectorAll('canvas');
    canvases.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        canvas.width = 0;
        canvas.height = 0;
    });
    
    // 【新增】强制垃圾回收提示（浏览器可能会忽略）
    if (window.gc) {
        window.gc();
        console.log('♻️ 已请求垃圾回收');
    }
}

document.addEventListener('DOMContentLoaded', initializeGraph);