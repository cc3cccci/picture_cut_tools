const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5002;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp'
};

const server = http.createServer((req, res) => {
    // API endpoint for direct file saves inside the workspace
    if (req.method === 'POST' && req.url === '/api/save') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                const { folderName, files } = payload;
                
                // Securely compute destination directory inside project
                const safeFolderName = path.basename(folderName);
                const outputDir = path.join(__dirname, safeFolderName);
                
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                }
                
                files.forEach(file => {
                    const safeFileName = path.basename(file.name);
                    const filePath = path.join(outputDir, safeFileName);
                    // Strip data url metadata to get pure base64
                    const base64Data = file.data.replace(/^data:image\/\w+;base64,/, "");
                    fs.writeFileSync(filePath, base64Data, 'base64');
                });
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, path: outputDir }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        });
        return;
    }

    // Decode URI to handle non-ascii characters or spaces in path if necessary
    let decodedUrl;
    try {
        decodedUrl = decodeURIComponent(req.url);
    } catch (e) {
        decodedUrl = req.url;
    }
    
    let filePath = decodedUrl === '/' ? '/index.html' : decodedUrl;
    filePath = filePath.split('?')[0].split('#')[0];
    
    const absolutePath = path.join(__dirname, filePath);
    
    // Prevent directory traversal
    if (!absolutePath.startsWith(__dirname)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('403 Forbidden - 越界访问被拒绝');
        return;
    }
    
    fs.readFile(absolutePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.end('404 Not Found - 文件未找到');
            } else {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                res.end('500 Internal Server Error - 服务器内部错误: ' + err.code);
            }
            return;
        }
        
        const ext = path.extname(absolutePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 网格切图与分图工具 (Grid Image Splitter) 启动成功!`);
    console.log(`👉 浏览器打开: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
});
