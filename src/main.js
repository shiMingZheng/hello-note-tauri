// src/main.js
// CheetahNote - 前端主逻辑（虚拟滚动优化版）

'use strict';

console.log('📜 main.js 开始加载...');

// ========================================
// 导入 Tauri API
// ========================================
const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;

// ========================================
// 虚拟滚动配置
// ========================================
const VIRTUAL_SCROLL_CONFIG = {
    ITEM_HEIGHT: 28,           // 每个列表项的固定高度（像素）
    BUFFER_SIZE: 5,            // 上下缓冲区的额外渲染项数
    THROTTLE_DELAY: 16         // 滚动事件节流延迟（约60fps）
};

// ========================================
// 本地存储键名
// ========================================
const STORAGE_KEYS = {
    LAST_FOLDER: 'cheetah_last_folder',
    LAST_FILE: 'cheetah_last_file',
    EXPANDED_FOLDERS: 'cheetah_expanded_folders'
};

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
    indexInitialized: false,
    fullFileTree: [],          // 完整文件树缓存
    isLoading: false,
    // 虚拟滚动状态
    virtualScroll: {
        visibleItems: [],      // 当前应该可见的所有项（扁平化）
        renderedRange: { start: 0, end: 0 },  // 当前渲染的范围
        scrollTop: 0,          // 当前滚动位置
        containerHeight: 0     // 容器可视高度
    }
};

// ========================================
// DOM 元素引用
// ========================================
let openFolderBtn;
let searchBox;
let searchInput;
let clearSearchBtn;
let fileListContainer;         // 滚动容器
let fileListElement;           // 实际的 ul 列表
let fileListSpacer;            // 撑开滚动条的哨兵元素
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
    setupVirtualScroll();
    bindEvents();
    
    await restoreLastSession();
    
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
    fileListContainer = document.querySelector('.file-list-container');
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
    
    if (!openFolderBtn || !fileListElement || !fileListContainer) {
        throw new Error('必要的 DOM 元素未找到');
    }
    
    console.log('✅ DOM 元素已初始化');
}

/**
 * 设置虚拟滚动
 */
