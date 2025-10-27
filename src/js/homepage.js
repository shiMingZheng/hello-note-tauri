// src/js/homepage.js

'use strict';
import { appState } from './core/AppState.js';
import { eventBus } from './core/EventBus.js';
import { invoke } from './core/TauriAPI.js';
import { showError } from './ui-utils.js'; // ⭐ 引入 showError
import { showContextMenu } from './context-menu.js'; // ⭐ 引入 showContextMenu
import { domElements } from './dom-init.js'; // ⭐ 引入 domElements

console.log('📜 homepage.js 开始加载...');

let historyListElement;
// ⭐ 修改: 重命名 pinnedNotesGridElement 为 homepageGridElement
let homepageGridElement;
// ⭐ 新增: 切换按钮引用
let showPinnedBtn, showFavoritesBtn;
// ⭐ 新增: 当前视图状态
let currentHomepageView = 'pinned'; // 默认显示置顶

// --- ⭐⭐⭐ 醒目标记：将函数定义移到 initializeHomepage 之前 ---

// ⭐ 切换首页视图函数
function switchHomepageView(viewType) {
    // --- ⭐⭐⭐ 醒目标记：添加日志确认函数被调用 ---
    console.log(`🚀 Calling switchHomepageView with type: ${viewType}`);
    // --- ⭐⭐⭐ 标记结束 ---

    if (currentHomepageView === viewType) {
        console.log(`   视图已经是 ${viewType}，无需切换`);
        return; // 如果视图未改变，则不执行任何操作
    }


    console.log(`🔄 切换首页视图到: ${viewType}`);
    currentHomepageView = viewType;

    // 更新按钮激活状态 (添加存在性检查)
    if (showPinnedBtn) {
        showPinnedBtn.classList.toggle('active', viewType === 'pinned');
         console.log(`   按钮 'showPinnedBtn' active state: ${viewType === 'pinned'}`);
    } else {
        console.warn("   switchHomepageView: showPinnedBtn is null");
    }
    if (showFavoritesBtn) {
        showFavoritesBtn.classList.toggle('active', viewType === 'favorites');
         console.log(`   按钮 'showFavoritesBtn' active state: ${viewType === 'favorites'}`);
    } else {
        console.warn("   switchHomepageView: showFavoritesBtn is null");
    }

    // 加载对应的数据
    loadHomepageGrid(viewType);
}

function initializeHomepage() {
    historyListElement = domElements.historyList; // 使用 domElements
    // ⭐ 修改: 获取新的 grid ID
    homepageGridElement = domElements.homepageGrid; // 使用 domElements
    // ⭐ 新增: 获取切换按钮
    showPinnedBtn = domElements.showPinnedBtn; // 使用 domElements
    showFavoritesBtn = domElements.showFavoritesBtn; // 使用 domElements
	
	// --- ⭐⭐⭐ 醒目标记：检查这里的 DOM 获取 ---
    if (!historyListElement) {
        console.error("❌ 严重错误: 未找到 historyListElement (#history-list)");
    }
     if (!homepageGridElement) {
        console.error("❌ 严重错误: 未找到 homepageGridElement (#homepage-grid)");
    }
     if (!showPinnedBtn) {
        console.error("❌ 严重错误: 未找到 showPinnedBtn (#show-pinned-btn)");
    }
     if (!showFavoritesBtn) {
        console.error("❌ 严重错误: 未找到 showFavoritesBtn (#show-favorites-btn)");
    }
     // --- ⭐⭐⭐ 标记结束 ---

    if (!homepageGridElement || !showPinnedBtn || !showFavoritesBtn) {
        console.warn('⚠️ 首页网格或切换按钮未找到');
        return;
    }

    // 绑定切换按钮事件 (添加存在性检查)
    if (showPinnedBtn) {
        showPinnedBtn.addEventListener('click', () => switchHomepageView('pinned'));
    } else {
         console.warn("⚠️ showPinnedBtn 未找到，无法绑定事件");
    }
    if (showFavoritesBtn) {
        showFavoritesBtn.addEventListener('click', () => switchHomepageView('favorites'));
    } else {
         console.warn("⚠️ showFavoritesBtn 未找到，无法绑定事件");
    }

    // 初始加载
    loadHomepageGrid(currentHomepageView);
    loadHistory();

    // --- ⭐⭐⭐ 醒目标记：修改事件监听器回调 ---
    // 修改事件监听器，确保传递 type 属性给 handleHomepageRefresh
    eventBus.on('file:favorited', (data) => {
        console.log("➡️ homepage.js received file:favorited", data); // 添加调试日志
        handleHomepageRefresh({ ...data, type: 'file:favorited' });
    });
    eventBus.on('file:unfavorited', (data) => {
         console.log("➡️ homepage.js received file:unfavorited", data); // 添加调试日志
        handleHomepageRefresh({ ...data, type: 'file:unfavorited' });
    });
    eventBus.on('file:pinned', (data) => {
        console.log("➡️ homepage.js received file:pinned", data); // 添加调试日志
        handleHomepageRefresh({ ...data, type: 'file:pinned' });
    });
    eventBus.on('file:unpinned', (data) => {
         console.log("➡️ homepage.js received file:unpinned", data); // 添加调试日志
        handleHomepageRefresh({ ...data, type: 'file:unpinned' });
    });
    // --- ⭐⭐⭐ 标记结束 ---
    // 删除事件保持不变
    eventBus.on('file:deleted', () => {
         console.log('🔄 收到删除事件，刷新历史和当前首页视图');
        loadHistory();
        loadHomepageGrid(currentHomepageView); // 刷新当前视图
    });

    console.log('✅ homepage 已订阅文件操作和收藏事件');
}


