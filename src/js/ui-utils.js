// src/js/ui-utils.js
'use strict';

console.log('📜 ui-utils.js 开始加载...');

// ========================================
// Toast 通知系统
// ========================================

let toastContainer = null;

function createToastContainer() {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        document.body.appendChild(toastContainer);
    }
    return toastContainer;
}

function showToast(message, type = 'info', duration = 3000) {
    const container = createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        padding: 12px 20px;
        border-radius: 6px;
        color: white;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        animation: slideIn 0.3s ease-out;
        min-width: 200px;
        max-width: 400px;
    `;
    
    // 根据类型设置背景色
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    toast.style.backgroundColor = colors[type] || colors.info;
    
    container.appendChild(toast);
    
    // 自动移除
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, duration);
}

export function showSuccessMessage(message) {
    showToast(message, 'success');
    console.log('✅ ' + message);
}

export function showError(message) {
    showToast(message, 'error', 5000);
    console.error('❌ ' + message);
}

export function showWarning(message) {
    showToast(message, 'warning');
    console.warn('⚠️ ' + message);
}

export function showInfo(message) {
    showToast(message, 'info');
    console.log('ℹ️ ' + message);
}

// ========================================
// 自定义确认对话框
// ========================================

export function showCustomConfirm(title, message, confirmText = '确认', cancelText = '取消') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('custom-dialog-overlay');
        const dialogTitle = document.getElementById('dialog-title');
        const dialogMessage = document.getElementById('dialog-message');
        const confirmBtn = document.getElementById('dialog-confirm-btn');
        const cancelBtn = document.getElementById('dialog-cancel-btn');
        
        dialogTitle.textContent = title;
        dialogMessage.textContent = message;
        confirmBtn.textContent = confirmText;
        cancelBtn.textContent = cancelText;
        
        overlay.style.display = 'flex';
        
        const handleConfirm = () => {
            cleanup();
            resolve(true);
        };
        
        const handleCancel = () => {
            cleanup();
            resolve(false);
        };
        
        const cleanup = () => {
            overlay.style.display = 'none';
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };
        
        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
    });
}

// ========================================
// 索引状态提示 (已移除,保留接口以兼容)
// ========================================

export function showIndexingToast() {
    // 不再显示索引提示
    console.log('🔍 后台索引已启动');
}

export function hideIndexingToast() {
    // 不再显示索引提示
    console.log('✅ 后台索引已完成');
}

// ========================================
// 样式注入
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
`;
document.head.appendChild(style);

console.log('✅ ui-utils.js 加载完成');