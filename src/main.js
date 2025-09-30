/**
 * CheetahNote - 高性能 Markdown 笔记软件
 * 主前端脚本 - 集成全文搜索功能
 */

console.log('📜 main.js 开始加载...');

// 全局变量
let invoke, open;
let openFolderBtn, fileListElement, searchBox, searchInput, clearSearchBtn;
let searchResultsList, welcomeScreen, editorWrapper;
let markdownEditor, htmlPreview, editModeBtn, previewModeBtn, saveBtn;
let contextMenu, newNoteBtn, newFolderBtn, deleteFileBtn;
let customConfirmDialog;

// 应用状态
const appState = {
    rootPath: null,
    activeFilePath: null,
    hasUnsavedChanges: false,
    contextTarget: null,
    expandedFolders: new Set(),
    currentViewMode: 'edit',
    searchQuery: '',
    isSearching: false,
    dbInitialized: false
};

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
        searchBox = document.getElementById('search-box');
        searchInput = document.getElementById('search-input');
        clearSearchBtn = document.getElementById('clear-search-btn');
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
        
    } catch (error) {
        console.error('❌ 初始化失败:', error);
        alert('应用初始化失败: ' + error.message);
    }
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
            
            // 初始化数据库
            await initDatabase(selected);
            
            // 索引文件
            await indexFiles(selected);
            
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
 * 初始化数据库
 */
async function initDatabase(basePath) {
    try {
        console.log('🔧 初始化数据库...');
        await invoke('init_or_load_db', { basePath });
        appState.dbInitialized = true;
        console.log('✅ 数据库初始化成功');
    } catch (error) {
        console.error('❌ 数据库初始化失败:', error);
        showError('数据库初始化失败: ' + error);
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
        // 不显示错误，因为这不是关键操作
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
    
    if (!appState.dbInitialized) {
        console.warn('数据库未初始化');
        return;
    }
    
    appState.searchQuery = query;
    clearSearchBtn.style.display = 'block';
    
    try {
        console.log('🔍 搜索:', query);
        appState.isSearching = true;
        
        const results = await invoke('search_notes', { 
            basePath: appState.rootPath, 
            query 
        });
        
        displaySearchResults(results);
        
    } catch (error) {
        console.error('❌ 搜索失败:', error);
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
        const icon = file.is_dir ? '📁' : '📄';
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
    welcomeScreen.style.display = 'block';
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
        htmlPreview.innerHTML = '<p style="color: red;">预览生成失败</p>';
    }
}

/**
 * 保存文件
 */
async function handleSaveFile() {
    if (!appState.activeFilePath) {
        console.warn('没有活动文件');
        return;
    }
    
    const content = markdownEditor.value;
    
    try {
        await invoke('save_file', {
            path: appState.activeFilePath,
            content
        });
        
        appState.hasUnsavedChanges = false;
        showSuccessMessage('文件已保存');
        
        // 重新索引文件（更新搜索索引）
        if (appState.dbInitialized) {
            await indexFiles(appState.rootPath);
        }
        
    } catch (error) {
        console.error('❌ 保存失败:', error);
        showError('保存失败: ' + error);
    }
}

/**
 * 显示右键菜单
 */
function showContextMenu(event, file) {
    event.preventDefault();
    
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
        if (appState.dbInitialized) {
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
        
        if (!target.isDir && appState.activeFilePath === target.path) {
            clearEditor();
        } else if (target.isDir && appState.activeFilePath && 
                   appState.activeFilePath.startsWith(target.path)) {
            clearEditor();
        }
        
        await loadFolderTree(appState.rootPath);
        
        // 重新索引文件
        if (appState.dbInitialized) {
            await indexFiles(appState.rootPath);
        }
        
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

// 启动应用
console.log('📌 注册初始化函数...');

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

// 导出到全局
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
    showCustomConfirm,
    handleSearch,
    clearSearch
};

console.log('✅ main.js 加载完成');