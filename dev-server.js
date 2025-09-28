// dev-server.js
// CheetahNote 开发服务器 - 支持热重载和 CORS

const http = require('http');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const PORT = 1420;
const HOST = 'localhost';
const SRC_DIR = './src';

// 文件系统监控（简单版本的热重载）
let clients = [];

// MIME 类型映射
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject'
};

// 获取文件的 MIME 类型
function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}

// 设置 CORS 头
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
}

// 发送错误响应
function sendError(res, statusCode, message) {
    setCorsHeaders(res);
    res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(message);
}

// 发送文件
async function sendFile(res, filePath) {
    try {
        const stats = await promisify(fs.stat)(filePath);
        
        if (!stats.isFile()) {
            sendError(res, 404, '文件不存在');
            return;
        }

        const mimeType = getMimeType(filePath);
        setCorsHeaders(res);
        
        res.writeHead(200, {
            'Content-Type': mimeType,
            'Content-Length': stats.size,
            'Last-Modified': stats.mtime.toUTCString(),
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });

        const readStream = fs.createReadStream(filePath);
        readStream.pipe(res);
        
        readStream.on('error', (error) => {
            console.error(`文件读取错误: ${error.message}`);
            if (!res.headersSent) {
                sendError(res, 500, '文件读取失败');
            }
        });

    } catch (error) {
        console.error(`文件访问错误: ${error.message}`);
        sendError(res, 404, '文件不存在');
    }
}

// 处理 HTTP 请求
async function handleRequest(req, res) {
    const startTime = Date.now();
    let { url, method } = req;
    
    console.log(`${new Date().toISOString()} ${method} ${url}`);

    // 处理 OPTIONS 请求（CORS 预检）
    if (method === 'OPTIONS') {
        setCorsHeaders(res);
        res.writeHead(200);
        res.end();
        return;
    }

    // 清理 URL
    url = decodeURIComponent(url);
    const urlPath = url.split('?')[0];
    
    // 路由处理
    let filePath;
    
    if (urlPath === '/' || urlPath === '/index.html') {
        filePath = path.join(SRC_DIR, 'index.html');
    } else if (urlPath === '/live-reload') {
        // 简单的 Server-Sent Events 端点用于热重载
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        
        clients.push(res);
        
        res.write('data: connected\n\n');
        
        req.on('close', () => {
            clients = clients.filter(client => client !== res);
        });
        
        return;
    } else {
        // 静态文件
        filePath = path.join(SRC_DIR, urlPath);
    }

    // 安全检查：防止目录遍历攻击
    const resolvedPath = path.resolve(filePath);
    const resolvedSrcDir = path.resolve(SRC_DIR);
    
    if (!resolvedPath.startsWith(resolvedSrcDir)) {
        sendError(res, 403, '禁止访问');
        return;
    }

    await sendFile(res, filePath);
    
    const duration = Date.now() - startTime;
    console.log(`  ✅ 响应时间: ${duration}ms`);
}

// 创建 HTTP 服务器
const server = http.createServer(handleRequest);

// 监听文件变化（简单的热重载）
function watchFiles() {
    if (fs.watch) {
        try {
            fs.watch(SRC_DIR, { recursive: true }, (eventType, filename) => {
                if (filename && (filename.endsWith('.html') || filename.endsWith('.css') || filename.endsWith('.js'))) {
                    console.log(`📝 文件变化: ${filename}`);
                    
                    // 通知所有连接的客户端刷新
                    clients.forEach(client => {
                        try {
                            client.write('data: reload\n\n');
                        } catch (error) {
                            // 客户端连接已断开
                        }
                    });
                }
            });
            console.log(`👀 文件监控已启动: ${SRC_DIR}`);
        } catch (error) {
            console.warn(`⚠️  文件监控启动失败: ${error.message}`);
        }
    }
}

// 启动服务器
server.listen(PORT, HOST, () => {
    console.log('');
    console.log('🚀 CheetahNote 开发服务器启动成功！');
    console.log('');
    console.log(`📡 服务地址: http://${HOST}:${PORT}`);
    console.log(`📁 静态目录: ${path.resolve(SRC_DIR)}`);
    console.log(`⏰ 启动时间: ${new Date().toLocaleString()}`);
    console.log('');
    console.log('🔥 功能特性:');
    console.log('   - CORS 支持');
    console.log('   - 热重载 (监控 HTML/CSS/JS 文件)');
    console.log('   - 安全路径检查');
    console.log('   - 详细日志输出');
    console.log('');
    console.log('💡 使用方法:');
    console.log('   1. 在另一个终端运行: cargo tauri dev');
    console.log('   2. 或直接在浏览器访问: http://localhost:1420');
    console.log('');
    console.log('⚙️  如需停止服务器，请按 Ctrl+C');
    console.log('');
    
    // 启动文件监控
    watchFiles();
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n');
    console.log('🛑 正在关闭开发服务器...');
    
    // 关闭所有客户端连接
    clients.forEach(client => {
        try {
            client.end();
        } catch (error) {
            // 忽略错误
        }
    });
    
    server.close(() => {
        console.log('✅ 开发服务器已关闭');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n🛑 收到终止信号，正在关闭服务器...');
    server.close(() => {
        process.exit(0);
    });
});

// 错误处理
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ 端口 ${PORT} 已被占用！`);
        console.log('💡 解决方案:');
        console.log(`   1. 更改端口号（修改此文件中的 PORT 变量）`);
        console.log(`   2. 或者终止占用端口的进程`);
        console.log(`   3. 检查是否已有其他开发服务器在运行`);
    } else {
        console.error(`❌ 服务器错误: ${error.message}`);
    }
    process.exit(1);
});

// 添加热重载客户端脚本到 HTML（如果需要）
if (fs.existsSync(path.join(SRC_DIR, 'index.html'))) {
    const indexPath = path.join(SRC_DIR, 'index.html');
    fs.readFile(indexPath, 'utf8', (err, data) => {
        if (!err && !data.includes('live-reload')) {
            console.log('💡 提示: 可以在 HTML 中添加以下代码以启用自动刷新:');
            console.log('');
            console.log('<script>');
            console.log('  // 热重载支持');
            console.log('  if (location.hostname === "localhost") {');
            console.log('    const eventSource = new EventSource("/live-reload");');
            console.log('    eventSource.onmessage = (event) => {');
            console.log('      if (event.data === "reload") {');
            console.log('        location.reload();');
            console.log('      }');
            console.log('    };');
            console.log('  }');
            console.log('</script>');
            console.log('');
        }
    });
}