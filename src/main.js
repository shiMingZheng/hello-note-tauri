// src/main.js
// CheetahNote - 前端主逻辑（异步索引优化版）

'use strict';

console.log('📜 main.js 开始加载...');

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
    currentViewMode: 'edit',
    hasUnsavedChanges: false,
    isSearching: false,
    contextTarget: null,
    expandedFolders: new Set(),
    indexInitialized: false
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
    console.log('🚀 main.js DOMContentLoaded');
    const startTime = performance.now();
    
    try {
        await initializeApp();
        const loadTime = performance.now() - startTime;
        console.log(`✅ 前端加载完成，耗时: ${loadTime.toFixed(2)}ms`);
    } catch (error) {
        console.error('❌ 初始化失败:', error);
        alert('应用初始化失败: ' + error.message);
    }
});

/**
 * 初始化应用
 */
async function initializeApp() {
    console.log('⚙️ 开始初始化...');
    
    initDOMElements();
    bindEvents();
    
    console.log('✅ CheetahNote 初始化完成');
}

/**
 * 初始化 DOM 元素引用
 */
function initDOMElements() {
    console.log('🔍 初始化 DOM 元素...');
    
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
}

/**
 * 绑定事件处理器
 */
function bindEvents() {
    console.log('🔗 开始绑定事件...');
    
    openFolderBtn.addEventListener('click', handleOpenFolder);
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    clearSearchBtn.addEventListener('click', clearSearch);
    editModeBtn.addEventListener('click', () => switchViewMode('edit'));
    previewModeBtn.addEventListener('click', () => switchViewMode('preview'));
    saveBtn.addEventListener('click', handleSaveFile);
    newNoteBtn.addEventListener('click', handleCreateNote);
    newFolderBtn.addEventListener('click', handleCreateFolder);
    deleteFileBtn.addEventListener('click', handleDeleteFile);
    document.addEventListener('click', () => hideContextMenu());
    
    markdownEditor.addEventListener('input', () => {
        appState.hasUnsavedChanges = true;
    });
    
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

// ========================================
// 文件夹操作 - 异步索引优化
// ========================================

/**
 * 处理打开文件夹 - 优化版（先渲染再索引）
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
            
            // 🚀 步骤1: 立即加载并渲染文件树（用户可以马上看到文件）
            await loadFolderTree(selected);
            
            // 显示搜索框
            searchBox.classList.add('active');
            
            // 显示索引提示
            showIndexingToast('正在后台建立索引，请稍候...');
            
            // 🔧 步骤2: 在后台异步初始化索引（不阻塞UI）
            initializeIndexInBackground(selected);
        }
    } catch (error) {
        console.error('❌ 打开文件夹失败:', error);
        showError('打开文件夹失败: ' + error);
    }
}

/**
 * 在后台异步初始化索引
 */
async function initializeIndexInBackground(basePath) {
    try {
        console.log('🔧 后台：开始初始化索引...');
        
        // 初始化索引
        await invoke('initialize_index_command', { basePath });
        appState.indexInitialized = true;
        appState.dbInitialized = true;
        console.log('✅ 后台：索引初始化完成');
        
        // 开始索引文件
        console.log('📝 后台：开始索引文件...');
        await invoke('index_files', { basePath });
        console.log('✅ 后台：文件索引完成');
        
        // 索引完成，显示成功提示
        showSuccessMessage('索引建立完成，搜索功能已就绪');
        
    } catch (error) {
        console.error('❌ 后台索引失败:', error);
        showError('索引建立失败: ' + error + '\n搜索功能暂不可用');
        appState.indexInitialized = false;
        appState.dbInitialized = false;
    }
}

// ========================================
// 文件树操作
// ========================================

/**
 * 将嵌套的树形结构扁平化为带 level 的数组
 */
function flattenFileTree(nodes, level = 0) {
    const result = [];
    
    for (const node of nodes) {
        result.push({
            name: node.name,
            path: node.path,
            is_dir: node.is_dir,
            level: level
        });
        
        if (node.children && node.children.length > 0) {
            const childrenFlattened = flattenFileTree(node.children, level + 1);
            result.push(...childrenFlattened);
        }
    }
    
    return result;
}

/**
 * 加载文件夹树
 */
async function loadFolderTree(path) {
    console.log('🌲 加载文件夹树:', path);
    
    try {
        const filesNested = await invoke('list_dir_tree', { path });
        const files = flattenFileTree(filesNested);
        
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
        
        if (file.is_dir) {
            li.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('🖱️ 点击文件夹:', file.path);
                toggleFolder(file.path);
            });
        } else {
            li.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('🖱️ 点击文件:', file.path);
                loadFileToEditor(file.path);
            });
        }
        
        li.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(e, file);
        });
        
        fileListElement.appendChild(li);
    });
}

