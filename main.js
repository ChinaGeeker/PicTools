const { app, BrowserWindow } = require('electron');
const path = require('path');

// 禁用自动更新和崩溃报告，避免沙盒环境限制
app.autoUpdater.enabled = false;
app.crashReporter.enabled = false;

// 设置应用目录为当前工作目录，避免在系统目录创建文件
app.setPath('userData', path.join(__dirname, 'userData'));

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});