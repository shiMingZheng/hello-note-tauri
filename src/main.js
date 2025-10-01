// src/main.js
// CheetahNote - 前端主逻辑

// 严格模式
'use strict';

// ========================================
// 导入 Tauri API
// ========================================
const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;

// ========================================
// 全局状态管理
// ========================================
const appState = {
    rootPath: null,
    activeFilePath: null,
    dbInitialized: false,
    searchQuery: '',
    currentViewMode: 'edit', // 'edit' | 'preview'
    hasUnsavedChanges: false,
    isSearching: false,
    contextTarget: null,
    expandedFolders: new Set(), // 存储展开的文件夹路径
    indexInitialized: false // 索引是否已初始化
};

// ========================================
// DOM 元素引用
// ========================================
let openFolderBtn;
let searchBox;
let searchInput;
let clearSearchBtn;
let fileListElement;
let searchResultsList;
let welcomeScreen;
let editorWrapper;
let markdownEditor;
let htmlPreview;
let editModeBtn;
let previewModeBtn;
let saveBtn;
let contextMenu;
let newNoteBtn;
let newFolderBtn;
let deleteFileBtn;
let customConfirmDialog;

// ========================================
// 初始化应用
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 main.js 开始加载...');
    const startTime = performance.now();
    
    await initializeApp();
    
    const loadTime = performance.now() - startTime;
    console.log(`✅ 前端加载完成，耗时: ${loadTime.toFixed(2)}ms`);
});

/**
 * 初始化应用
 */
async function initializeApp() {
    try {
        console.log('⚙️ 注册初始化图标...');
        
        // 注册 API
        console.log('✅ Tauri API 已找到！');
        
        // 初始化 DOM 元素
        initDOMElements();
        
        console.log('✅ CheetahNote 初始化完成');
        
    } catch (error) {
        console.error('❌ 初始化失败:', error);
        alert('应用初始化失败: ' + error.message);
    }
}

/**
 * 初始化 DOM 元素引用
 */
function initDOMElements() {
    console.log('🔍 开始绑定事件...');
    
    openFolderBtn = document.getElementById('open-folder-btn');
    searchBox = document.getElementById('search-box');
    searchInput = document.getElementById('search-input');
    clearSearchBtn = document.getElementById('clear-search-btn');
    fileListElement = document.getElementById('file-list');
    searchResultsList = document.getElementById('search-results-list');
    welcomeScreen = document.getElementById('welcome-screen');
    editorWrapper = document.getElementById('editor-wrapper');
    markdownEditor = document.getElementById('markdown-editor');
    htmlPreview = document.getElementById('html-preview');
    editModeBtn = document.getElementById('edit-mode-btn');
    previewModeBtn = document.getElementById('preview-mode-btn');
    saveBtn = document.getElementById('save-btn');
    contextMenu = document.getElementById('context-menu');
    newNoteBtn = document.getElementById('new-note-btn');
    newFolderBtn = document.getElementById('new-folder-btn');
    deleteFileBtn = document.getElementById('delete-file-btn');
    customConfirmDialog = document.getElementById('custom-confirm-dialog');
    
    if (!openFolderBtn || !fileListElement) {
        throw new Error('必要的 DOM 元素未找到');
    }
    
    console.log('✅ DOM 元素已初始化');
    
    // 绑定事件
    bindEvents();
    
    console.log('✅ CheetahNote 初始化完成');
}

/**
 * 绑定事件处理器
 */
function bindEvents() {
    console.log('🔗 开始绑定事件...');
    
    // 打开文件夹按钮
    openFolderBtn.addEventListener('click', handleOpenFolder);
    
    // 搜索功能
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    clearSearchBtn.addEventListener('click', clearSearch);
    
    // 编辑器模式切换
    editModeBtn.addEventListener('click', () => switchViewMode('edit'));
    previewModeBtn.addEventListener('click', () => switchViewMode('preview'));
    
    // 保存按钮
    saveBtn.addEventListener('click', handleSaveFile);
    
    // 右键菜单
    newNoteBtn.addEventListener('click', handleCreateNote);
    newFolderBtn.addEventListener('click', handleCreateFolder);
    deleteFileBtn.addEventListener('click', handleDeleteFile);
    
    // 全局点击事件（隐藏右键菜单）
    document.addEventListener('click', () => hideContextMenu());
    
    // 监听编辑器内容变化
    markdownEditor.addEventListener('input', () => {
        appState.hasUnsavedChanges = true;
    });
    
    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            handleSaveFile();
        }
    });
    
    console.log('✅ 事件绑定完成');
}

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

