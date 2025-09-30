/**
 * CheetahNote - Markdown 编辑器核心功能
 * 支持编辑/预览模式切换，文件保存
 */

console.log('📜 main.js 开始加载...');

// 全局变量
let invoke, open;
let openFolderBtn, fileListElement, welcomeScreen, contentDisplay, contextMenu;
let newNoteBtn, newFolderBtn, deleteFileBtn;

// 编辑器相关元素
let editorWrapper, markdownEditor, htmlPreview;
let editModeBtn, previewModeBtn;

const appState = {
    currentPath: null,
    rootPath: null,
    files: [],
    isLoading: false,
    activeFile: null,
    activeFilePath: null,  // 当前编辑文件的完整路径
    currentViewMode: 'edit',  // 'edit' 或 'preview'
    contextTarget: null,
    isSaving: false  // 防止重复保存
};

/**
 * 等待 Tauri API 加载完成
 */
async function waitForTauri() {
    console.log('⏳ 等待 Tauri API...');
    
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const maxAttempts = 50;
        
        const checkTauri = () => {
            attempts++;
            
            if (window.__TAURI__) {
                console.log('✅ Tauri API 已找到！');
                resolve();
            } else if (attempts >= maxAttempts) {
                reject(new Error('Tauri API 加载超时'));
            } else {
                setTimeout(checkTauri, 100);
            }
        };
        
        checkTauri();
    });
}

/**
 * 初始化应用
 */
async function initApp() {
    try {
        console.log('🚀 开始初始化 CheetahNote...');
        
        await waitForTauri();
        
        if (!window.__TAURI__.core || !window.__TAURI__.dialog) {
            throw new Error('Tauri API 结构不完整');
        }
        
        invoke = window.__TAURI__.core.invoke;
        open = window.__TAURI__.dialog.open;
        
        console.log('✅ Tauri API 已导入');
        
        // 获取 DOM 元素
        openFolderBtn = document.getElementById('open-folder-btn');
        fileListElement = document.getElementById('file-list');
        welcomeScreen = document.getElementById('welcome-screen');
        contentDisplay = document.getElementById('content-display');
        contextMenu = document.getElementById('context-menu');
        newNoteBtn = document.getElementById('new-note-btn');
        newFolderBtn = document.getElementById('new-folder-btn');
        deleteFileBtn = document.getElementById('delete-file-btn');
        
        // 编辑器相关元素
        editorWrapper = document.getElementById('editor-wrapper');
        markdownEditor = document.getElementById('markdown-editor');
        htmlPreview = document.getElementById('html-preview');
        editModeBtn = document.getElementById('edit-mode-btn');
        previewModeBtn = document.getElementById('preview-mode-btn');
        
        if (!openFolderBtn || !fileListElement || !welcomeScreen || !editorWrapper) {
            throw new Error('缺少必需的 DOM 元素');
        }
        
        console.log('✅ DOM 元素已找到');
        
        // 绑定事件监听器
        openFolderBtn.addEventListener('click', handleOpenFolder);
        editModeBtn.addEventListener('click', () => switchViewMode('edit'));
        previewModeBtn.addEventListener('click', () => switchViewMode('preview'));
        
        // 绑定键盘快捷键
        document.addEventListener('keydown', handleKeyboardShortcuts);
        
        // 初始化右键菜单
        initContextMenu();
        
        console.log('✅ 事件监听器已绑定');
        console.log('✅ CheetahNote 初始化完成！');
        
        fileListElement.innerHTML = '<li style="color: #6c757d; font-style: italic;">点击上方按钮选择文件夹</li>';
        
    } catch (error) {
        console.error('❌ 初始化失败:', error);
        alert('应用初始化失败: ' + error.message + '\n\n请刷新页面重试。');
    }
}

/**
 * 键盘快捷键处理
 */
function handleKeyboardShortcuts(e) {
    // Cmd/Ctrl + S 保存文件
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
    }
}

