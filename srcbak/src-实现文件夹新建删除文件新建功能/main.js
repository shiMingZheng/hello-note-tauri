/**
 * CheetahNote - 文件浏览和内容查看功能
 * 主前端脚本
 */

console.log('📜 main.js 开始加载...');

// 全局变量
let invoke, open;
let openFolderBtn, fileListElement, welcomeScreen, contentDisplay, contextMenu;
let newNoteBtn, newFolderBtn, deleteFileBtn;

const appState = {
    currentPath: null,  // 当前浏览的路径
    rootPath: null,     // 根路径（用户最初选择的文件夹）
    files: [],
    isLoading: false,
    activeFile: null,   // 当前活动的文件路径
    contextTarget: null // 右键菜单目标 {path, isDir, element}
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
        
        if (!openFolderBtn || !fileListElement || !welcomeScreen || !contentDisplay || !contextMenu) {
            throw new Error('缺少必需的 DOM 元素');
        }
        
        console.log('✅ DOM 元素已找到');
        
        openFolderBtn.addEventListener('click', handleOpenFolder);
        
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
        
        // 设置根路径
        appState.rootPath = selectedPath;
        appState.currentPath = selectedPath;
        
        // 使用树状加载
        await loadFolderTree(selectedPath);
        
    } catch (error) {
        console.error('❌ 打开文件夹失败:', error);
        showError('打开文件夹失败: ' + error.message);
    } finally {
        setButtonLoading(false);
    }
}

/**
 * 加载文件夹树（递归加载所有子目录）
 */
async function loadFolderTree(path) {
    try {
        console.log('📖 正在递归读取目录树:', path);
        
        if (!invoke) {
            throw new Error('Tauri invoke API 未加载');
        }
        
        fileListElement.innerHTML = '<li style="color: #0d6efd; font-style: italic;">⏳ 正在加载目录树...</li>';
        
        // 调用递归树加载命令，限制最大深度为5层
        const files = await invoke('list_dir_tree', { path, maxDepth: 5 });
        
        console.log('✅ 目录树读取成功，总项目数:', files.length);
        
        appState.files = files;
        renderFileTree(files);
        
    } catch (error) {
        console.error('❌ 读取目录树失败:', error);
        showError('读取目录树失败: ' + error);
        fileListElement.innerHTML = `<li style="color: #dc3545; font-style: italic;">❌ 读取失败: ${error}</li>`;
    }
}

/**
 * 渲染文件树（带缩进的树状结构）
 */
function renderFileTree(files) {
    console.log('🎨 开始渲染文件树，项目数:', files.length);
    
    if (!fileListElement) {
        console.error('❌ fileListElement 未定义');
        return;
    }
    
    // 清空列表
    fileListElement.innerHTML = '';
    
    // 如果为空
    if (!files || files.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.style.color = '#6c757d';
        emptyLi.style.fontStyle = 'italic';
        emptyLi.textContent = '📭 文件夹为空';
        fileListElement.appendChild(emptyLi);
        return;
    }
    
    // 渲染每个项目（已经包含层级信息）
    files.forEach((file, index) => {
        const li = document.createElement('li');
        li.textContent = file.name;
        li.className = 'tree-item';
        
        // 设置缩进（每层缩进 20px）
        li.style.paddingLeft = `${12 + file.level * 20}px`;
        
        // 添加目录类
        if (file.is_dir) {
            li.classList.add('is-dir');
        }
        
        // 高亮当前活动文件
        if (file.path === appState.activeFile) {
            li.classList.add('active');
        }
        
        // 只有文件才能点击查看内容
        if (!file.is_dir) {
            li.addEventListener('click', () => handleFileClick(file, index));
        } else {
            // 文件夹不可点击（因为已经全部展开）
            li.style.cursor = 'default';
        }
        
        fileListElement.appendChild(li);
    });
    
    console.log(`✅ 已渲染 ${files.length} 个项目（树状）`);
}

/**
 * 处理文件点击（文件夹已不可点击）
 */
async function handleFileClick(file, fileIndex) {
    console.log('📄 点击文件:', file.name);
    
    // 只处理文件
    if (file.is_dir) {
        return;
    }
    
    // 先移除所有 active 类
    const allItems = fileListElement.querySelectorAll('li.tree-item');
    allItems.forEach(item => item.classList.remove('active'));
    
    // 给当前文件添加 active 类
    const targetLi = fileListElement.children[fileIndex];
    if (targetLi) {
        targetLi.classList.add('active');
    }
    
    await loadFileContent(file.path);
}

