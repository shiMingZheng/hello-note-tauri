// src/js/ui-utils.js
// CheetahNote - UI 辅助函数 (弹窗、消息提示、右键菜单等)

'use strict';
console.log('📜 ui-utils.js 开始加载...');

/**
 * 防抖函数
 */
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// ========================================
// 右键菜单和文件操作
// ========================================

function showContextMenu(event, file) {
    event.stopPropagation();
    
    appState.contextTarget = {
        path: file.path,
        isDir: file.is_dir,
        name: file.name
    };
    
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    contextMenu.classList.add('visible');
    
    if (file.is_dir) {
        newNoteBtn.style.display = 'block';
        newFolderBtn.style.display = 'block';
    } else {
        newNoteBtn.style.display = 'none';
        newFolderBtn.style.display = 'none';
    }
}

function hideContextMenu() {
    contextMenu.classList.remove('visible');
}

function showCustomConfirm(title, message, icon = '⚠️') {
    return new Promise((resolve) => {
        const dialog = customConfirmDialog;
        const titleEl = document.getElementById('dialog-title');
        const messageEl = document.getElementById('dialog-message');
        const iconEl = document.getElementById('dialog-icon');
        const confirmBtn = document.getElementById('dialog-confirm-btn');
        const cancelBtn = document.getElementById('dialog-cancel-btn');
        
        titleEl.textContent = title;
        messageEl.textContent = message;
        iconEl.textContent = icon;
        
        dialog.style.display = 'flex';
        
        const cleanup = () => {
            dialog.style.display = 'none';
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };
        
        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };
        
        const handleCancel = () => {
            cleanup();
            resolve(false);
        };
        
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
    });
}


// ========================================
// UI 提示函数
// ========================================

function showIndexingToast(message) {
    const existingToast = document.getElementById('indexing-toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.id = 'indexing-toast';
    toast.innerHTML = `
        <span class="spinner">⏳</span>
        <span>${message}</span>
    `;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #3498db;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 10px;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
}

function showSuccessMessage(message) {
    console.log('✅ ' + message);
    
    const indexingToast = document.getElementById('indexing-toast');
    if (indexingToast) {
        indexingToast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => indexingToast.remove(), 300);
    }
    
    const toast = document.createElement('div');
    toast.textContent = '✅ ' + message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #27ae60;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showError(message) {
    alert('❌ ' + message);
}

// ========================================
// 样式和动画
// ========================================

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }
    
    #indexing-toast .spinner {
        display: inline-block;
        animation: spin 1s linear infinite;
    }
    
    /* 虚拟滚动优化样式 */
    .file-list-container {
        position: relative;
        overflow-y: auto;
        overflow-x: hidden;
    }
    
    #file-list {
        list-style: none;
        margin: 0;
        padding: 0;
    }
    
    #file-list li {
        cursor: pointer;
        transition: background-color 0.15s ease;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    
    #file-list li:hover {
        background-color: rgba(255, 255, 255, 0.1);
    }
    
    #file-list li.active {
        background-color: rgba(74, 144, 226, 0.3);
    }
    
    #file-list li.folder {
        font-weight: 500;
    }
`;
document.head.appendChild(style);

console.log('✅ ui-utils.js 加载完成');