// src/js/homepage.js
'use strict';
import { appState } from './core/AppState.js';
import { eventBus } from './core/EventBus.js';
import { invoke } from './core/TauriAPI.js';
import { domElements } from './dom-init.js';  // ✅ 导入 domElements
import { showError } from './ui-utils.js';
import { showContextMenu } from './context-menu.js';

console.log('📜 homepage.js 开始加载...');

// ❌ 删除所有模块级变量声明
// let pinnedNotesGridElement, historyListElement, favoritedNotesGridElement;
// let pinnedTab, favoritedTab, pinnedSection, favoritedSection;

function initializeHomepage() {
    // ❌ 删除所有赋值操作
    // pinnedNotesGridElement = domElements.pinnedNotesGrid;
    // ...
    
    // ✅ 直接绑定事件
    if (domElements.pinnedTab && domElements.favoritedTab) {
        domElements.pinnedTab.addEventListener('click', switchToPinnedTab);
        domElements.favoritedTab.addEventListener('click', switchToFavoritedTab);
        console.log('✅ 收藏 Tab 切换功能已绑定');
    }

    loadPinnedNotes();
    loadHistory();
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
    if (!domElements.historyList) return;  // ✅ 直接使用 domElements

    const hasWorkspace = await isDatabaseInitialized();
    if (!hasWorkspace) {
        domElements.historyList.innerHTML = '<p class="empty-message">📂 请先打开一个笔记仓库</p>';
        return;
    }

    try {
        const history = await invoke('get_history', { limit: 50 });
        renderHistory(history);
    } catch (error) {
        console.error('加载历史记录失败:', error);
        domElements.historyList.innerHTML = '<p class="empty-message">加载历史记录失败</p>';
    }
}

// 渲染历史记录
function renderHistory(history) {
    if (!history || history.length === 0) {
        domElements.historyList.innerHTML = '<p class="empty-message">暂无笔记活动</p>';
        return;
    }

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
    domElements.historyList.innerHTML = html;

    domElements.historyList.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', async () => {
            const path = item.dataset.path;
            if (path) {
                if (await isFileExists(path)) {
                    eventBus.emit('open-tab', path);
                } else {
                    showError(`文件不存在: ${path}`);
                    await cleanupInvalidHistory();
                    loadHistory();
                }
            }
        });
    });
}

// 加载置顶笔记
async function loadPinnedNotes() {
    if (!domElements.pinnedNotesGrid) return;  // ✅ 直接使用

    const hasWorkspace = await isDatabaseInitialized();
    if (!hasWorkspace) {
        domElements.pinnedNotesGrid.innerHTML = '<p class="empty-message">📂 请先打开一个笔记仓库</p>';
        return;
    }

    try {
        const pinnedNotes = await invoke('get_pinned_notes');
        renderPinnedNotes(pinnedNotes);
    } catch (error) {
        console.error('加载置顶笔记失败:', error);
        domElements.pinnedNotesGrid.innerHTML = '<p class="empty-message">加载置顶笔记失败</p>';
    }
}

// 渲染置顶笔记
function renderPinnedNotes(notes) {
    if (!domElements.pinnedNotesGrid) return;

    domElements.pinnedNotesGrid.innerHTML = '';

    if (!notes || notes.length === 0) {
        domElements.pinnedNotesGrid.innerHTML = '<p class="empty-message">您还没有置顶任何笔记。在左侧文件上右键点击即可置顶。</p>';
        return;
    }

    notes.forEach(note => {
        const card = document.createElement('div');
        card.className = 'pinned-note-card';
        card.title = note.path;
        
        const fileName = note.path.split(/[/\\]/).pop().replace('.md', '');
        
        card.innerHTML = `
            <div class="pinned-note-header">
                <span class="pinned-icon">📌</span>
                <h4>${fileName}</h4>
            </div>
        `;

        card.addEventListener('click', async () => {
            if (await isFileExists(note.path)) {
                eventBus.emit('open-tab', note.path);
            } else {
                showError(`文件不存在: ${note.path}`);
                await invoke('unpin_note', { relativePath: note.path });
                loadPinnedNotes();
            }
        });

        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const file_obj = { 
                path: note.path, 
                is_dir: false, 
                name: fileName,
                from: 'pinned-section'
            };
            showContextMenu(e, file_obj);
        });

        domElements.pinnedNotesGrid.appendChild(card);
    });
}