/**
 * 处理打开文件夹
 */
async function handleOpenFolder() {
    console.log('📂 打开文件夹对话框...');
    
    try {
        const selected = await open({
            directory: true,
            multiple: false,
            title: '选择笔记文件夹'
        });
        
        if (selected && typeof selected === 'string') {
            console.log('✅ 已选择文件夹:', selected);
            appState.rootPath = selected;
            
            // 先初始化索引，再索引文件
            await initializeIndex(selected);
            
            // 加载文件树
            await loadFolderTree(selected);
            
            // 显示搜索框
            searchBox.classList.add('active');
        }
    } catch (error) {
        console.error('❌ 打开文件夹失败:', error);
        showError('打开文件夹失败: ' + error);
    }
}

/**
 * 初始化索引
 */
async function initializeIndex(basePath) {
    try {
        console.log('🔧 初始化索引...');
        await invoke('initialize_index_command', { basePath });
        appState.indexInitialized = true;
        appState.dbInitialized = true; // 兼容旧代码
        console.log('✅ 索引初始化成功');
        
        // 索引文件
        await indexFiles(basePath);
    } catch (error) {
        console.error('❌ 索引初始化失败:', error);
        showError('索引初始化失败: ' + error);
    }
}

/**
 * 索引文件
 */
async function indexFiles(basePath) {
    try {
        console.log('📝 开始索引文件...');
        await invoke('index_files', { basePath });
        console.log('✅ 文件索引完成');
    } catch (error) {
        console.error('❌ 文件索引失败:', error);
        showError('文件索引失败: ' + error);
    }
}

/**
 * 处理搜索
 */
async function handleSearch() {
    const query = searchInput.value.trim();
    
    if (!query) {
        clearSearch();
        return;
    }
    
    if (!appState.indexInitialized) {
        console.warn('索引未初始化');
        showError('请先打开文件夹');
        return;
    }
    
    appState.searchQuery = query;
    clearSearchBtn.style.display = 'block';
    
    try {
        console.log('🔍 搜索:', query);
        appState.isSearching = true;
        
        const results = await invoke('search_notes', { 
            query 
        });
        
        displaySearchResults(results);
        
    } catch (error) {
        console.error('❌ 搜索失败:', error);
        showError('搜索失败: ' + error);
    } finally {
        appState.isSearching = false;
    }
}

/**
 * 显示搜索结果
 */