/**
 * 切换视图模式（编辑/预览）
 */
async function switchViewMode(mode) {
    if (appState.currentViewMode === mode || !appState.activeFilePath) {
        return;
    }
    
    console.log(`🔄 切换到 ${mode} 模式`);
    
    appState.currentViewMode = mode;
    
    if (mode === 'edit') {
        // 切换到编辑模式
        markdownEditor.style.display = 'block';
        htmlPreview.style.display = 'none';
        editModeBtn.classList.add('active');
        previewModeBtn.classList.remove('active');
        
        // 聚焦编辑器
        markdownEditor.focus();
        
    } else if (mode === 'preview') {
        // 切换到预览模式
        try {
            const markdownContent = markdownEditor.value;
            
            // 调用后端解析 Markdown
            const htmlContent = await invoke('parse_markdown', { 
                markdown: markdownContent 
            });
            
            // 渲染 HTML 到预览区
            htmlPreview.innerHTML = htmlContent;
            
            // 切换显示
            markdownEditor.style.display = 'none';
            htmlPreview.style.display = 'block';
            editModeBtn.classList.remove('active');
            previewModeBtn.classList.add('active');
            
            console.log('✅ Markdown 解析成功');
            
        } catch (error) {
            console.error('❌ Markdown 解析失败:', error);
            showError('预览失败: ' + error);
        }
    }
}

/**
 * 保存文件
 */
async function handleSaveFile() {
    if (!appState.activeFilePath || appState.isSaving) {
        return;
    }
    
    try {
        appState.isSaving = true;
        
        const content = markdownEditor.value;
        const filePath = appState.activeFilePath;
        
        console.log('💾 正在保存文件:', filePath);
        
        await invoke('save_file', { 
            path: filePath, 
            content: content 
        });
        
        console.log('✅ 文件保存成功');
        
        // 显示保存成功提示（可选）
        showSaveSuccess();
        
    } catch (error) {
        console.error('❌ 保存文件失败:', error);
        showError('保存失败: ' + error);
    } finally {
        appState.isSaving = false;
    }
}

/**
 * 显示保存成功提示
 */
function showSaveSuccess() {
    // 简单的临时提示
    const originalTitle = editModeBtn.textContent;
    editModeBtn.textContent = '✅ 已保存';
    
    setTimeout(() => {
        editModeBtn.textContent = originalTitle;
    }, 1500);
}

/**
 * 处理打开文件夹
 */
async function handleOpenFolder() {
    console.log('📂 handleOpenFolder 被调用');
    
    try {
        if (!open) {
            throw new Error('Tauri dialog API 未加载');
        }
        
        setButtonLoading(true);
        console.log('⏳ 正在打开文件夹选择对话框...');
        
        const selectedPath = await open({
            directory: true,
            multiple: false,
            title: '选择笔记文件夹'
        });
        
        console.log('📁 对话框返回结果:', selectedPath);
        
        if (!selectedPath) {
            console.log('ℹ️ 用户取消了选择');
            return;
        }
        
        console.log('✅ 选中的文件夹:', selectedPath);
        
        appState.rootPath = selectedPath;
        appState.currentPath = selectedPath;
        
        await loadFolderTree(selectedPath);
        
    } catch (error) {
        console.error('❌ 打开文件夹失败:', error);
        showError('打开文件夹失败: ' + error.message);
    } finally {
        setButtonLoading(false);
    }
}

/**
 * 加载文件夹树
 */
async function loadFolderTree(path) {
    try {
        console.log('📖 正在递归读取目录树:', path);
        
        if (!invoke) {
            throw new Error('Tauri invoke API 未加载');
        }
        
        fileListElement.innerHTML = '<li style="color: #0d6efd; font-style: italic;">⏳ 正在加载目录树...</li>';
        
        const files = await invoke('list_dir_tree', { path, maxDepth: 5 });
        
        console.log('✅ 目录树读取成功，总项目数:', files.length);
        
        appState.files = files;
        
        renderFileTree(files);
        
    } catch (error) {
        console.error('❌ 加载目录树失败:', error);
        fileListElement.innerHTML = `<li style="color: #dc3545;">❌ 加载失败: ${error}</li>`;
        showError('加载目录树失败: ' + error);
    }
}