// 验证文件是否存在
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

// 清理无效的历史记录
async function cleanupInvalidHistory() {
    try {
        await invoke('cleanup_invalid_history', {rootPath: appState.rootPath});
        console.log('✅ 清理无效历史记录完成');
    } catch (error) {
        console.warn('清理历史记录失败:', error);
    }
}

// ============================================
// 收藏功能
// ============================================

async function loadFavoritedNotes() {
    if (!domElements.favoritedNotesGrid) return;  // ✅ 直接使用

    const hasWorkspace = await isDatabaseInitialized();
    if (!hasWorkspace) {
        domElements.favoritedNotesGrid.innerHTML = '<p class="empty-message">📂 请先打开一个笔记仓库</p>';
        return;
    }

    try {
        const favoritedNotes = await invoke('get_favorited_notes');
        renderFavoritedNotes(favoritedNotes);
    } catch (error) {
        console.error('❌ 加载收藏笔记失败:', error);
        domElements.favoritedNotesGrid.innerHTML = '<p class="empty-message">加载收藏失败</p>';
    }
}

function renderFavoritedNotes(notes) {
    if (!domElements.favoritedNotesGrid) return;

    domElements.favoritedNotesGrid.innerHTML = '';

    if (!notes || notes.length === 0) {
        domElements.favoritedNotesGrid.innerHTML = '<p class="empty-message">您还没有收藏任何笔记。在左侧文件上右键点击即可收藏。</p>';
        return;
    }

    notes.forEach(note => {
        const card = document.createElement('div');
        card.className = 'pinned-note-card';
        card.title = note.path;
        
        const fileName = note.path.split(/[/\\]/).pop().replace('.md', '');
        
        card.innerHTML = `
            <div class="pinned-note-header">
                <span class="pinned-icon">⭐</span>
                <h4>${fileName}</h4>
            </div>
        `;

        card.addEventListener('click', async () => {
            if (await isFileExists(note.path)) {
                eventBus.emit('open-tab', note.path);
            } else {
                showError(`文件不存在: ${note.path}`);
                await invoke('unfavorite_note', { relativePath: note.path });
                loadFavoritedNotes();
            }
        });

        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const file_obj = { 
                path: note.path, 
                is_dir: false, 
                name: fileName,
                from: 'favorited-section'
            };
            showContextMenu(e, file_obj);
        });

        domElements.favoritedNotesGrid.appendChild(card);
    });
}

function switchToPinnedTab() {
    if (!domElements.pinnedTab || !domElements.favoritedTab) return;
    
    domElements.pinnedTab.classList.add('active');
    domElements.favoritedTab.classList.remove('active');
    domElements.pinnedSection.style.display = 'block';
    domElements.favoritedSection.style.display = 'none';
    
    loadPinnedNotes();
    console.log('📌 切换到置顶 Tab');
}

function switchToFavoritedTab() {
    if (!domElements.pinnedTab || !domElements.favoritedTab) return;
    
    domElements.favoritedTab.classList.add('active');
    domElements.pinnedTab.classList.remove('active');
    domElements.favoritedSection.style.display = 'block';
    domElements.pinnedSection.style.display = 'none';
    
    loadFavoritedNotes();
    console.log('⭐ 切换到收藏 Tab');
}

// ============== 事件订阅 ==============
eventBus.on('file:favorited', () => {
    console.log('⭐ 刷新收藏列表');
    loadFavoritedNotes();
});

eventBus.on('file:unfavorited', () => {
    console.log('⭐ 刷新收藏列表');
    loadFavoritedNotes();
});

eventBus.on('file:deleted', () => {
    console.log('🔄 刷新历史、置顶和收藏列表');
    loadHistory();
    loadPinnedNotes();
    loadFavoritedNotes();
});

eventBus.on('file:pinned', () => {
    console.log('📌 刷新置顶列表');
    loadPinnedNotes();
});

eventBus.on('file:unpinned', () => {
    console.log('📌 刷新置顶列表');
    loadPinnedNotes();
});

console.log('✅ homepage 已订阅文件操作事件');

// ES Module 导出
export {
    initializeHomepage,
    loadPinnedNotes,
    loadFavoritedNotes,
    loadHistory,
    isFileExists,
    cleanupInvalidHistory
};

console.log('✅ homepage.js 加载完成');