function displaySearchResults(results) {
    // 隐藏文件列表，显示搜索结果
    fileListElement.style.display = 'none';
    searchResultsList.style.display = 'block';
    searchResultsList.innerHTML = '';
    
    if (results.length === 0) {
        searchResultsList.innerHTML = '<li style="text-align: center; color: rgba(255,255,255,0.5);">没有找到相关笔记</li>';
        return;
    }
    
    results.forEach(result => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="search-result-title">${result.title}</div>
            <div class="search-result-snippet">${result.snippet}</div>
        `;
        li.addEventListener('click', () => loadFileToEditor(result.path));
        searchResultsList.appendChild(li);
    });
}

/**
 * 清除搜索
 */
function clearSearch() {
    searchInput.value = '';
    appState.searchQuery = '';
    clearSearchBtn.style.display = 'none';
    
    // 显示文件列表，隐藏搜索结果
    fileListElement.style.display = 'block';
    searchResultsList.style.display = 'none';
    searchResultsList.innerHTML = '';
}

/**
 * 加载文件夹树
 */
async function loadFolderTree(path) {
    console.log('🌲 加载文件夹树:', path);
    
    try {
        const files = await invoke('list_dir_tree', { 
            path, 
            maxDepth: 5 
        });
        
        console.log(`✅ 加载了 ${files.length} 个项目`);
        renderFileTree(files);
        
    } catch (error) {
        console.error('❌ 加载文件夹失败:', error);
        showError('加载文件夹失败: ' + error);
    }
}

/**
 * 渲染文件树
 */
function renderFileTree(files) {
    fileListElement.innerHTML = '';
    
    if (!files || files.length === 0) {
        fileListElement.innerHTML = '<li style="text-align: center; color: rgba(255,255,255,0.5);">文件夹为空</li>';
        return;
    }
    
    files.forEach(file => {
        const li = document.createElement('li');
        const indent = '  '.repeat(file.level);
        
        // 根据文件夹是否展开显示不同图标
        let icon;
        if (file.is_dir) {
            icon = appState.expandedFolders.has(file.path) ? '📂' : '📁';
        } else {
            icon = '📄';
        }
        
        const name = file.name.replace(/\\/g, '/').split('/').pop();
        
        li.textContent = `${indent}${icon} ${name}`;
        li.className = file.is_dir ? 'folder' : 'file';
        li.style.paddingLeft = `${12 + file.level * 20}px`;
        
        li.dataset.path = file.path;
        li.dataset.isDir = file.is_dir;
        li.dataset.name = name;
        
        // 文件点击事件
        if (!file.is_dir) {
            li.addEventListener('click', () => loadFileToEditor(file.path));
        } else {
            // 文件夹点击事件 - 展开/收起
            li.addEventListener('click', () => toggleFolder(file.path));
        }
        
        // 右键菜单
        li.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, file);
        });
        
        fileListElement.appendChild(li);
    });
}

/**
 * 切换文件夹展开/收起状态
 */
function toggleFolder(folderPath) {
    if (appState.expandedFolders.has(folderPath)) {
        // 收起文件夹
        appState.expandedFolders.delete(folderPath);
        console.log('📁 收起文件夹:', folderPath);
    } else {
        // 展开文件夹
        appState.expandedFolders.add(folderPath);
        console.log('📂 展开文件夹:', folderPath);
    }
    
    // 重新加载文件树
    loadFolderTree(appState.rootPath);
}

/**
 * 加载文件到编辑器
 */
async function loadFileToEditor(path) {
    console.log('📄 加载文件:', path);
    
    try {
        const content = await invoke('read_file_content', { path });
        
        markdownEditor.value = content;
        appState.activeFilePath = path;
        appState.hasUnsavedChanges = false;
        
        // 更新文件标题
        const fileName = path.split(/[/\\]/).pop();
        document.getElementById('file-title').textContent = fileName;
        
        // 显示编辑器，隐藏欢迎屏幕
        welcomeScreen.style.display = 'none';
        editorWrapper.style.display = 'flex';
        
        // 如果在预览模式，更新预览
        if (appState.currentViewMode === 'preview') {
            updatePreview();
        }
        
        // 高亮活动文件
        document.querySelectorAll('.file-list li').forEach(li => {
            li.classList.remove('active');
            if (li.dataset.path === path) {
                li.classList.add('active');
            }
        });
        
        console.log('✅ 文件加载成功');
        
    } catch (error) {
        console.error('❌ 加载文件失败:', error);
        showError('加载文件失败: ' + error);
    }
}

/**
 * 清空编辑器
 */
function clearEditor() {
    markdownEditor.value = '';
    appState.activeFilePath = null;
    appState.hasUnsavedChanges = false;
    document.getElementById('file-title').textContent = '无标题';
    welcomeScreen.style.display = 'flex';
    editorWrapper.style.display = 'none';
}

/**
 * 切换视图模式
 */
function switchViewMode(mode) {
    appState.currentViewMode = mode;
    
    if (mode === 'edit') {
        markdownEditor.style.display = 'block';
        htmlPreview.style.display = 'none';
        editModeBtn.classList.add('active');
        previewModeBtn.classList.remove('active');
    } else {
        markdownEditor.style.display = 'none';
        htmlPreview.style.display = 'block';
        editModeBtn.classList.remove('active');
        previewModeBtn.classList.add('active');
        updatePreview();
    }
}

/**
 * 更新预览
 */
async function updatePreview() {
    const content = markdownEditor.value;
    
    try {
        const html = await invoke('parse_markdown', { content });
        htmlPreview.innerHTML = html;
    } catch (error) {
        console.error('❌ Markdown 解析失败:', error);
        htmlPreview.innerHTML = '<p style="color: red;">Markdown 解析失败</p>';
    }
}

/**
 * 处理保存文件
 */
async function handleSaveFile() {
    if (!appState.activeFilePath) {
        showError('没有打开的文件');
        return;
    }
    
    try {
        const content = markdownEditor.value;
        await invoke('save_file', { 
            path: appState.activeFilePath, 
            content 
        });
        
        appState.hasUnsavedChanges = false;
        showSuccessMessage('保存成功');
        
        // 重新索引该文件
        if (appState.indexInitialized) {
            await indexFiles(appState.rootPath);
        }
        
        console.log('✅ 文件保存成功');
    } catch (error) {
        console.error('❌ 保存文件失败:', error);
        showError('保存文件失败: ' + error);
    }
}

/**
 * 显示右键菜单
 */
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
    
    // 根据目标类型显示/隐藏菜单项
    if (file.is_dir) {
        newNoteBtn.style.display = 'block';
        newFolderBtn.style.display = 'block';
    } else {
        newNoteBtn.style.display = 'none';
        newFolderBtn.style.display = 'none';
    }
}

/**
 * 隐藏右键菜单
 */
function hideContextMenu() {
    contextMenu.classList.remove('visible');
}

/**
 * 显示自定义确认对话框
 */
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

/**
 * 处理创建笔记
 */
async function handleCreateNote() {
    hideContextMenu();
    
    const fileName = prompt('请输入笔记名称 (无需添加.md后缀):');
    
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
        
        // 确保父文件夹展开
        appState.expandedFolders.add(targetPath);
        
        await loadFolderTree(appState.rootPath);
        
        // 重新索引文件
        if (appState.indexInitialized) {
            await indexFiles(appState.rootPath);
        }
        
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
        
        // 确保父文件夹展开
        appState.expandedFolders.add(targetPath);
        
        await loadFolderTree(appState.rootPath);
        
    } catch (error) {
        console.error('❌ 创建文件夹失败:', error);
        showError('创建文件夹失败: ' + error);
    }
}

/**
 * 处理删除文件或文件夹
 */
async function handleDeleteFile() {
    hideContextMenu();
    
    const target = appState.contextTarget;
    
    if (!target) {
        showError('未选择要删除的项目');
        return;
    }
    
    const itemType = target.isDir ? '文件夹' : '文件';
    const itemName = target.name.replace(/^[📁📂📄]\s*/, '');
    
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
    
    const confirmed = await showCustomConfirm(title, message, icon);
    
    console.log('用户确认结果:', confirmed);
    
    if (!confirmed) {
        console.log('ℹ️ 用户取消了删除操作');
        return;
    }
    
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
        
        // 如果删除的是当前打开的文件，清空编辑器
        if (appState.activeFilePath === target.path) {
            clearEditor();
        }
        
        // 刷新文件树
        await loadFolderTree(appState.rootPath);
        
    } catch (error) {
        console.error(`❌ 删除${itemType}失败:`, error);
        showError(`删除${itemType}失败: ` + error);
    }
}

/**
 * 显示错误消息
 */
function showError(message) {
    // 简单的错误提示（可以后续优化为更美观的 Toast）
    alert('❌ ' + message);
}

/**
 * 显示成功消息
 */
function showSuccessMessage(message) {
    // 简单的成功提示（可以后续优化为更美观的 Toast）
    console.log('✅ ' + message);
    
    // 可以添加一个临时的提示元素
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
    }, 2000);
}

// 添加动画样式
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

console.log('✅ main.js 加载完成');