const { app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Talent Flow',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  // 拦截关闭按钮，实现最小化到托盘
  mainWindow.on('close', function (event) {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      event.returnValue = false;
    }
  });
}

function createTray() {
  // 创建一个空白图标作为托盘图标 (如果后续有真正的图标，请替换这里)
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: '打开 Talent Flow', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: '彻底退出', click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Talent Flow 招聘跟进系统');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    // 不要退出，保持托盘运行
    // app.quit(); 
  }
});

const CryptoEngine = require('./lib/crypto-engine');

// IPC: 数据存取逻辑
const userDataPath = app.getPath('userData');
const dataFilePath = path.join(userDataPath, 'candidate_data.json');

let cachedPassword = null;
let idleTimeout = null;
const IDLE_LOCK_TIME = 15 * 60 * 1000;

function resetIdleTimer() {
  if (idleTimeout) clearTimeout(idleTimeout);
  if (cachedPassword) {
    idleTimeout = setTimeout(() => {
      cachedPassword = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('crypto-lock-triggered');
      }
    }, IDLE_LOCK_TIME);
  }
}

ipcMain.handle('is-encrypted', async () => {
  if (!fs.existsSync(dataFilePath)) return false;
  try {
    const raw = fs.readFileSync(dataFilePath);
    return CryptoEngine.isEncryptedFormat(raw);
  } catch {
    return false;
  }
});

ipcMain.handle('set-encryption-password', (event, pwd) => {
  if (event.sender !== mainWindow.webContents) return { success: false, reason: 'UNAUTHORIZED' };
  if (!pwd || pwd.length < 8 || !/[a-zA-Z]/.test(pwd) || !/\d/.test(pwd)) {
    return { success: false, reason: 'WEAK_PASSWORD' };
  }
  cachedPassword = pwd;
  resetIdleTimer();
  return { success: true };
});

ipcMain.handle('read-data', async (event, password) => {
  if (event.sender !== mainWindow.webContents) return null;
  if (!fs.existsSync(dataFilePath)) return null;

  resetIdleTimer();
  try {
    const raw = fs.readFileSync(dataFilePath);

    if (CryptoEngine.isEncryptedFormat(raw)) {
      const pwd = password || cachedPassword;
      if (!pwd) return { requireAuth: true };
      
      const decrypted = await CryptoEngine.decryptBlob(raw, pwd);
      cachedPassword = pwd;
      return JSON.parse(decrypted);
    } else {
      return JSON.parse(raw.toString('utf8'));
    }
  } catch (error) {
    console.error('Failed to read data:', error);
    return { error: 'decrypt_failed' };
  }
});

ipcMain.handle('write-data', async (event, dataStr, password) => {
  if (event.sender !== mainWindow.webContents) return false;
  if (typeof dataStr !== 'string') return false;
  if (dataStr.length > 50 * 1024 * 1024) return false; // 50MB limit

  resetIdleTimer();
  try {
    const parsed = JSON.parse(dataStr);
    const jsonStr = JSON.stringify(parsed);
    
    const pwd = password || cachedPassword;
    if (pwd) {
      const encrypted = await CryptoEngine.encryptBlob(jsonStr, pwd);
      fs.writeFileSync(dataFilePath, encrypted);
    } else {
      fs.writeFileSync(dataFilePath, jsonStr, 'utf8');
    }
    return true;
  } catch (error) {
    console.error('Failed to write data:', error);
    return false;
  }
});

ipcMain.handle('export-plaintext', async (event) => {
  if (event.sender !== mainWindow.webContents) return null;
  if (!fs.existsSync(dataFilePath)) return null;

  try {
    const raw = fs.readFileSync(dataFilePath);
    if (!CryptoEngine.isEncryptedFormat(raw)) {
      return JSON.parse(raw.toString('utf8'));
    }
    if (cachedPassword) {
      const decrypted = await CryptoEngine.decryptBlob(raw, cachedPassword);
      return JSON.parse(decrypted);
    }
    return null;
  } catch {
    return null;
  }
});

// IPC: 系统通知
ipcMain.on('send-notification', (event, { title, body }) => {
  if (event.sender !== mainWindow.webContents) return;
  const safeTitle = String(title || '').slice(0, 256);
  const safeBody = String(body || '').slice(0, 1024);
  new Notification({ title: safeTitle, body: safeBody }).show();
});
