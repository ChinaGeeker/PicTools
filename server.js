const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const PNG = require('pngjs').PNG;
const app = express();

// 配置静态文件目录
app.use(express.static('public'));

// 获取临时目录路径
const tempDir = os.tmpdir();

// 配置文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, tempDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

async function autoCrop(inputPath) {
    return new Promise((resolve, reject) => {
        fs.createReadStream(inputPath)
            .pipe(new PNG())
            .on('parsed', function() {
                // 初始化边界
                let minX = this.width;
                let minY = this.height;
                let maxX = 0;
                let maxY = 0;
                
                // 遍历像素，找到非透明区域的边界
                for (let y = 0; y < this.height; y++) {
                    for (let x = 0; x < this.width; x++) {
                        const idx = (this.width * y + x) << 2;
                        const alpha = this.data[idx + 3];
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
                            const srcIdx = (this.width * (minY + y) + (minX + x)) << 2;
                            const dstIdx = (cropWidth * y + x) << 2;
                            cropped.data[dstIdx] = this.data[srcIdx];     // R
                            cropped.data[dstIdx + 1] = this.data[srcIdx + 1]; // G
                            cropped.data[dstIdx + 2] = this.data[srcIdx + 2]; // B
                            cropped.data[dstIdx + 3] = this.data[srcIdx + 3]; // A
                        }
                    }
                    
                    // 保存到临时文件
                    const outputPath = path.join(tempDir, `cropped_${Date.now()}.png`);
                    cropped.pack().pipe(fs.createWriteStream(outputPath))
                        .on('finish', () => resolve(outputPath))
                        .on('error', reject);
                } else {
                    // 如果没有非透明区域，返回原始文件
                    resolve(inputPath);
                }
            })
            .on('error', reject);
    });
}

app.post('/crop', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '请选择图片' });
        }
        
        // 检查文件扩展名
        const ext = path.extname(req.file.originalname).toLowerCase();
        if (ext !== '.png') {
            // 清理临时文件
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: '请选择PNG格式的图片' });
        }
        
        // 裁剪图片
        const outputPath = await autoCrop(req.file.path);
        
        // 读取裁剪后的图片
        const imageBuffer = fs.readFileSync(outputPath);
        
        // 清理临时文件
        fs.unlinkSync(req.file.path);
        if (outputPath !== req.file.path) {
            fs.unlinkSync(outputPath);
        }
        
        // 设置响应头
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `attachment; filename=cropped_${Date.now()}.png`);
        
        // 返回图片
        res.send(imageBuffer);
    } catch (error) {
        console.error('处理图片时出错:', error);
        // 尝试清理临时文件
        if (req.file && req.file.path) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (e) {}
        }
        res.status(500).json({ error: '处理图片时出错' });
    }
});

// 根路径
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 导出app供Vercel使用
module.exports = app;