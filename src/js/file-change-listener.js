// src/js/file-change-listener.js
'use strict';

import { eventBus } from './core/EventBus.js';
import { showSuccessMessage } from './ui-utils.js';
import { refreshFileTree } from './file-manager.js';

console.log('📜 file-change-listener.js 开始加载...');

class FileChangeListener {
    constructor() {
        if (FileChangeListener.instance) {
            return FileChangeListener.instance;
        }
        
        this.unlistenFn = null;
        FileChangeListener.instance = this;
    }
    
    /**
     * 启动监听
     */
    async start() {
        if (this.unlistenFn) {
            console.warn('⚠️ 文件变化监听已启动');
            return;
        }
        
        console.log('👁️ 启动前端文件变化监听...');
        
        // 监听来自 Rust 的文件变化事件
        const { listen } = window.__TAURI__.event;
        
		this.unlistenFn = await listen('file-changed', (event) => {
			const { type, path, oldPath, newPath } = event.payload;  // ✅ 解构 oldPath 和 newPath
			console.log(`📢 收到文件变化事件: ${type} - ${path || newPath}`);
			
			// ✅ 处理重命名事件的特殊逻辑
			if (type === 'renamed') {
				this.handleFileChange(type, newPath, oldPath);
			} else {
				this.handleFileChange(type, path);
			}
		});
        
        console.log('✅ 文件变化监听已启动');
    }
    
    /**
     * 停止监听
     */
    stop() {
        if (this.unlistenFn) {
            this.unlistenFn();
            this.unlistenFn = null;
            console.log('🛑 文件变化监听已停止');
        }
    }
    
    /**
     * 处理文件变化
     */

	async handleFileChange(type, path, oldPath = null) {  // ✅ 添加 oldPath 参数
		// 防抖:避免短时间内多次刷新
		if (this.refreshTimeout) {
			clearTimeout(this.refreshTimeout);
		}
		
		this.refreshTimeout = setTimeout(async () => {
			try {
				let message;
				
				// ✅ 处理不同类型的事件
				if (type === 'renamed' && oldPath) {
					message = `📁 文件已重命名: ${oldPath} → ${path}`;
					
					// 发布内部重命名事件
					eventBus.emit('file:renamed', {
						oldPath: oldPath,
						newPath: path,
						isDir: false  // 外部重命名只能是单个文件
					});
					
				} else if (type === 'deleted') {
					message = `📁 文件已删除: ${path}`;
					
					// 发布内部删除事件
					eventBus.emit('file:deleted', {
						path: path,
						isDir: false
					});
					
				} else {
					// created 或 modified
					message = `📁 文件已${type === 'modified' ? '修改' : '创建'}: ${path}`;
				}
				
				showSuccessMessage(message);
				
				// 刷新文件树
				await refreshFileTree();
				
				// 发布通用外部修改事件
				eventBus.emit('external-file-change', { type, path, oldPath });
				
			} catch (error) {
				console.error('处理文件变化失败:', error);
			}
		}, 500); // 500ms 防抖
	}
}

// 创建单例
const fileChangeListener = new FileChangeListener();

// 监听工作区打开,自动启动监听
eventBus.on('workspace:opened', () => {
    fileChangeListener.start();
});

// 监听工作区关闭,自动停止监听
eventBus.on('workspace:closed', () => {
    fileChangeListener.stop();
});

export { fileChangeListener };

console.log('✅ file-change-listener.js 加载完成');