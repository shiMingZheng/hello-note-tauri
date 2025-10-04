// src/js/homepage.js

'use strict';
console.log('📜 homepage.js 开始加载...');

let historyListElement;
let pinnedNotesGridElement; // [新增]


function initializeHomepage() {
    historyListElement = document.getElementById('history-list');
	pinnedNotesGridElement = document.getElementById('pinned-notes-grid'); // [新增]
    loadPinnedNotes(); // [新增]

    loadHistory();
}

async function loadHistory() {
    try {
        const history = await invoke('get_history', { limit: 50 });
        renderHistory(history);
    } catch (error) {
        console.error('加载历史记录失败:', error);
        historyListElement.innerHTML = '<p>加载历史记录失败</p>';
    }
}

function renderHistory(history) {
    if (!history || history.length === 0) {
        historyListElement.innerHTML = '<p>暂无笔记活动</p>';
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
            const fileName = entry.file_path.split(/[/\\]/).pop();
            const eventIcon = entry.event_type === 'created' ? '✨' : '📝';
            const eventText = entry.event_type === 'created' ? '新建' : '编辑';
            
            // [修改] 从 event_datetime 中提取时间
            const time = entry.event_datetime.split(' ')[1] || '';

            html += `
                <div class="history-item" data-path="${entry.file_path}">
                    <div class="history-item-content">
                        <span class="event-icon" title="${eventText}">${eventIcon}</span>
                        <span class="path" title="${entry.file_path}">${fileName}</span>
                        <span class="snippet">${entry.snippet || ''}</span>
                        <span class="time">${time}</span> 
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }
    historyListElement.innerHTML = html;

    historyListElement.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => {
            const path = item.dataset.path;
            if (path) {
                  // [修改] 使用新的 tabManager 来打开或切换到页签
                tabManager.openTab(path);
            }
        });
    });
}

// [新增] 加载并渲染置顶笔记的函数
async function loadPinnedNotes() {
    try {
        const pinnedNotes = await invoke('get_pinned_notes');
        renderPinnedNotes(pinnedNotes);
    } catch (error) {
        console.error('加载置顶笔记失败:', error);
        pinnedNotesGridElement.innerHTML = '<p class="empty-state">加载置顶笔记失败</p>';
    }
}

// [新增] 渲染置顶笔记卡片的函数
// [修改] 渲染置顶笔记卡片的函数
function renderPinnedNotes(notes) {
    if (!pinnedNotesGridElement) return;

    pinnedNotesGridElement.innerHTML = ''; // 清空

    if (!notes || notes.length === 0) {
        pinnedNotesGridElement.innerHTML = '<p class="empty-state">您还没有置顶任何笔记。在左侧文件上右键点击即可置顶。</p>';
        return;
    }

    notes.forEach(note => {
        const card = document.createElement('div');
        card.className = 'pinned-note-card';
        card.title = note.path;
        card.innerHTML = `<h4>${note.title}</h4>`;

        // 左键点击打开笔记
        card.addEventListener('click', () => {
            tabManager.openTab(note.path);
        });

        // [新增] 右键点击显示上下文菜单
        card.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            // 模拟一个文件对象，并传入特殊标记
            const file_obj = { 
                path: note.path, 
                is_dir: false, 
                name: note.title,
                from: 'pinned-section' // 特殊标记
            };
            showContextMenu(e, file_obj);
        });

        pinnedNotesGridElement.appendChild(card);
    });
}


// 将函数暴露到全局
window.initializeHomepage = initializeHomepage;
window.loadPinnedNotes = loadPinnedNotes; // [新增]