/**
 * 切换文件夹展开/收起状态
 */
function toggleFolder(folderPath) {
    console.log('🔄 切换文件夹状态:', folderPath);
    
    if (appState.expandedFolders.has(folderPath)) {
        appState.expandedFolders.delete(folderPath);
        console.log('📁 收起文件夹');
    } else {
        appState.expandedFolders.add(folderPath);
        console.log('📂 展开文件夹');
    }
    
    loadFolderTree(appState.rootPath);
}

// ========================================
// 文件编辑操作
// ========================================

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
        
        const fileName = path.split(/[/\\]/).pop();
        document.getElementById('file-title').textContent = fileName;
        
        welcomeScreen.style.display = 'none';
        editorWrapper.style.display = 'flex';
        
        if (appState.currentViewMode === 'preview') {
            updatePreview();
        }
        
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
        
        // 后台重新索引（如果索引已初始化）
        if (appState.indexInitialized) {
            console.log('🔄 后台：重新索引文件...');
            invoke('index_files', { basePath: appState.rootPath }).catch(err => {
                console.warn('后台索引失败:', err);
            });
        }
        
        console.log('✅ 文件保存成功');
    } catch (error) {
        console.error('❌ 保存文件失败:', error);
        showError('保存文件失败: ' + error);
    }
}

// ========================================
// 搜索功能
// ========================================

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
        console.warn('索引未就绪');
        showError('索引尚未建立完成，请稍候再试');
        return;
    }
    
    appState.searchQuery = query;
    clearSearchBtn.style.display = 'block';
    
    try {
        console.log('🔍 搜索:', query);
        appState.isSearching = true;
        
        const results = await invoke('search_notes', { query });
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
        li.addEventListener('click', () => {
            loadFileToEditor(result.path);
            clearSearch();
        });
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
    
    fileListElement.style.display = 'block';
    searchResultsList.style.display = 'none';
    searchResultsList.innerHTML = '';
}

// ========================================
// 右键菜单
// ========================================

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
        
        appState.expandedFolders.add(targetPath);
        
        await loadFolderTree(appState.rootPath);
        
        // 后台重新索引
        if (appState.indexInitialized) {
            invoke('index_files', { basePath: appState.rootPath }).catch(err => {
                console.warn('后台索引失败:', err);
            });
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
    
    const confirmed = await showCustomConfirm(title, message, icon);
    
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
            await invoke('delete_folder', { path: target.path });
        } else {
            await invoke('delete_item', { path: target.path });
        }
        
        console.log(`✅ ${itemType}删除成功:`, itemName);
        showSuccessMessage(`${itemType}已删除: ${itemName}`);
        
        if (appState.activeFilePath === target.path) {
            markdownEditor.value = '';
            appState.activeFilePath = null;
            welcomeScreen.style.display = 'flex';
            editorWrapper.style.display = 'none';
        }
        
        await loadFolderTree(appState.rootPath);
        
        // 后台重新索引
        if (appState.indexInitialized) {
            invoke('index_files', { basePath: appState.rootPath }).catch(err => {
                console.warn('后台索引失败:', err);
            });
        }
        
    } catch (error) {
        console.error(`❌ 删除${itemType}失败:`, error);
        showError(`删除${itemType}失败: ` + error);
    }
}

// ========================================
// UI 提示函数
// ========================================

/**
 * 显示索引中提示（不自动消失）
 */
function showIndexingToast(message) {
    console.log('ℹ️ ' + message);
    
    // 移除之前的索引提示
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

/**
 * 显示成功消息
 */
function showSuccessMessage(message) {
    console.log('✅ ' + message);
    
    // 移除索引提示
    const indexingToast = document.getElementById('indexing-toast');
    if (indexingToast) {
        indexingToast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => indexingToast.remove(), 300);
    }
    
    // 显示成功提示
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

/**
 * 显示错误消息
 */
function showError(message) {
    alert('❌ ' + message);
}

// ========================================
// 样式和动画
// ========================================

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
`;
document.head.appendChild(style);

console.log('✅ main.js 加载完成');