/**
 * CheetahNote - 高性能 Markdown 笔记软件
 * 主前端脚本 - 自定义确认对话框版本
 */

console.log('📜 main.js 开始加载...');

let invoke, open;
let openFolderBtn, fileListElement, welcomeScreen, editorWrapper;
let markdownEditor, htmlPreview, editModeBtn, previewModeBtn;
let contextMenu, newNoteBtn, newFolderBtn, deleteFileBtn;
let customConfirmDialog, dialogTitle, dialogMessage, dialogCancelBtn, dialogConfirmBtn, dialogIcon;

const appState = {
    currentPath: null,
    rootPath: null,
    files: [],
    activeFilePath: null,
    activeFile: null,
    currentViewMode: 'edit',
    contextTarget: null,
    hasUnsavedChanges: false
};

/**
 * 自定义确认对话框 - 返回 Promise
 */
function showCustomConfirm(title, message, icon = '⚠️') {
    return new Promise((resolve) => {
        dialogTitle.textContent = title;
        dialogMessage.textContent = message;
        dialogIcon.textContent = icon;
        
        customConfirmDialog.classList.add('show');
        
        // 确定按钮
        const handleConfirm = () => {
            customConfirmDialog.classList.remove('show');
            dialogConfirmBtn.removeEventListener('click', handleConfirm);
            dialogCancelBtn.removeEventListener('click', handleCancel);
            resolve(true);
        };
        
        // 取消按钮
        const handleCancel = () => {
            customConfirmDialog.classList.remove('show');
            dialogConfirmBtn.removeEventListener('click', handleConfirm);
            dialogCancelBtn.removeEventListener('click', handleCancel);
            resolve(false);
        };
        
        dialogConfirmBtn.addEventListener('click', handleConfirm);
        dialogCancelBtn.addEventListener('click', handleCancel);
        
        // ESC 键取消
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                handleCancel();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    });
}

/**
 * 等待 Tauri API 加载
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
        editorWrapper = document.getElementById('editor-wrapper');
        markdownEditor = document.getElementById('markdown-editor');
        htmlPreview = document.getElementById('html-preview');
        editModeBtn = document.getElementById('edit-mode-btn');
        previewModeBtn = document.getElementById('preview-mode-btn');
        contextMenu = document.getElementById('context-menu');
        newNoteBtn = document.getElementById('new-note-btn');
        newFolderBtn = document.getElementById('new-folder-btn');
        deleteFileBtn = document.getElementById('delete-file-btn');
        
        // 自定义对话框元素
        customConfirmDialog = document.getElementById('custom-confirm-dialog');
        dialogTitle = document.getElementById('dialog-title');
        dialogMessage = document.getElementById('dialog-message');
        dialogCancelBtn = document.getElementById('dialog-cancel-btn');
        dialogConfirmBtn = document.getElementById('dialog-confirm-btn');
        dialogIcon = document.getElementById('dialog-icon');
        
        if (!openFolderBtn || !fileListElement || !welcomeScreen || !editorWrapper) {
            throw new Error('缺少必需的 DOM 元素');
        }
        
        console.log('✅ DOM 元素已找到');
        
        // 绑定事件
        openFolderBtn.addEventListener('click', handleOpenFolder);
        editModeBtn.addEventListener('click', () => switchViewMode('edit'));
        previewModeBtn.addEventListener('click', () => switchViewMode('preview'));
        
        document.addEventListener('keydown', handleKeyboardShortcuts);
        
        initContextMenu();
        
        // 点击对话框外部关闭
        customConfirmDialog.addEventListener('click', (e) => {
            if (e.target === customConfirmDialog) {
                customConfirmDialog.classList.remove('show');
            }
        });
        
        console.log('✅ 事件监听器已绑定');
        console.log('✅ CheetahNote 初始化完成！');
        
        fileListElement.innerHTML = '<li style="color: #6c757d; font-style: italic;">点击上方按钮选择文件夹</li>';
        
    } catch (error) {
        console.error('❌ 初始化失败:', error);
        alert('应用初始化失败: ' + error.message + '\n\n请刷新页面重试。');
    }
}

/**
 * 初始化右键菜单
 */
function initContextMenu() {
    fileListElement.addEventListener('contextmenu', handleContextMenu);
    
    document.addEventListener('click', (e) => {
        if (!contextMenu.contains(e.target)) {
            hideContextMenu();
        }
    });
    
    newNoteBtn.addEventListener('click', handleCreateNote);
    newFolderBtn.addEventListener('click', handleCreateFolder);
    deleteFileBtn.addEventListener('click', handleDeleteFile);
}

/**
 * 处理右键菜单显示
 */
