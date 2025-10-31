// src/js/main.js
'use strict';

console.log('🚀 CheetahNote 主入口开始加载...');
import { eventBus } from './core/EventBus.js';
import { fileChangeListener } from './file-change-listener.js';

// 核心模块
import { appState } from './core/AppState.js';
import { TauriAPI } from './core/TauriAPI.js';

// ⭐ 添加这一行：
import { domElements, initializeDOMElements } from './dom-init.js';

// 工具模块
import { showError, showSuccessMessage, showCustomConfirm } from './ui-utils.js';
import { themeManager } from './theme.js';
import { sidebarControl } from './sidebar-control.js';

// 功能模块
import { setupVirtualScroll, updateVirtualScrollData } from './virtual-scroll.js';
import { TabManager } from './tab_manager.js';
// 之后（修复）
import { initializeLinks } from './links.js';
import { tagModal } from './tag_modal.js';
import { sidebar } from './sidebar.js';
import { initializeHomepage, loadPinnedNotes, loadHistory } from './homepage.js';

import * as fileManager from './file-manager.js';
import { uiActions } from './ui_actions.js';
import { WorkspaceManager } from './workspace.js';

// ⭐ 新增：编辑器和插件系统
import { milkdownEditor } from './milkdown-editor.js';
import { dragDropManager } from './drag-drop.js';
import { pluginManager } from './plugin-manager.js';
import { pluginContext } from './plugin-context.js';

import { searchManager } from './search.js';  // ⭐ 新增
import { contextMenuManager } from './context-menu.js';  // ⭐ 新增
import { handleSaveFile,  loadFileToEditor } from './editor.js';  // ⭐ 保留编辑器相关
import { tabManager } from './tab_manager.js';
import { outlineManager } from './outline.js'; // <--- 导入大纲管理器
import { codemirrorEditor } from './codemirror-editor.js';



/**
 * 初始化 Milkdown 编辑器
 */
async function initializeMilkdownEditor() {
    console.log('🎨 [main.js] 开始初始化 Milkdown 编辑器...');
    console.log('🔍 [main.js] 检查 milkdownEditor 对象:', milkdownEditor);
    
    if (!milkdownEditor) {
        throw new Error('milkdownEditor 模块未加载');
    }
    
    try {
        console.log('📡 [main.js] 调用 milkdownEditor.init()...');
        
        await milkdownEditor.init('#milkdown-editor', (content) => {
            appState.hasUnsavedChanges = true;
        });
        
        console.log('✅ [main.js] Milkdown 编辑器初始化完成');
        console.log('🔍 [main.js] 编辑器实例:', milkdownEditor.editor);
        
        if (!milkdownEditor.editor) {
            throw new Error('编辑器实例创建失败 (editor 为 null)');
        }
        
    } catch (error) {
        console.error('❌ [main.js] Milkdown 编辑器初始化失败:', error);
        console.error('❌ [main.js] 错误堆栈:', error.stack);
        showError('编辑器初始化失败: ' + error.message);
        
        // ⭐ 关键: 重新抛出错误,让调用者知道失败了
        throw error;
    }
}

/**
 * 初始化 CodeMirror 编辑器
 */
async function initializeCodeMirrorEditor() {
    console.log('🎨 [main.js] 开始初始化 CodeMirror 编辑器...');
    
    if (!codemirrorEditor) {
        throw new Error('codemirrorEditor 模块未加载');
    }
    
    try {
        codemirrorEditor.init('#codemirror-editor');
        console.log('✅ [main.js] CodeMirror 编辑器初始化完成');
    } catch (error) {
        console.error('❌ [main.js] CodeMirror 编辑器初始化失败:', error);
        throw error;
    }
}

/**
 * 应用初始化
 */
// src/js/main.js


