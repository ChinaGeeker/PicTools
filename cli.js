const Jimp = require('jimp');
const path = require('path');
const fs = require('fs');

async function autoCrop(image) {
    // 获取图片尺寸
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    
    // 初始化边界
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    
    // 遍历像素，找到非透明区域的边界
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pixel = Jimp.intToRGBA(image.getPixelColor(x, y));
            // 检查像素是否非透明（alpha > 0）
            if (pixel.a > 0) {
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
        // 裁剪图片
        return image.crop(minX, minY, cropWidth, cropHeight);
    } else {
        // 如果没有非透明区域，返回原始图片
        return image;
    }
}

async function cropImage(inputPath) {
    try {
        // 检查文件是否存在
        if (!fs.existsSync(inputPath)) {
            console.error('错误：文件不存在');
            return;
        }
        
        // 检查文件扩展名
        const ext = path.extname(inputPath).toLowerCase();
        if (ext !== '.png') {
            console.error('错误：请选择PNG格式的图片');
            return;
        }
        
        console.log('正在处理图片...');
        
        // 加载图片
        const image = await Jimp.read(inputPath);
        
        // 自动裁剪
        const croppedImage = await autoCrop(image);
        
        // 保存裁剪后的图片
        const outputPath = path.join(path.dirname(inputPath), `cropped_${path.basename(inputPath)}`);
        await croppedImage.writeAsync(outputPath);
        
        console.log(`图片裁剪成功！保存路径：${outputPath}`);
    } catch (error) {
        console.error('处理图片时出错:', error);
    }
}

// 获取命令行参数
const inputPath = process.argv[2];

if (!inputPath) {
    console.log('用法：node cli.js <图片路径>');
    console.log('示例：node cli.js test.png');
} else {
    cropImage(inputPath);
}