function handleContextMenu(e) {
    e.preventDefault();
    
    const target = e.target.closest('.file-item');
    
    if (!target) {
        if (e.target.closest('.file-list-container') && appState.rootPath) {
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
    
    if (target.isDir) {
        newNoteBtn.style.display = 'block';
        newFolderBtn.style.display = 'block';
        deleteFileBtn.style.display = 'block';
        deleteFileBtn.textContent = '🗑️ 删除文件夹';
    } else {
        newNoteBtn.style.display = 'none';
        newFolderBtn.style.display = 'none';
        deleteFileBtn.style.display = 'block';
        deleteFileBtn.textContent = '🗑️ 删除文件';
    }
}

/**
 * 隐藏右键菜单
 */
function hideContextMenu() {
    contextMenu.classList.remove('visible');
}

/**
 * 打开文件夹
 */
async function handleOpenFolder() {
    try {
        console.log('📂 打开文件夹对话框...');
        
        const selectedPath = await open({
            directory: true,
            multiple: false,
            title: '选择笔记文件夹'
        });
        
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
    }
}

/**
 * 加载文件夹树
 */
async function loadFolderTree(path) {
    try {
        console.log('📖 正在加载目录树:', path);
        
        fileListElement.innerHTML = '<li style="color: #0d6efd;">⏳ 正在加载...</li>';
        
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
 * 渲染文件树
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
        
        const icon = file.is_dir ? '📁' : '📄';
        li.textContent = `${icon} ${file.name}`;
        
        if (file.path === appState.activeFilePath) {
            li.classList.add('active');
        }
        
        // 文件和文件夹都可以点击
        li.addEventListener('click', () => {
            if (file.is_dir) {
                handleFolderClick(file, index);
            } else {
                handleFileClick(file, index);
            }
        });
        
        fileListElement.appendChild(li);
    });
}

/**
 * 处理文件点击
 */
async function handleFileClick(file, index) {
    console.log('📄 点击文件:', file.name);
    
    // 检查未保存的更改
    if (appState.hasUnsavedChanges) {
        const confirmed = await showCustomConfirm(
            '未保存的更改',
            '当前文件有未保存的更改，是否继续切换？',
            '⚠️'
        );
        if (!confirmed) {
            return;
        }
    }
    
    // 更新选中状态
    const allItems = fileListElement.querySelectorAll('.file-item');
    allItems.forEach(item => item.classList.remove('active'));
    
    const targetItem = fileListElement.children[index];
    if (targetItem) {
        targetItem.classList.add('active');
    }
    
    await loadFileToEditor(file);
}

/**
 * 处理文件夹点击
 */
function handleFolderClick(folder, index) {
    console.log('📁 点击文件夹:', folder.name);
    
    // 更新选中状态
    const allItems = fileListElement.querySelectorAll('.file-item');
    allItems.forEach(item => item.classList.remove('active'));
    
    const targetItem = fileListElement.children[index];
    if (targetItem) {
        targetItem.classList.add('active');
    }
    
    // 关闭编辑器，显示欢迎屏幕
    clearEditor();
}

/**
 * 清空编辑器
 */
function clearEditor() {
    editorWrapper.style.display = 'none';
    welcomeScreen.style.display = 'block';
    
    appState.activeFilePath = null;
    appState.activeFile = null;
    appState.hasUnsavedChanges = false;
    markdownEditor.value = '';
    htmlPreview.innerHTML = '';
    
    console.log('✅ 编辑器已清空');
}

/**
 * 加载文件到编辑器
 */
async function loadFileToEditor(file) {
    try {
        console.log('📖 正在读取文件:', file.path);
        
        const content = await invoke('read_file_content', { path: file.path });
        
        console.log('✅ 文件内容读取成功，长度:', content.length);
        
        markdownEditor.value = content;
        appState.activeFilePath = file.path;
        appState.activeFile = file;
        appState.hasUnsavedChanges = false;
        
        welcomeScreen.style.display = 'none';
        editorWrapper.style.display = 'flex';
        
        // 确保显示编辑模式
        appState.currentViewMode = 'edit';
        markdownEditor.style.display = 'block';
        htmlPreview.style.display = 'none';
        editModeBtn.classList.add('active');
        previewModeBtn.classList.remove('active');
        
        markdownEditor.focus();
        
    } catch (error) {
        console.error('❌ 读取文件失败:', error);
        showError('读取文件失败: ' + error);
    }
}

/**
 * 键盘快捷键处理
 */
function handleKeyboardShortcuts(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
    }
}

/**
 * 切换视图模式
 */
async function switchViewMode(mode) {
    if (appState.currentViewMode === mode || !appState.activeFilePath) {
        return;
    }
    
    console.log(`🔄 切换到 ${mode} 模式`);
    
    appState.currentViewMode = mode;
    
    if (mode === 'edit') {
        markdownEditor.style.display = 'block';
        htmlPreview.style.display = 'none';
        editModeBtn.classList.add('active');
        previewModeBtn.classList.remove('active');
        markdownEditor.focus();
    } else {
        markdownEditor.style.display = 'none';
        htmlPreview.style.display = 'block';
        editModeBtn.classList.remove('active');
        previewModeBtn.classList.add('active');
        await updatePreview();
    }
}

