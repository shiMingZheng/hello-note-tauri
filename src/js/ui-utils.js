// src/js/ui-utils.js
'use strict';

console.log('📜 ui-utils.js 开始加载...');
import { domElements } from './dom-init.js';  // ⭐ 新增


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
    
    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };
    toast.style.backgroundColor = colors[type] || colors.info;
    
    container.appendChild(toast);
    
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
// 自定义确认对话框 (懒加载模式)
// ========================================

// ⭐ 缓存对话框元素引用
let dialogElements = null;

/**
 * 懒加载获取对话框元素
 * @returns {Object|null} 对话框元素对象
 */
function getDialogElements() {
    // 如果已经缓存,直接返回
    if (dialogElements) {
        return dialogElements;
    }
    
    // 第一次调用时获取元素
        const overlay = domElements.customConfirmDialog;
        const dialogTitle = domElements.dialogTitle;
        const dialogMessage = domElements.dialogMessage;
        const confirmBtn = domElements.dialogConfirmBtn;
        const cancelBtn = domElements.dialogCancelBtn;
    
    // 检查所有元素是否存在
    if (!overlay || !dialogTitle || !dialogMessage || !confirmBtn || !cancelBtn) {
        console.error('❌ 对话框元素未找到:', {
            overlay: !!overlay,
            dialogTitle: !!dialogTitle,
            dialogMessage: !!dialogMessage,
            confirmBtn: !!confirmBtn,
            cancelBtn: !!cancelBtn
        });
        return null;
    }
    
    // 缓存元素引用
    dialogElements = {
        overlay,
        dialogTitle,
        dialogMessage,
        confirmBtn,
        cancelBtn
    };
    
    console.log('✅ 对话框元素已加载并缓存');
    return dialogElements;
}

export function showCustomConfirm(title, message, confirmText = '确认', cancelText = '取消') {
    return new Promise((resolve) => {
        // ⭐ 懒加载获取元素
        const elements = getDialogElements();
        
        // 如果获取失败,等待 DOM 加载后重试
        if (!elements) {
            console.warn('⚠️ 对话框元素未就绪,等待 100ms 后重试...');
            
            setTimeout(() => {
                const retryElements = getDialogElements();
                
                if (!retryElements) {
                    console.error('❌ 对话框元素仍未找到,请检查 HTML');
                    showError('对话框初始化失败');
                    resolve(false);
                    return;
                }
                
                // 重试成功,继续执行
                showDialogWithElements(retryElements, title, message, confirmText, cancelText, resolve);
            }, 100);
            
            return;
        }
        
        // 正常流程
        showDialogWithElements(elements, title, message, confirmText, cancelText, resolve);
    });
}

/**
 * 显示对话框的核心逻辑
 */
function showDialogWithElements(elements, title, message, confirmText, cancelText, resolve) {
    const { overlay, dialogTitle, dialogMessage, confirmBtn, cancelBtn } = elements;
    
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
}

// ========================================
// 索引状态提示 (已移除,保留接口以兼容)
// ========================================

export function showIndexingToast() {
    console.log('🔍 后台索引已启动');
}

export function hideIndexingToast() {
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