function handleHomepageRefresh(eventData) {
    // --- ⭐⭐⭐ 醒目标记：确认这里的逻辑 ---
    // 检查 eventData 是否有效，以及是否包含 type 属性
    if (!eventData || typeof eventData.type === 'undefined') {
        console.error("❌ handleHomepageRefresh 接收到无效的 eventData:", eventData);
        // 可以选择在这里返回，或者尝试基于其他信息处理，但最好是确保调用者传递了 type
        return;
    }

    const eventType = eventData.type; // 现在应该能正确获取
    console.log(`🔄 [handleHomepageRefresh] 收到事件: ${eventType}, 当前视图: ${currentHomepageView}`);

    const isRelevantEvent = ['file:pinned', 'file:unpinned', 'file:favorited', 'file:unfavorited'].includes(eventType);

    if (isRelevantEvent) {
        console.log(`   ➡️ 事件相关，准备刷新当前视图 (${currentHomepageView})...`);
        loadHomepageGrid(currentHomepageView);
    } else {
        console.log(`   ➡️ 事件 ${eventType} 与首页网格状态变更无关，不刷新网格。`);
    }
    // --- ⭐⭐⭐ 标记结束 ---
}


// 检查数据库是否初始化
async function isDatabaseInitialized() {
    try {
        const workspace = await invoke('get_current_workspace');
        return workspace !== null;
    } catch (error) {
        return false;
    }
}

// 加载历史记录
async function loadHistory() {
    if (!historyListElement) return;

    const hasWorkspace = await isDatabaseInitialized();
    if (!hasWorkspace) {
        historyListElement.innerHTML = '<p class="empty-message">📂 请先打开一个笔记仓库</p>';
        return;
    }

    try {
        const history = await invoke('get_history', { limit: 50 });
        renderHistory(history);
    } catch (error) {
        console.error('加载历史记录失败:', error);
        historyListElement.innerHTML = '<p class="empty-message">加载历史记录失败</p>';
    }
}