/**
 * 渲染文件树（修复版：支持选中效果）
 */
function renderFileTree(files) {
    if (!files || files.length === 0) {
        fileListElement.innerHTML = '<li style="color: #6c757d;">📭 目录为空</li>';
        return;
    }
    
    fileListElement.innerHTML = '';
    
    files.forEach((file, index) => {
        const li = document.createElement('li');
        li.className = 'file-item';
        li.dataset.index = index;
        li.dataset.path = file.path;
        li.dataset.isDir = file.is_dir;
        
        const indent = file.level * 20;
        li.style.paddingLeft = `${indent + 10}px`;
        li.style.setProperty('--indent', `${indent + 10}px`);
        
        const icon = file.is_dir ? '📁' : '📄';
        li.textContent = `${icon} ${file.name}`;
        
        // 文件和文件夹都可以点击（文件打开编辑器，文件夹用于右键菜单）
        if (!file.is_dir) {
            li.addEventListener('click', () => handleFileClick(file, index));
        } else {
            li.addEventListener('click', () => handleFolderClick(file, index));
        }
        
        fileListElement.appendChild(li);
    });
    
    console.log('✅ 文件树渲染完成');
}

/**
 * 处理文件点击 - 打开编辑器
 */
async function handleFileClick(file, fileIndex) {
    if (file.is_dir) {
        return;
    }
    
    console.log('📄 点击文件:', file.name);
    
    // 重置视图模式为编辑模式
    appState.currentViewMode = 'edit';
    appState.activeFilePath = file.path;
    
    // 更新 UI 状态
    const allItems = fileListElement.querySelectorAll('.file-item');
    allItems.forEach(item => item.classList.remove('active'));
    
    const targetLi = fileListElement.children[fileIndex];
    if (targetLi) {
        targetLi.classList.add('active');
    }
    
    // 显示编辑器，隐藏欢迎屏幕
    welcomeScreen.style.display = 'none';
    editorWrapper.style.display = 'block';
    
    // 确保编辑模式显示
    markdownEditor.style.display = 'block';
    htmlPreview.style.display = 'none';
    editModeBtn.classList.add('active');
    previewModeBtn.classList.remove('active');
    
    // 加载文件内容到编辑器
    await loadFileToEditor(file.path);
}

/**
 * 处理文件夹点击 - 添加选中效果
 */
function handleFolderClick(folder, folderIndex) {
    console.log('📁 点击文件夹:', folder.name);
    
    // 更新选中状态
    const allItems = fileListElement.querySelectorAll('.file-item');
    allItems.forEach(item => item.classList.remove('active'));
    
    const targetLi = fileListElement.children[folderIndex];
    if (targetLi) {
        targetLi.classList.add('active');
    }
    
    // 更新上下文目标（用于右键菜单）
    appState.contextTarget = {
        path: folder.path,
        isDir: true,
        name: folder.name,
        element: targetLi
    };
}
/**
 * 加载文件内容到编辑器
 */
async function loadFileToEditor(filePath) {
    try {
        console.log('📖 正在读取文件:', filePath);
        
        // 显示加载状态
        markdownEditor.value = '⏳ 正在加载文件...';
        markdownEditor.disabled = true;
        
        // 读取文件内容
        const content = await invoke('read_file_content', { path: filePath });
        
        console.log('✅ 文件读取成功，内容长度:', content.length);
        
        // 填充到编辑器
        markdownEditor.value = content;
        markdownEditor.disabled = false;
        markdownEditor.focus();
        
        appState.activeFile = filePath;
        
    } catch (error) {
        console.error('❌ 读取文件失败:', error);
        markdownEditor.value = `❌ 读取文件失败: ${error}`;
        showError('读取文件失败: ' + error);
    }
}