/**
 * 加载并显示文件内容
 */
async function loadFileContent(filePath) {
    try {
        console.log('📖 正在读取文件:', filePath);
        
        if (!invoke) {
            throw new Error('Tauri invoke API 未加载');
        }
        
        // 显示加载中
        contentDisplay.innerHTML = '<p style="color: #6c757d; font-style: italic;">⏳ 正在加载文件...</p>';
        contentDisplay.style.display = 'block';
        welcomeScreen.style.display = 'none';
        
        // 调用后端命令读取文件
        const content = await invoke('read_file_content', { path: filePath });
        
        console.log('✅ 文件读取成功，内容长度:', content.length);
        
        // 显示文件内容
        contentDisplay.textContent = content;
        
        // 更新活动文件状态
        appState.activeFile = filePath;
        
    } catch (error) {
        console.error('❌ 读取文件失败:', error);
        contentDisplay.innerHTML = `<p style="color: #dc3545;">❌ 读取文件失败: ${error}</p>`;
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
        openFolderBtn.textContent = '⏳ 加载中...';
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
 * 处理右键菜单显示
 */
function handleContextMenu(e) {
    const target = e.target;
    
    // 判断点击目标
    if (target.tagName === 'LI' && target.classList.contains('tree-item')) {
        // 点击了文件或文件夹
        const index = Array.from(fileListElement.children).indexOf(target);
        const file = appState.files[index];
        
        if (file) {
            appState.contextTarget = {
                path: file.path,
                isDir: file.is_dir,
                name: file.name,
                element: target
            };
            
            // 根据类型显示不同菜单项
            if (file.is_dir) {
                // 文件夹：显示新建选项
                showMenuItem(newNoteBtn);
                showMenuItem(newFolderBtn);
                hideMenuItem(deleteFileBtn);
            } else {
                // 文件：显示删除选项
                hideMenuItem(newNoteBtn);
                hideMenuItem(newFolderBtn);
                showMenuItem(deleteFileBtn);
            }
        }
    } else {
        // 点击空白区域：显示新建选项
        appState.contextTarget = {
            path: appState.currentPath,
            isDir: true,
            isContainer: true
        };
        
        showMenuItem(newNoteBtn);
        showMenuItem(newFolderBtn);
        hideMenuItem(deleteFileBtn);
    }
    
    // 定位并显示菜单
    positionContextMenu(e.clientX, e.clientY);
}

/**
 * 定位上下文菜单
 */
function positionContextMenu(x, y) {
    contextMenu.style.left = x + 'px';
    contextMenu.style.top = y + 'px';
    contextMenu.classList.add('visible');
}

/**
 * 隐藏上下文菜单
 */
function hideContextMenu() {
    contextMenu.classList.remove('visible');
}

/**
 * 显示菜单项
 */
function showMenuItem(element) {
    element.style.display = 'block';
}

/**
 * 隐藏菜单项
 */
function hideMenuItem(element) {
    element.style.display = 'none';
}

/**
 * 处理创建笔记
 */
async function handleCreateNote() {
    hideContextMenu();
    
    const fileName = prompt('请输入笔记名称（不需要输入.md后缀）:');
    
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
 * 处理删除文件
 */
async function handleDeleteFile() {
    hideContextMenu();
    
    const target = appState.contextTarget;
    
    if (!target || target.isDir) {
        return;
    }
    
    const confirmDelete = confirm(
        `确定要删除文件: ${target.name} 吗？\n\n此操作无法撤销。`
    );
    
    if (!confirmDelete) {
        return;
    }
    
    try {
        await invoke('delete_item', { path: target.path });
        
        console.log('✅ 文件删除成功:', target.name);
        
        // 如果删除的是当前打开的文件，清空右侧内容
        if (appState.activeFile === target.path) {
            contentDisplay.style.display = 'none';
            welcomeScreen.style.display = 'block';
            appState.activeFile = null;
        }
        
        // 刷新列表
        await loadFolderTree(appState.rootPath);
        
    } catch (error) {
        console.error('❌ 删除文件失败:', error);
        showError('删除文件失败: ' + error);
    }
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
    loadFileContent,
    handleCreateNote,
    handleCreateFolder,
    handleDeleteFile
};

console.log('✅ main.js 加载完成');