function setupVirtualScroll() {
    console.log('🎯 设置虚拟滚动...');
    
    // 创建哨兵元素（撑开滚动条）
    fileListSpacer = document.createElement('div');
    fileListSpacer.id = 'file-list-spacer';
    fileListSpacer.style.cssText = 'height: 0; width: 1px;';
    fileListContainer.insertBefore(fileListSpacer, fileListElement);
    
    // 设置列表为绝对定位
    fileListElement.style.position = 'absolute';
    fileListElement.style.top = '0';
    fileListElement.style.left = '0';
    fileListElement.style.right = '0';
    fileListElement.style.willChange = 'transform';
    
    // 监听滚动事件（节流处理）
    let scrollTimeout = null;
    fileListContainer.addEventListener('scroll', () => {
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
        
        scrollTimeout = setTimeout(() => {
            handleVirtualScroll();
        }, VIRTUAL_SCROLL_CONFIG.THROTTLE_DELAY);
    }, { passive: true });
    
    // 监听窗口大小变化
    let resizeTimeout = null;
    window.addEventListener('resize', () => {
        if (resizeTimeout) {
            clearTimeout(resizeTimeout);
        }
        
        resizeTimeout = setTimeout(() => {
            appState.virtualScroll.containerHeight = fileListContainer.clientHeight;
            handleVirtualScroll();
        }, 100);
    });
    
    // 初始化容器高度
    appState.virtualScroll.containerHeight = fileListContainer.clientHeight;
    
    console.log('✅ 虚拟滚动已设置');
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
    
    // 使用事件委托处理文件列表点击
    fileListElement.addEventListener('click', handleFileListClick);
    fileListElement.addEventListener('contextmenu', handleFileListContextMenu);
    
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
// 虚拟滚动核心逻辑
// ========================================

/**
 * 处理虚拟滚动
 * 这是虚拟滚动的核心函数，根据滚动位置计算并渲染可见项
 */
function handleVirtualScroll() {
    const { visibleItems } = appState.virtualScroll;
    
    if (!visibleItems || visibleItems.length === 0) {
        return;
    }
    
    const scrollTop = fileListContainer.scrollTop;
    const containerHeight = appState.virtualScroll.containerHeight;
    const itemHeight = VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT;
    const bufferSize = VIRTUAL_SCROLL_CONFIG.BUFFER_SIZE;
    
    // 计算可视范围的起始和结束索引
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
    const endIndex = Math.min(
        visibleItems.length,
        Math.ceil((scrollTop + containerHeight) / itemHeight) + bufferSize
    );
    
    // 更新状态
    appState.virtualScroll.scrollTop = scrollTop;
    appState.virtualScroll.renderedRange = { start: startIndex, end: endIndex };
    
    // 渲染可见项
    renderVisibleItems(startIndex, endIndex);
    
    // 调整列表位置
    const offsetY = startIndex * itemHeight;
    fileListElement.style.transform = `translateY(${offsetY}px)`;
}

/**
 * 渲染可见项
 * @param {number} startIndex - 起始索引
 * @param {number} endIndex - 结束索引
 */
function renderVisibleItems(startIndex, endIndex) {
    const { visibleItems } = appState.virtualScroll;
    const fragment = document.createDocumentFragment();
    
    // 只渲染当前视口内的项
    for (let i = startIndex; i < endIndex; i++) {
        const item = visibleItems[i];
        if (!item) continue;
        
        const li = createFileTreeItem(item);
        fragment.appendChild(li);
    }
    
    // 一次性更新 DOM（性能优化）
    fileListElement.innerHTML = '';
    fileListElement.appendChild(fragment);
}

/**
 * 更新虚拟滚动数据源
 * 当文件树数据变化时调用此函数
 */
function updateVirtualScrollData() {
    const visibleItems = getVisibleItems(appState.fullFileTree, '', 0);
    appState.virtualScroll.visibleItems = visibleItems;
    
    // 更新哨兵元素高度（撑开滚动条）
    const totalHeight = visibleItems.length * VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT;
    fileListSpacer.style.height = `${totalHeight}px`;
    
    // 重置滚动位置（可选）
    // fileListContainer.scrollTop = 0;
    
    // 立即渲染
    handleVirtualScroll();
    
    console.log(`📊 虚拟滚动数据已更新: ${visibleItems.length} 项`);
}

// ========================================
// 本地存储管理
// ========================================

function saveLastFolder(folderPath) {
    try {
        localStorage.setItem(STORAGE_KEYS.LAST_FOLDER, folderPath);
    } catch (error) {
        console.warn('保存文件夹路径失败:', error);
    }
}

function saveLastFile(filePath) {
    try {
        localStorage.setItem(STORAGE_KEYS.LAST_FILE, filePath);
    } catch (error) {
        console.warn('保存文件路径失败:', error);
    }
}

function saveExpandedFolders() {
    try {
        const expanded = Array.from(appState.expandedFolders);
        localStorage.setItem(STORAGE_KEYS.EXPANDED_FOLDERS, JSON.stringify(expanded));
    } catch (error) {
        console.warn('保存展开状态失败:', error);
    }
}

async function restoreLastSession() {
    try {
        const lastFolder = localStorage.getItem(STORAGE_KEYS.LAST_FOLDER);
        const lastFile = localStorage.getItem(STORAGE_KEYS.LAST_FILE);
        const expandedStr = localStorage.getItem(STORAGE_KEYS.EXPANDED_FOLDERS);
        
        if (expandedStr) {
            try {
                const expanded = JSON.parse(expandedStr);
                appState.expandedFolders = new Set(expanded);
            } catch (e) {
                console.warn('恢复展开状态失败:', e);
            }
        }
        
        if (lastFolder) {
            console.log('📂 恢复上次的文件夹:', lastFolder);
            await openFolderByPath(lastFolder);
            
            if (lastFile) {
                console.log('📄 恢复上次的文件:', lastFile);
                setTimeout(() => {
                    loadFileToEditor(lastFile).catch(err => {
                        console.warn('恢复文件失败:', err);
                    });
                }, 500);
            }
        }
    } catch (error) {
        console.warn('恢复会话失败:', error);
    }
}

// ========================================
// 文件夹操作
// ========================================

async function handleOpenFolder() {
    console.log('📂 打开文件夹对话框...');
    
    try {
        const selected = await open({
            directory: true,
            multiple: false,
            title: '选择笔记文件夹'
        });
        
        if (selected && typeof selected === 'string') {
            await openFolderByPath(selected);
        }
    } catch (error) {
        console.error('❌ 打开文件夹失败:', error);
        showError('打开文件夹失败: ' + error);
    }
}

async function openFolderByPath(folderPath) {
    if (appState.isLoading) {
        console.warn('正在加载中，请稍候');
        return;
    }
    
    console.log('✅ 打开文件夹:', folderPath);
    appState.isLoading = true;
    appState.rootPath = folderPath;
    
    saveLastFolder(folderPath);
    
    try {
        await loadFolderTreeLazy(folderPath);
        searchBox.classList.add('active');
        showIndexingToast('正在后台建立索引，请稍候...');
        initializeIndexInBackground(folderPath);
    } finally {
        appState.isLoading = false;
    }
}

async function initializeIndexInBackground(basePath) {
    try {
        console.log('🔧 后台：开始初始化索引...');
        
        await invoke('initialize_index_command', { basePath });
        appState.indexInitialized = true;
        appState.dbInitialized = true;
        
        await invoke('index_files', { basePath });
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

async function loadFolderTreeLazy(path) {
    console.log('🌲 加载文件树:', path);
    
    try {
        const filesNested = await invoke('list_dir_tree', { path });
        appState.fullFileTree = filesNested;
        
        // 使用虚拟滚动渲染
        updateVirtualScrollData();
        
    } catch (error) {
        console.error('❌ 加载文件夹失败:', error);
        showError('加载文件夹失败: ' + error);
    }
}

/**
 * 获取应该显示的文件项（根据展开状态）
 */
function getVisibleItems(nodes, parentPath, level) {
    const result = [];
    
    for (const node of nodes) {
        const item = {
            name: node.name,
            path: node.path,
            is_dir: node.is_dir,
            level: level,
            hasChildren: node.children && node.children.length > 0
        };
        
        result.push(item);
        
        if (node.is_dir && appState.expandedFolders.has(node.path) && node.children) {
            const childItems = getVisibleItems(node.children, node.path, level + 1);
            result.push(...childItems);
        }
    }
    
    return result;
}

/**
 * 创建文件树列表项
 */
function createFileTreeItem(item) {
    const li = document.createElement('li');
    const indent = '  '.repeat(item.level);
    
    let icon;
    if (item.is_dir) {
        icon = item.hasChildren && appState.expandedFolders.has(item.path) ? '📂' : '📁';
    } else {
        icon = '📄';
    }
    
    const name = item.name.replace(/\\/g, '/').split('/').pop();
    
    li.textContent = `${indent}${icon} ${name}`;
    li.className = item.is_dir ? 'folder' : 'file';
    li.style.cssText = `
        height: ${VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT}px;
        line-height: ${VIRTUAL_SCROLL_CONFIG.ITEM_HEIGHT}px;
        padding-left: ${12 + item.level * 20}px;
    `;
    
    li.dataset.path = item.path;
    li.dataset.isDir = item.is_dir;
    li.dataset.name = name;
    
    // 高亮当前文件
    if (!item.is_dir && item.path === appState.activeFilePath) {
        li.classList.add('active');
    }
    
    return li;
}

/**
 * 处理文件列表点击（事件委托）
 */
function handleFileListClick(e) {
    const li = e.target.closest('li');
    if (!li) return;
    
    e.stopPropagation();
    
    const path = li.dataset.path;
    const isDir = li.dataset.isDir === 'true';
    
    if (isDir) {
        toggleFolderLazy(path);
    } else {
        loadFileToEditor(path);
    }
}

/**
 * 处理文件列表右键菜单（事件委托）
 */
function handleFileListContextMenu(e) {
    const li = e.target.closest('li');
    if (!li) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const item = {
        path: li.dataset.path,
        is_dir: li.dataset.isDir === 'true',
        name: li.dataset.name
    };
    
    showContextMenu(e, item);
}

/**
 * 切换文件夹展开/收起
 */
function toggleFolderLazy(folderPath) {
    console.log('🔄 切换文件夹:', folderPath);
    
    if (appState.expandedFolders.has(folderPath)) {
        appState.expandedFolders.delete(folderPath);
    } else {
        appState.expandedFolders.add(folderPath);
    }
    
    saveExpandedFolders();
    
    // 更新虚拟滚动数据并重新渲染
    updateVirtualScrollData();
}

// ========================================
// 文件编辑操作
// ========================================

async function loadFileToEditor(path) {
    console.log('📄 加载文件:', path);
    
    try {
        const content = await invoke('read_file_content', { path });
        
        markdownEditor.value = content;
        appState.activeFilePath = path;
        appState.hasUnsavedChanges = false;
        
        saveLastFile(path);
        
        const fileName = path.split(/[/\\]/).pop();
        document.getElementById('file-title').textContent = fileName;
        
        welcomeScreen.style.display = 'none';
        editorWrapper.style.display = 'flex';
        
        if (appState.currentViewMode === 'preview') {
            updatePreview();
        }
        
        // 更新高亮（重新渲染当前视口）
        handleVirtualScroll();
        
        console.log('✅ 文件加载成功');
        
    } catch (error) {
        console.error('❌ 加载文件失败:', error);
        showError('加载文件失败: ' + error);
    }
}

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
        
        saveLastFile(appState.activeFilePath);
        
        if (appState.indexInitialized) {
            invoke('index_files', { basePath: appState.rootPath }).catch(err => {
                console.warn('后台索引失败:', err);
            });
        }
        
    } catch (error) {
        console.error('❌ 保存文件失败:', error);
        showError('保存文件失败: ' + error);
    }
}

// ========================================
// 搜索功能
// ========================================

async function handleSearch() {
    const query = searchInput.value.trim();
    
    if (!query) {
        clearSearch();
        return;
    }
    
    if (!appState.indexInitialized) {
        showError('索引尚未建立完成，请稍候再试');
        return;
    }
    
    appState.searchQuery = query;
    clearSearchBtn.style.display = 'block';
    
    try {
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

function displaySearchResults(results) {
    fileListContainer.style.display = 'none';
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

function clearSearch() {
    searchInput.value = '';
    appState.searchQuery = '';
    clearSearchBtn.style.display = 'none';
    
    fileListContainer.style.display = 'block';
    searchResultsList.style.display = 'none';
    searchResultsList.innerHTML = '';
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
        
        showSuccessMessage('笔记已创建: ' + fullFileName);
        
        appState.expandedFolders.add(targetPath);
        saveExpandedFolders();
        
        await loadFolderTreeLazy(appState.rootPath);
        
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
        
        showSuccessMessage('文件夹已创建: ' + folderName);
        
        appState.expandedFolders.add(targetPath);
        saveExpandedFolders();
        
        await loadFolderTreeLazy(appState.rootPath);
        
    } catch (error) {
        console.error('❌ 创建文件夹失败:', error);
        showError('创建文件夹失败: ' + error);
    }
}

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
        return;
    }
    
    await performDelete(target, itemType, itemName);
}

async function performDelete(target, itemType, itemName) {
    try {
        if (target.isDir) {
            await invoke('delete_folder', { path: target.path });
        } else {
            await invoke('delete_item', { path: target.path });
        }
        
        showSuccessMessage(`${itemType}已删除: ${itemName}`);
        
        if (appState.activeFilePath === target.path) {
            markdownEditor.value = '';
            appState.activeFilePath = null;
            welcomeScreen.style.display = 'flex';
            editorWrapper.style.display = 'none';
            localStorage.removeItem(STORAGE_KEYS.LAST_FILE);
        }
        
        await loadFolderTreeLazy(appState.rootPath);
        
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

console.log('✅ main.js 加载完成（虚拟滚动版）');