/**
 * 设置按钮加载状态
 */
function setButtonLoading(loading) {
    if (!openFolderBtn) {
        console.warn('⚠️ openFolderBtn 未定义');
        return;
    }
    
    appState.isLoading = loading;
    
    if (loading) {
        openFolderBtn.disabled = true;
         openFolderBtn.textContent = '⏳ 加载中...';  // 修复：添加了闭合引号
		} else {
        openFolderBtn.disabled = false;
        openFolderBtn.textContent = '📂 打开文件夹';
    }
}

/**
 * 显示错误
 */
function showError(message) {
    console.error('💥 错误:', message);
    alert(message);
}

/**
 * 初始化右键菜单
 */
function initContextMenu() {
    const fileListContainer = document.querySelector('.file-list-container');
    
    // 监听右键点击
    fileListContainer.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        handleContextMenu(e);
    });
    
    // 点击其他地方隐藏菜单
    document.addEventListener('click', () => {
        hideContextMenu();
    });
    
    // 绑定菜单项点击事件
    newNoteBtn.addEventListener('click', handleCreateNote);
    newFolderBtn.addEventListener('click', handleCreateFolder);
    deleteFileBtn.addEventListener('click', handleDeleteFile);
}

/**
 * 处理右键菜单显示（修复版）
 */
function handleContextMenu(e) {
    const target = e.target.closest('.file-item');
    
    if (!target) {
        // 在空白处右键 - 在当前根目录创建
        const isFileList = e.target.closest('.file-list-container');
        if (isFileList && appState.rootPath) {
            showContextMenu(e.clientX, e.clientY, {
                path: appState.currentPath || appState.rootPath,
                isDir: true,
                name: '当前目录',
                element: null
            });
        }
        return;
    }
    
    const path = target.dataset.path;
    const isDir = target.dataset.isDir === 'true';
    const name = target.textContent.trim();
    
    appState.contextTarget = { path, isDir, name, element: target };
    
    showContextMenu(e.clientX, e.clientY, appState.contextTarget);
}

/**
 * 显示右键菜单
 */
function showContextMenu(x, y, target) {
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.add('visible');
    
    // 根据目标类型显示/隐藏菜单项
    const folderActions = contextMenu.querySelectorAll('.folder-action');
    const fileActions = contextMenu.querySelectorAll('.file-action');
    
    if (target.isDir) {
        folderActions.forEach(el => el.style.display = 'block');
        fileActions.forEach(el => el.style.display = 'none');
    } else {
        folderActions.forEach(el => el.style.display = 'none');
        fileActions.forEach(el => el.style.display = 'block');
    }
}

/**
 * 隐藏右键菜单
 */
function hideContextMenu() {
    contextMenu.classList.remove('visible');
}

/**
 * 处理创建笔记
 */
async function handleCreateNote() {
    hideContextMenu();
    
    const fileName = prompt('请输入笔记名称（无需添加 .md 扩展名）:');
    
    if (!fileName || fileName.trim() === '') {
        return;
    }
    
    const fullFileName = fileName.trim().endsWith('.md') 
        ? fileName.trim() 
        : fileName.trim() + '.md';
    
    try {
        const targetPath = appState.contextTarget.path;
        
        await invoke('create_new_file', { 
            dirPath: targetPath, 
            fileName: fullFileName 
        });
        
        console.log('✅ 笔记创建成功:', fullFileName);
        
        // 刷新列表
        await loadFolderTree(appState.rootPath);
        
    } catch (error) {
        console.error('❌ 创建笔记失败:', error);
        showError('创建笔记失败: ' + error);
    }
}

/**
 * 处理创建文件夹
 */