// 渲染历史记录
function renderHistory(history) {
    if (!history || history.length === 0) {
        historyListElement.innerHTML = '<p class="empty-message">暂无笔记活动</p>';
        return;
    }

    // 按日期分组
    const groupedByDate = history.reduce((acc, entry) => {
        (acc[entry.event_date] = acc[entry.event_date] || []).push(entry);
        return acc;
    }, {});

    let html = '';
    for (const date in groupedByDate) {
        html += `<div class="history-group"><h3>${date}</h3>`;
        groupedByDate[date].forEach(entry => {
            const eventIcon = entry.event_type === 'created' ? '✨' : '📄';
            const eventText = entry.event_type === 'created' ? '新建' : '编辑';
            const time = entry.event_datetime.split(' ')[1] || '';

            html += `
                <div class="history-item" data-path="${entry.file_path}">
                    <div class="history-item-content">
                        <span class="event-icon" title="${eventText}">${eventIcon}</span>
                        <span class="file-title">${entry.file_title}</span>
                        <span class="time">${time}</span>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }
    historyListElement.innerHTML = html;

    // 绑定点击事件
    historyListElement.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', async () => {
            const path = item.dataset.path;
            if (path) {
                // [修复] 验证文件是否存在
                if (await isFileExists(path)) {
                   
					// 修改这里 👇
					eventBus.emit('open-tab', path);
                } else {
                    showError(`文件不存在: ${path}`);
                    // 刷新历史记录
                    await cleanupInvalidHistory();
                    loadHistory();
                }
            }
        });
    });
}

// ⭐ 重构: 加载首页网格数据 (置顶或收藏)
async function loadHomepageGrid(viewType = 'pinned') {
    if (!homepageGridElement) return;

    const hasWorkspace = await isDatabaseInitialized();
    if (!hasWorkspace) {
        homepageGridElement.innerHTML = '<p class="empty-message">📂 请先打开一个笔记仓库</p>';
        return;
    }

    try {
        let notes;
        if (viewType === 'pinned') {
            notes = await invoke('get_pinned_notes');
        } else if (viewType === 'favorites') {
            notes = await invoke('get_favorited_notes'); // ⭐ 调用新命令
        } else {
            notes = []; // 未知类型，返回空
        }
        renderHomepageGrid(notes, viewType); // ⭐ 调用新的渲染函数
    } catch (error) {
        const errorType = viewType === 'pinned' ? '置顶' : '收藏';
        console.error(`加载${errorType}笔记失败:`, error);
        homepageGridElement.innerHTML = `<p class="empty-message">加载${errorType}笔记失败</p>`;
    }
}

// ⭐ 重构: 渲染首页网格 (置顶或收藏)
function renderHomepageGrid(notes, viewType) {
    if (!homepageGridElement) return;

    homepageGridElement.innerHTML = ''; // 清空

    if (!notes || notes.length === 0) {
        const message = viewType === 'pinned'
            ? '您还没有置顶任何笔记。在左侧文件上右键点击即可置顶。'
            : '您还没有收藏任何笔记。在左侧文件上右键点击即可收藏。';
        homepageGridElement.innerHTML = `<p class="empty-message">${message}</p>`;
        return;
    }

    const icon = viewType === 'pinned' ? '📌' : '⭐'; // ⭐ 根据类型选择图标

    notes.forEach(note => {
        const card = document.createElement('div');
        // ⭐ 使用统一的类名，可以通过 CSS 添加特定类型的样式
        card.className = 'homepage-note-card';
        card.title = note.path;
        card.dataset.path = note.path; // 添加 data-path 以便右键菜单获取

        const fileName = note.title || note.path.split(/[/\\]/).pop().replace('.md', ''); // 使用 title，备用 path

        // ⭐ 使用反引号简化 HTML 字符串
        card.innerHTML = `
            <div class="homepage-note-header">
                <span class="homepage-note-icon">${icon}</span>
                <h4>${fileName}</h4>
            </div>
        `;

        // 点击事件
        card.addEventListener('click', async () => {
            if (await isFileExists(note.path)) {
                 // ⭐ 使用 tabManager.openTab 方法直接打开
			
			eventBus.emit('open-tab', path);
            } else {
                showError(`文件不存在: ${note.path}`);
                // 如果文件不存在，从当前视图移除（取消置顶或取消收藏）
                try {
                    if (viewType === 'pinned') {
                        await invoke('unpin_note', { relativePath: note.path });
                    } else {
                        await invoke('unfavorite_note', { relativePath: note.path }); // ⭐ 调用取消收藏
                    }
                    loadHomepageGrid(viewType); // 重新加载当前视图
                } catch (removeError) {
                    console.error(`自动取消${viewType === 'pinned' ? '置顶' : '收藏'}失败:`, removeError);
                }
            }
        });

        // 右键菜单事件
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const file_obj = {
                path: note.path,
                is_dir: false,
                name: fileName,
                // ⭐ 传递来源信息，告知 context-menu 这是来自哪个区域
                from: viewType === 'pinned' ? 'pinned-section' : 'favorites-section'
            };
            // ⭐ 假设 contextTarget 会被 showContextMenu 设置
            // appState.contextTarget = file_obj;
            showContextMenu(e, file_obj);
        });

        homepageGridElement.appendChild(card);
    });
}



// [新增] 验证文件是否存在
async function isFileExists(relativePath) {
    if (!appState.rootPath) return false;
    
    try {
        await invoke('read_file_content', {
            rootPath: appState.rootPath,
            relativePath: relativePath
        });
        return true;
    } catch (error) {
        console.warn(`文件不存在: ${relativePath}`, error);
        return false;
    }
}

// [新增] 清理无效的历史记录
async function cleanupInvalidHistory() {
    try {
        await invoke('cleanup_invalid_history',{rootPath: appState.rootPath} );
        console.log('✅ 清理无效历史记录完成');
    } catch (error) {
        console.warn('清理历史记录失败:', error);
    }
}

// ES Module 导出
export {
	initializeHomepage,
    // ⭐ 修改: 导出新的加载函数
    loadHomepageGrid,
    loadHistory,
    isFileExists,
    cleanupInvalidHistory
};

console.log('✅ homepage.js 加载完成');

// ⭐ 订阅置顶相关事件

console.log('✅ homepage 已订阅文件操作事件');