async function initApp() {
    console.log('🎯 初始化应用...');
    
    try {
        // ⭐ 1. 初始化 DOM 和无依赖的模块
        initializeDOMElements(); 
        window.eventBus = eventBus;
        console.log('✅ EventBus 已导出到全局');
        
        themeManager.init(); 

        // ⭐ 2. 初始化虚拟滚动系统 (startup 依赖它)
        setupVirtualScroll();

        // 3. 初始化其他“预加载”模块 (不依赖工作区数据)
        searchManager.init();
        contextMenuManager.init();
        sidebarControl.init();
        tagModal.init();
        uiActions.init();
        dragDropManager.init();
        initializeLinks();
        initializeHomepage(); // 初始化首页（欢迎页）
		outlineManager.init(); // <--- 初始化大纲管理器

        // ⭐ 4. 【关键修复】实例化并初始化 TabManager
        // 必须在 workspaceManager.startup() 之前完成
        // 因为 startup() 会调用 openLastFile() 来使用 tabManager
        
        tabManager.init();
       
        // ★★★ [优化] 步骤 5：调整初始化顺序 ★★★
        // 确保 sidebar.init() 在 workspaceManager.startup() 之前调用
        sidebar.init();

        //⭐ 5. 【关键修复】先显示编辑器容器,再初始化编辑器

        const editorWrapper = document.getElementById('editor-wrapper');
        const homepage = document.getElementById('homepage');

        // 临时显示编辑器容器(用于正确初始化 Milkdown)
        if (editorWrapper) {
            editorWrapper.style.display = 'flex';
        }

        await initializeMilkdownEditor();
        await initializeCodeMirrorEditor();

        // 初始化完成后,恢复默认状态:显示首页,隐藏编辑器
        if (editorWrapper) {
            editorWrapper.style.display = 'none';
        }
        if (homepage) {
            homepage.style.display = 'flex';
        }

        // ⭐ 5. 实例化并启动 WorkspaceManager
        // (这会加载数据, 并使用已就绪的 tabManager 切换视图)
        const workspaceManager = new WorkspaceManager();
		 // 订阅工作区相关事件 (移动到这里，确保实例存在)
        workspaceManager.subscribeToEvents(); // 添加这一行来设置订阅

        // 绑定“打开文件夹”按钮事件 (确保 domElements 已初始化)
        if (domElements.openFolderBtn) {
            domElements.openFolderBtn.addEventListener('click', () => {
                console.log('📂 "打开文件夹"按钮被点击'); // 添加日志
                eventBus.emit('workspace:select-new'); // 发布事件
            });
            console.log('✅ "打开文件夹"按钮事件已绑定');
        } else {
             console.warn('⚠️ 未找到 "打开文件夹" 按钮');
        }
		
		      // 绑定大纲按钮事件
         if (domElements.outlineBtn) { // <--- 使用 domElements (需要先添加)
            domElements.outlineBtn.addEventListener('click', () => {
				sidebar.hideTagsPopover(); //隐藏标签
                eventBus.emit('outline:toggle-visibility');
            });
            console.log('✅ 大纲按钮事件已绑定');
        } else {
             console.warn('⚠️ 未找到大纲按钮 (outlineBtn)');
        }
		
        await workspaceManager.startup();
        console.log('✅ 工作区加载完毕');
		
		

      
      
          
        
        // 8. 绑定剩余的事件
        bindRootActions();
        
		
		// [重构] 步骤 3: 封装原生 window 事件
		// 在 main.js 中统一监听, 然后发布到 eventBus
		window.addEventListener('resize', () => {
			// 直接发布原始事件
			// 我们让订阅者 (virtual-scroll.js) 自己决定如何进行防抖 (debounce)
			eventBus.emit('browser:resize');
		});
    console.log('✅ 已设置全局 resize 事件监听');
		
        
        console.log('✅ 应用初始化完成');
        
    } catch (error) {
        console.error('❌ 应用初始化失败:', error);
        showError('应用初始化失败: ' + error.message);
    }
}
// ⭐ 新增：绑定根目录操作按钮
function bindRootActions() {
    if (domElements.newNoteRootBtn) {
        domElements.newNoteRootBtn.addEventListener('click', () => {
			outlineManager.hide(); // <--- 添加这行
			sidebar.hideTagsPopover(); // <--- 添加这行，隐藏标签弹窗
            eventBus.emit('root-action:create-note');
        });
    }
    
    if (domElements.newFolderRootBtn) {
        domElements.newFolderRootBtn.addEventListener('click', () => {
			outlineManager.hide(); // <--- 添加这行
			sidebar.hideTagsPopover(); // <--- 添加这行，隐藏标签弹窗
            eventBus.emit('root-action:create-folder');
        });
    }
	
	// 修改为:
	const viewToggleBtn = document.getElementById('view-toggle-btn');
	if (viewToggleBtn) {
		viewToggleBtn.addEventListener('click', () => {
			// 循环切换: wysiwyg → source → preview → wysiwyg
			const modes = ['preview', 'wysiwyg', 'source'];
			const currentIndex = modes.indexOf(appState.editorMode);
			const nextMode = modes[(currentIndex + 1) % modes.length];
			eventBus.emit('editor:switch-mode', nextMode);
		});
	}
     // 绑定保存按钮
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            console.log('🖱️ [保存按钮] 被点击');
            eventBus.emit('editor:save');
        });
    }
    
    // 快捷键
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'n' && !e.shiftKey) {
            e.preventDefault();
            eventBus.emit('root-action:create-note');
        }
        
        if (e.ctrlKey && e.shiftKey && e.key === 'N') {
            e.preventDefault();
            eventBus.emit('root-action:create-folder');
        }
        
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            eventBus.emit('editor:save');
        }
    });
    
    console.log('✅ 根目录操作按钮已绑定');
}

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', initApp);





console.log('✅ 主入口模块加载完成');