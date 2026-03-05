const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const PNG = require('pngjs').PNG;
const app = express();
const port = 3000;

// 配置静态文件目录
app.use(express.static('public'));
app.use('/output', express.static('output'));

// 配置文件上传
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// 确保上传目录存在
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// 确保输出目录存在
if (!fs.existsSync('output')) {
    fs.mkdirSync('output');
}

async function autoCrop(inputPath, outputPath) {
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
                    
                    // 保存裁剪后的图片
                    cropped.pack().pipe(fs.createWriteStream(outputPath))
                        .on('finish', resolve)
                        .on('error', reject);
                } else {
                    // 如果没有非透明区域，直接复制原始图片
                    fs.copyFile(inputPath, outputPath, (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
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
            return res.status(400).json({ error: '请选择PNG格式的图片' });
        }
        
        // 保存裁剪后的图片
        const outputPath = path.join('output', `cropped_${Date.now()}${ext}`);
        await autoCrop(req.file.path, outputPath);
        
        // 删除上传的临时文件
        fs.unlinkSync(req.file.path);
        
        // 返回裁剪后的图片路径
        res.json({ success: true, imageUrl: `/output/${path.basename(outputPath)}` });
    } catch (error) {
        console.error('处理图片时出错:', error);
        res.status(500).json({ error: '处理图片时出错' });
    }
});

app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});