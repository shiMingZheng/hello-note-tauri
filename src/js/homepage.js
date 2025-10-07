// src/js/homepage.js

'use strict';
console.log('📜 homepage.js 开始加载...');

let historyListElement;
let pinnedNotesGridElement;

function initializeHomepage() {
    historyListElement = document.getElementById('history-list');
    pinnedNotesGridElement = document.getElementById('pinned-notes-grid');
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
            const eventIcon = entry.event_type === 'created' ? '✨' : '📝';
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
                    tabManager.openTab(path);
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

// 加载置顶笔记
async function loadPinnedNotes() {
    if (!pinnedNotesGridElement) return;

    const hasWorkspace = await isDatabaseInitialized();
    if (!hasWorkspace) {
        pinnedNotesGridElement.innerHTML = '<p class="empty-message">📂 请先打开一个笔记仓库</p>';
        return;
    }

    try {
        const pinnedNotes = await invoke('get_pinned_notes');
        renderPinnedNotes(pinnedNotes);
    } catch (error) {
        console.error('加载置顶笔记失败:', error);
        pinnedNotesGridElement.innerHTML = '<p class="empty-message">加载置顶笔记失败</p>';
    }
}

// 渲染置顶笔记
function renderPinnedNotes(notes) {
    if (!pinnedNotesGridElement) return;

    pinnedNotesGridElement.innerHTML = '';

    if (!notes || notes.length === 0) {
        pinnedNotesGridElement.innerHTML = '<p class="empty-message">您还没有置顶任何笔记。在左侧文件上右键点击即可置顶。</p>';
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
            // [修复] 验证文件是否存在
            if (await isFileExists(note.path)) {
                tabManager.openTab(note.path);
            } else {
                showError(`文件不存在: ${note.path}`);
                // 取消置顶并刷新
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

        pinnedNotesGridElement.appendChild(card);
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
        await invoke('cleanup_invalid_history', { 
            rootPath: appState.rootPath 
        });
        console.log('✅ 清理无效历史记录完成');
    } catch (error) {
        console.warn('清理历史记录失败:', error);
    }
}

// 导出到全局
window.initializeHomepage = initializeHomepage;
window.loadPinnedNotes = loadPinnedNotes;
window.loadHistory = loadHistory;

console.log('✅ homepage.js 加载完成');