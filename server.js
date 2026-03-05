const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const PNG = require('pngjs').PNG;
const app = express();

// 环境信息
console.log('Environment:', process.env.NODE_ENV);
console.log('Port:', process.env.PORT);
console.log('Current directory:', __dirname);

// 配置静态文件目录
app.use(express.static('public', {
    maxAge: 0,
    setHeaders: (res, path) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
}));

// 启用CORS
app.use((req, res, next) => {
    console.log('Request:', req.method, req.url);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
        console.log('OPTIONS request, returning 200');
        return res.status(200).end();
    }
    next();
});

// 获取临时目录路径
const tempDir = process.env.TMPDIR || process.env.TEMP || os.tmpdir();
console.log('Temporary directory:', tempDir);

// 确保临时目录存在
if (!fs.existsSync(tempDir)) {
    try {
        fs.mkdirSync(tempDir, { recursive: true });
        console.log('Created temporary directory:', tempDir);
    } catch (error) {
        console.error('创建临时目录失败:', error);
        // 如果无法创建临时目录，使用当前目录
        tempDir = __dirname;
        console.log('Falling back to current directory:', tempDir);
    }
}

// 配置文件上传
const storage = multer.memoryStorage();

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB限制
    }
});

async function autoCrop(buffer) {
    return new Promise((resolve, reject) => {
        try {
            const png = new PNG();
            png.parse(buffer, (error, data) => {
                if (error) {
                    return reject(error);
                }
                
                // 初始化边界
                let minX = data.width;
                let minY = data.height;
                let maxX = 0;
                let maxY = 0;
                
                // 遍历像素，找到非透明区域的边界
                for (let y = 0; y < data.height; y++) {
                    for (let x = 0; x < data.width; x++) {
                        const idx = (data.width * y + x) << 2;
                        const alpha = data.data[idx + 3];
                        // 检查像素是否非透明（alpha > 0）
                        if (alpha > 0) {
                            minX = Math.min(minX, x);
                            minY = Math.min(minY, y);
                            maxX = Math.max(maxX, x);
                            maxY = Math.max(maxY, y);
                        }
                    }
                }
                
                // 计算裁剪区域
                const cropWidth = maxX - minX + 1;
                const cropHeight = maxY - minY + 1;
                
                // 确保找到非透明区域
                if (cropWidth > 0 && cropHeight > 0) {
                    // 创建新的PNG对象
                    const cropped = new PNG({
                        width: cropWidth,
                        height: cropHeight
                    });
                    
                    // 复制裁剪区域的像素
                    for (let y = 0; y < cropHeight; y++) {
                        for (let x = 0; x < cropWidth; x++) {
                            const srcIdx = (data.width * (minY + y) + (minX + x)) << 2;
                            const dstIdx = (cropWidth * y + x) << 2;
                            cropped.data[dstIdx] = data.data[srcIdx];     // R
                            cropped.data[dstIdx + 1] = data.data[srcIdx + 1]; // G
                            cropped.data[dstIdx + 2] = data.data[srcIdx + 2]; // B
                            cropped.data[dstIdx + 3] = data.data[srcIdx + 3]; // A
                        }
                    }
                    
                    // 转换为buffer
                    const chunks = [];
                    const stream = cropped.pack().pipe(require('stream').PassThrough());
                    stream.on('data', (chunk) => chunks.push(chunk));
                    stream.on('end', () => resolve(Buffer.concat(chunks)));
                    stream.on('error', reject);
                } else {
                    // 如果没有非透明区域，返回原始buffer
                    resolve(buffer);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

app.post('/crop', upload.single('image'), async (req, res) => {
    try {
        console.log('Received crop request');
        if (!req.file) {
            console.error('No file uploaded');
            return res.status(400).json({ error: '请选择图片' });
        }
        
        console.log('Uploaded file:', req.file.originalname);
        console.log('File size:', req.file.size);
        console.log('File type:', req.file.mimetype);
        
        // 检查文件类型
        if (req.file.mimetype !== 'image/png') {
            console.error('Invalid file type:', req.file.mimetype);
            return res.status(400).json({ error: '请选择PNG格式的图片' });
        }
        
        // 裁剪图片
        console.log('Starting crop process');
        const croppedBuffer = await autoCrop(req.file.buffer);
        console.log('Crop completed, buffer size:', croppedBuffer.length);
        
        // 设置响应头
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Length', croppedBuffer.length);
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        
        console.log('Sending image response');
        // 返回图片
        res.send(croppedBuffer);
    } catch (error) {
        console.error('处理图片时出错:', error);
        res.status(500).json({ error: '处理图片时出错' });
    }
});

// 根路径
app.get('/', (req, res) => {
    try {
        const indexPath = path.join(__dirname, 'public', 'index.html');
        console.log('Serving index.html from:', indexPath);
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            console.error('index.html not found');
            res.status(404).send('File not found');
        }
    } catch (error) {
        console.error('Error serving index.html:', error);
        res.status(500).send('Internal server error');
    }
});

// 健康检查
app.get('/health', (req, res) => {
    console.log('Health check requested');
    res.status(200).json({ 
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// 404处理
app.use((req, res) => {
    console.log('404:', req.method, req.url);
    res.status(404).json({ error: 'Not found' });
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 导出app
module.exports = app;

// 本地运行时启动服务器
if (require.main === module) {
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`服务器运行在 http://localhost:${port}`);
    });
}