/**
 * 更新预览
 */
async function updatePreview() {
    try {
        const markdown = markdownEditor.value;
        const html = await invoke('parse_markdown', { markdown });
        htmlPreview.innerHTML = html;
    } catch (error) {
        console.error('❌ 解析 Markdown 失败:', error);
        htmlPreview.innerHTML = '<p style="color: red;">解析失败: ' + error + '</p>';
    }
}

/**
 * 保存文件
 */
async function handleSaveFile() {
    if (!appState.activeFilePath) {
        showError('没有打开的文件');
        return;
    }
    
    try {
        console.log('💾 正在保存文件...');
        
        const content = markdownEditor.value;
        await invoke('save_file', { 
            path: appState.activeFilePath, 
            content 
        });
        
        appState.hasUnsavedChanges = false;
        console.log('✅ 文件保存成功');
        showSuccessMessage('文件已保存');
        
    } catch (error) {
        console.error('❌ 保存文件失败:', error);
        showError('保存文件失败: ' + error);
    }
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
        showSuccessMessage('笔记已创建: ' + fullFileName);
        
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
        showSuccessMessage('文件夹已创建: ' + folderName);
        
        await loadFolderTree(appState.rootPath);
        
    } catch (error) {
        console.error('❌ 创建文件夹失败:', error);
        showError('创建文件夹失败: ' + error);
    }
}

/**
 * 处理删除文件或文件夹 - 使用自定义确认对话框
 */
async function handleDeleteFile() {
    hideContextMenu();
    
    const target = appState.contextTarget;
    
    if (!target) {
        showError('未选择要删除的项目');
        return;
    }
    
    const itemType = target.isDir ? '文件夹' : '文件';
    const itemName = target.name.replace(/^[📁📄]\s*/, '');
    
    // 构建确认消息
    let title, message, icon;
    
    if (target.isDir) {
        title = '删除文件夹';
        message = `确定要删除文件夹 "${itemName}" 吗？\n\n⚠️ 警告：此操作将删除文件夹内的所有文件和子文件夹！\n\n此操作无法撤销。`;
        icon = '🗑️';
    } else {
        title = '删除文件';
        message = `确定要删除文件 "${itemName}" 吗？\n\n此操作无法撤销。`;
        icon = '🗑️';
    }
    
    console.log('🔔 显示自定义确认对话框');
    
    // 使用自定义确认对话框
    const confirmed = await showCustomConfirm(title, message, icon);
    
    console.log('用户确认结果:', confirmed);
    
    if (!confirmed) {
        console.log('ℹ️ 用户取消了删除操作');
        return;
    }
    
    // 用户确认后执行删除
    await performDelete(target, itemType, itemName);
}

/**
 * 执行删除操作
 */
async function performDelete(target, itemType, itemName) {
    console.log(`✅ 用户已确认，开始删除${itemType}: ${target.path}`);
    
    try {
        if (target.isDir) {
            console.log('调用 delete_folder 命令');
            await invoke('delete_folder', { path: target.path });
        } else {
            console.log('调用 delete_item 命令');
            await invoke('delete_item', { path: target.path });
        }
        
        console.log(`✅ ${itemType}删除成功:`, itemName);
        showSuccessMessage(`${itemType}已删除: ${itemName}`);
        
        // 如果删除的是当前打开的文件或其父文件夹，清空编辑器
        if (!target.isDir && appState.activeFilePath === target.path) {
            clearEditor();
        } else if (target.isDir && appState.activeFilePath && 
                   appState.activeFilePath.startsWith(target.path)) {
            clearEditor();
        }
        
        // 刷新文件树
        await loadFolderTree(appState.rootPath);
        
    } catch (error) {
        console.error(`❌ 删除${itemType}失败:`, error);
        
        let errorMessage = error;
        if (typeof error === 'object' && error.message) {
            errorMessage = error.message;
        }
        
        showError(`删除${itemType}失败: ${errorMessage}`);
    }
}

/**
 * 显示错误消息
 */
function showError(message) {
    console.error('❌ 错误:', message);
    showCustomConfirm('错误', message, '❌').then(() => {});
}

/**
 * 显示成功消息
 */
function showSuccessMessage(message) {
    console.log('✅ 成功:', message);
    
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
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (document.body.contains(toast)) {
                document.body.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// 监听编辑器内容变化
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (markdownEditor) {
            markdownEditor.addEventListener('input', () => {
                appState.hasUnsavedChanges = true;
            });
        }
    }, 200);
});

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
    clearEditor,
    switchViewMode,
    handleSaveFile,
    handleCreateNote,
    handleCreateFolder,
    handleDeleteFile,
    showCustomConfirm
};

console.log('✅ main.js 加载完成');