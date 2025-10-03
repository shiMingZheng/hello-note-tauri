// src/js/homepage.js

'use strict';
console.log('📜 homepage.js 开始加载...');

let historyListElement;

function initializeHomepage() {
    historyListElement = document.getElementById('history-list');
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
                    <div class="history-item-header">
                        <span class="event-icon" title="${eventText}">${eventIcon}</span>
                        <span class="path" title="${entry.file_path}">${fileName}</span>
                        <span class="time">${time}</span> 
                    </div>
                    <p class="snippet">${entry.snippet || '...'}</p>
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

// 将函数暴露到全局
window.initializeHomepage = initializeHomepage;