async function handleCreateFolder() {
    hideContextMenu();
    
    const folderName = prompt('请输入文件夹名称:');
    
    if (!folderName || folderName.trim() === '') {
        return;
    }
    
    try {
        const targetPath = appState.contextTarget.path;
        
        await invoke('create_new_folder', { 
            parentPath: targetPath, 
            folderName: folderName.trim() 
        });
        
        console.log('✅ 文件夹创建成功:', folderName);
        
        // 刷新列表
        await loadFolderTree(appState.rootPath);
        
    } catch (error) {
        console.error('❌ 创建文件夹失败:', error);
        showError('创建文件夹失败: ' + error);
    }
}

/**
 * 处理删除文件或文件夹（修复编码问题）
 */
async function handleDeleteFile() {
    hideContextMenu();
    
    const target = appState.contextTarget;
    
    if (!target) {
        showError('未选择要删除的项目');
        return;
    }
    
    // 确定删除的类型
    const itemType = target.isDir ? '文件夹' : '文件';
    const itemName = target.name.replace(/^[📁📄]\s*/, ''); // 移除图标
    
    const warningMsg = target.isDir 
        ? `确定要删除文件夹: ${itemName} 吗？\n\n⚠️ 警告：文件夹内的所有内容都将被删除！\n此操作无法撤销。`
        : `确定要删除文件: ${itemName} 吗？\n\n此操作无法撤销。`;
    
    // 使用 window.confirm 确保同步等待用户确认
    const userConfirmed = window.confirm(warningMsg);
    
    console.log('用户确认结果:', userConfirmed);
    
    // 如果用户点击取消，直接返回
    if (!userConfirmed) {
        console.log('ℹ️ 用户取消删除操作');
        return;
    }
    
    // 用户确认后才执行删除
    console.log(`✅ 用户已确认，开始删除${itemType}`);
    console.log('删除路径:', target.path);
    console.log('路径编码检查:', encodeURIComponent(target.path));
    
    try {
        console.log(`🗑️ 正在删除${itemType}:`, target.path);
        
        // 根据类型调用不同的删除方法
        if (target.isDir) {
            console.log('调用 delete_folder 命令');
            await invoke('delete_folder', { path: target.path });
        } else {
            console.log('调用 delete_item 命令');
            await invoke('delete_item', { path: target.path });
        }
        
        console.log(`✅ ${itemType}删除成功:`, itemName);
        
        // 显示删除成功提示
        showSuccessMessage(`${itemType}已删除: ${itemName}`);
        
        // 如果删除的是当前打开的文件，清空编辑器
        if (!target.isDir && appState.activeFilePath === target.path) {
            editorWrapper.style.display = 'none';
            welcomeScreen.style.display = 'block';
            appState.activeFilePath = null;
            appState.activeFile = null;
            markdownEditor.value = '';
        }
        
        // 刷新列表
        await loadFolderTree(appState.rootPath);
        
    } catch (error) {
        console.error(`❌ 删除${itemType}失败:`, error);
        console.error('错误详情:', JSON.stringify(error));
        console.error('错误类型:', typeof error);
        
        // 更友好的错误提示
        let errorMessage = error;
        if (typeof error === 'object' && error.message) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }
        
        showError(`删除${itemType}失败: ${errorMessage}`);
    }
}

/**
 * 显示成功消息
 */
function showSuccessMessage(message) {
    console.log('✅ 成功:', message);
    
    // 创建临时提示元素
    const toast = document.createElement('div');
    toast.className = 'success-toast';
    toast.textContent = '✅ ' + message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        font-size: 14px;
        font-weight: 500;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    // 3秒后移除
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// 启动应用
console.log('📌 注册初始化函数...');

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// 导出到全局（用于调试）
window.CheetahNote = {
    appState,
    handleOpenFolder,
    loadFolderTree,
    renderFileTree,
    loadFileToEditor,
    switchViewMode,
    handleSaveFile,
    handleCreateNote,
    handleCreateFolder,
    handleDeleteFile
};

console.log('✅ main.js 加载完成');