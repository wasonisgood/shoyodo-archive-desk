const { app, BrowserWindow, Menu, Tray, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const { execFile, spawn } = require('child_process');
const { BrowserCrawlerEngine } = require('./browserCrawlerEngine.cjs');

// Windows 10/11 桌面 Toast 通知必備的 AppUserModelId
// 必須與安裝程式寫入捷徑的 AppUserModelID 一致（installer/InstallerApp.cs）
const APP_USER_MODEL_ID = 'com.shoyodo.oldthingsearch';
app.setAppUserModelId(APP_USER_MODEL_ID);

// 註冊 Windows 自定義協定 shoyodo://
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('shoyodo', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('shoyodo');
}

// 單一實例鎖：重複開啟時不再啟動第二份（避免橋接 port 48123 被佔用），改為喚回既有視窗
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

function adminSessionPath() {
  return path.join(app.getPath('userData'), 'admin-session.json');
}

function saveAdminSession(session) {
  try {
    fs.writeFileSync(adminSessionPath(), JSON.stringify(session, null, 2), 'utf-8');
  } catch (e) {
    console.error('儲存鑑札認證失敗:', e);
  }
}

function getAdminSession() {
  try {
    const p = adminSessionPath();
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    }
  } catch (e) {
    console.error('讀取鑑札認證失敗:', e);
  }
  return null;
}

function clearAdminSession() {
  try {
    const p = adminSessionPath();
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
    }
  } catch (e) {
    console.error('清除鑑札認證失敗:', e);
  }
}

function handleProtocolUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return;
  try {
    const raw = urlStr.replace(/^shoyodo:\/\/?/, 'http://localhost/');
    const parsed = new URL(raw);
    const uid = parsed.searchParams.get('uid');
    const name = parsed.searchParams.get('name') || '蕉葉堂管理者';
    const email = parsed.searchParams.get('email') || '';
    const token = parsed.searchParams.get('token') || '';
    if (uid || token) {
      const session = {
        uid: uid || 'admin',
        name: decodeURIComponent(name),
        email: decodeURIComponent(email),
        token,
        role: 'admin',
        authorizedAt: Date.now()
      };
      saveAdminSession(session);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('admin-auth-granted', session);
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      }
    }
  } catch (e) {
    console.error('解析協定連結失敗:', e);
  }
}

app.on('second-instance', (_event, commandLine) => {
  if (Array.isArray(commandLine)) {
    const url = commandLine.find(arg => typeof arg === 'string' && arg.startsWith('shoyodo:'));
    if (url) {
      handleProtocolUrl(url);
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

let mainWindow = null;
let crawlerInstance = null;
let tray = null;
let isQuitting = false;
let toastWindow = null;
let bridgeServer = null;

// 共享中繼中心檔案路徑 (連通「蕉葉堂 巡回台帳」與「蕉葉堂 — 蕉葉文庫」)
// 不寫死使用者名稱：優先沿用既有的 %USERPROFILE%\code\shoyodo-shared-data.json（開發機），
// 其他電腦則改存 %APPDATA%\Shoyodo\shoyodo-shared-data.json；可用環境變數 SHOYODO_SHARED_DATA 覆寫。
let SHARED_BRIDGE_PATH = null;
function bridgePath() {
  if (SHARED_BRIDGE_PATH) return SHARED_BRIDGE_PATH;
  if (process.env.SHOYODO_SHARED_DATA) {
    SHARED_BRIDGE_PATH = process.env.SHOYODO_SHARED_DATA;
  } else {
    const legacy = path.join(os.homedir(), 'code', 'shoyodo-shared-data.json');
    if (fs.existsSync(legacy)) {
      SHARED_BRIDGE_PATH = legacy;
    } else {
      const dir = path.join(app.getPath('appData'), 'Shoyodo');
      try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
      SHARED_BRIDGE_PATH = path.join(dir, 'shoyodo-shared-data.json');
    }
  }
  return SHARED_BRIDGE_PATH;
}

// 已見品項記錄（判斷哪些是「真正新收載」，供通知使用；存於 userData，重開機不遺失）
const SEEN_MAX = 20000;
function seenPath() {
  return path.join(app.getPath('userData'), 'seen-items.json');
}
function loadSeenIds() {
  try {
    const arr = JSON.parse(fs.readFileSync(seenPath(), 'utf-8'));
    if (Array.isArray(arr)) return arr;
  } catch (_) {}
  return [];
}
function saveSeenIds(arr) {
  try {
    fs.writeFileSync(seenPath(), JSON.stringify(arr.slice(-SEEN_MAX)), 'utf-8');
  } catch (e) {
    console.error('寫入已見品項記錄失敗:', e);
  }
}

function readSharedBridge() {
  try {
    if (fs.existsSync(bridgePath())) {
      return JSON.parse(fs.readFileSync(bridgePath(), 'utf-8'));
    }
  } catch (e) {
    console.error('讀取共享資料橋樑失敗:', e);
  }
  return { books: [], wishes: [], prospects: [], lastSyncedAt: Date.now() };
}

function writeSharedBridge(data) {
  try {
    data.lastSyncedAt = Date.now();
    fs.writeFileSync(bridgePath(),JSON.stringify(data, null, 2), 'utf-8');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('bridge-data-updated', data);
    }
  } catch (e) {
    console.error('寫入共享資料橋樑失敗:', e);
  }
}

// 啟動超輕量本地 HTTP 橋接 API (供 蕉葉文庫 網頁版即時跨域雙向通訊)
function startBridgeServer() {
  if (bridgeServer) return;
  bridgeServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, 'http://127.0.0.1:48123');

    if (url.pathname === '/api/auth/callback' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          saveAdminSession(data);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('admin-auth-granted', data);
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: '鑑札認可成功' }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (url.pathname === '/api/shared' || url.pathname === '/api/status') {
      const data = readSharedBridge();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
      return;
    }

    if (url.pathname === '/api/prospects' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const item = JSON.parse(body);
          const data = readSharedBridge();
          const exists = data.prospects.some(p => p.id === item.id || p.externalUrl === item.externalUrl);
          if (!exists) {
            data.prospects.unshift({ ...item, addedAt: Date.now() });
            writeSharedBridge(data);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, count: data.prospects.length }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (url.pathname.startsWith('/api/prospects/') && req.method === 'DELETE') {
      const prospectId = decodeURIComponent(url.pathname.replace('/api/prospects/', ''));
      const data = readSharedBridge();
      data.prospects = data.prospects.filter(p => p.id !== prospectId);
      writeSharedBridge(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, count: data.prospects.length }));
      return;
    }

    if (url.pathname === '/api/wishes' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const wishes = JSON.parse(body);
          const data = readSharedBridge();
          if (Array.isArray(wishes)) {
            data.wishes = wishes;
            writeSharedBridge(data);
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, wishesCount: data.wishes.length }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    if (url.pathname === '/api/books' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const book = JSON.parse(body);
          const data = readSharedBridge();
          data.books.unshift({ ...book, receivedAt: Date.now() });
          // 從市場候補移出
          data.prospects = data.prospects.filter(p => p.id !== book.id && p.title !== book.title);
          writeSharedBridge(data);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, booksCount: data.books.length }));
        } catch (e) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  bridgeServer.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      // 另一個程式（例如舊版或其他工具）已佔用此埠：直接沿用該橋樑，不彈出錯誤
      console.warn('橋接埠 48123 已被佔用，沿用既有共享伺服器。');
    } else {
      console.error('橋接伺服器錯誤:', err);
    }
    try { bridgeServer.close(); } catch (_) {}
    bridgeServer = null;
  });

  bridgeServer.listen(48123, '127.0.0.1', () => {
    console.log('蕉葉堂 跨域資料橋樑伺服器已於 http://127.0.0.1:48123 啟動');
  });
}

// 華麗和風自繪浮動桌面吐司 (含落款朱印、泥金宣紙與妙音磬鐘動畫)
function showFancyToast(data = {}) {
  try {
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;

    const toastWidth = 460;
    const toastHeight = 160;
    const x = Math.round(workArea.x + workArea.width - toastWidth - 20);
    const y = Math.round(workArea.y + workArea.height - toastHeight - 20);

    if (toastWindow && !toastWindow.isDestroyed()) {
      toastWindow.close();
      toastWindow = null;
    }

    toastWindow = new BrowserWindow({
      width: toastWidth,
      height: toastHeight,
      x: x,
      y: y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      show: false,
      focusable: false,
      backgroundColor: '#00000000',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      }
    });

    const toastPath = path.join(__dirname, 'toast.html');
    toastWindow.loadFile(toastPath, {
      query: { data: encodeURIComponent(JSON.stringify(data)) }
    });

    toastWindow.once('ready-to-show', () => {
      if (toastWindow && !toastWindow.isDestroyed()) {
        toastWindow.showInactive();
      }
    });

    toastWindow.on('closed', () => {
      toastWindow = null;
    });
  } catch (err) {
    console.error('開啟 Fancy Toast 失敗:', err);
  }
}


// ───── 線上更新 ─────
// 檢查、提醒頻率（每次開啟／每月一次／強制更新）與下載安裝皆由安裝目錄內的 ShoyodoUpdater.exe 處理；
// 沒有新版本或使用者已選擇延後時，更新程式會靜默結束、不顯示任何視窗。
// 結束代碼：10 = 已啟動新版安裝程式，20 = 強制更新被拒絕（台帳必須結束）
let updaterProc = null;
function updaterPath() {
  return path.join(path.dirname(process.execPath), 'ShoyodoUpdater.exe');
}
function launchUpdater({ manual = false } = {}) {
  if (process.platform !== 'win32' || updaterProc) return Boolean(updaterProc);
  const exe = updaterPath();
  if (!fs.existsSync(exe)) return false; // 開發模式或可攜版：沒有更新程式
  const args = ['--app-version', app.getVersion()];
  if (manual) args.push('--manual');
  try {
    updaterProc = spawn(exe, args, { stdio: 'ignore', windowsHide: false });
  } catch (e) {
    console.error('啟動更新程式失敗:', e);
    updaterProc = null;
    return false;
  }
  updaterProc.on('error', (e) => { console.error('更新程式錯誤:', e); updaterProc = null; });
  updaterProc.on('exit', (code) => {
    updaterProc = null;
    if (code === 10 || code === 20) {
      // 10：安裝程式即將覆寫檔案；20：強制更新被拒絕。兩者都需結束台帳
      isQuitting = true;
      app.quit();
    }
  });
  return true;
}

ipcMain.handle('app-get-version', () => app.getVersion());
ipcMain.handle('app-check-update', () => launchUpdater({ manual: true }));

function createTray() {
  const iconPath = path.join(__dirname, 'app.ico');
  tray = new Tray(iconPath);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '蕉葉堂 巡回台帳 を開く (打開台帳)',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: '［ 巡行即時実行 ］(即時巡行)',
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.send('trigger-crawl-from-tray');
        }
      }
    },
    {
      label: '更新を確認 (檢查更新)',
      click: () => launchUpdater({ manual: true })
    },
    { type: 'separator' },
    {
      label: '終了 (完全退出程式)',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('蕉葉堂 巡回台帳 — 定期巡行中（每 3 日一次）');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    frame: false, // 隱藏 Windows 預設原生邊框與選單，改由前端完全自定義自繪
    icon: path.join(__dirname, 'app.ico'),
    title: '蕉葉堂 巡回台帳 — 古物・戦前資料定期収集機',
    backgroundColor: '#f2ede2', // 宣紙底色，避免白屏閃爍
    show: false, // 先不顯示，等待 ready-to-show 徹底消除瞬間白屏
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  Menu.setApplicationMenu(null);

  // 工作列圖示：明確告訴 Windows 這個視窗的 AppUserModelID 與圖示檔。
  // 只呼叫 setAppUserModelId 而捷徑上沒有相同 ID 時，工作列可能找不到圖示而顯示空白。
  // 圖示必須是磁碟上的實體檔（不能在 app.asar 內），優先用安裝目錄的 app.ico，否則用執行檔內嵌圖示。
  if (process.platform === 'win32' && app.isPackaged) {
    try {
      const installIco = path.join(path.dirname(process.execPath), 'app.ico');
      mainWindow.setAppDetails({
        appId: APP_USER_MODEL_ID,
        appIconPath: fs.existsSync(installIco) ? installIco : process.execPath,
        appIconIndex: 0,
        relaunchCommand: `"${process.execPath}"`,
        relaunchDisplayName: '蕉葉堂 巡回台帳',
      });
    } catch (e) {
      console.error('設定工作列圖示失敗:', e);
    }
  }

  // 外部連結（市場選單、品項原始頁面）一律交給系統預設瀏覽器開啟，不在 App 內另開無框視窗
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  const localDistPath = path.join(__dirname, '../dist/index.html');

  if (app.isPackaged || fs.existsSync(localDistPath)) {
    mainWindow.loadFile(localDistPath);
  } else {
    mainWindow.loadURL('http://localhost:5174').catch(() => {
      mainWindow.loadFile(localDistPath);
    });
  }

  const startHidden = process.argv.includes('--hidden');

  // 當前端準備就緒時才顯示視窗（若為開機自啟動 --hidden，則直接留於系統匣背景常駐，不彈窗干擾）
  mainWindow.once('ready-to-show', () => {
    if (!startHidden) {
      mainWindow.show();
    } else {
      showFancyToast({
        kicker: 'SHOYODO ARCHIVE DESK ・ 背景常駐起動',
        title: '台帳已於開機時自啟動',
        body: '正於系統匣背景持續巡行（每 3 日一次）。',
        siteName: '開機自啟',
        eraYear: '常駐走查中',
        sealText: '常駐',
        iconText: '常',
        actionHint: '點擊展開台帳 ➔'
      });
    }
  });

  // 攔截視窗關閉事件：隱藏至系統匣常駐運行，彈出華麗和風吐司提示，完全捨棄 Windows 醜陋原生方框
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      showFancyToast({
        kicker: 'SHOYODO ARCHIVE DESK ・ 系統常駐巡行',
        title: '台帳已收攏於系統匣背景',
        body: '背景每 3 天定時走查。徹底退出請右鍵點擊圖示。',
        siteName: '系統匣常駐',
        eraYear: '週期：3天一次',
        sealText: '巡行',
        iconText: '巡',
        actionHint: '點擊喚回視窗 ➔'
      });
    }
  });

  // 視窗最大化狀態變更通知
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-maximized-state', true);
  });
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-maximized-state', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC 視窗控制
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// IPC 開機自啟動管理
// 與安裝程式一致，統一使用 HKCU Run 機碼下的「ShoyodoArchiveDesk」值；
// 同時清掉 Electron 預設名稱寫入的舊值，避免設定「關閉」後仍被另一筆登錄值自動啟動。
const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const RUN_VALUE = 'ShoyodoArchiveDesk';
function regExec(args) {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true }, (err, stdout) => resolve({ ok: !err, stdout: stdout || '' }));
  });
}
async function getAutostart() {
  if (process.platform !== 'win32') return app.getLoginItemSettings().openAtLogin;
  const r = await regExec(['query', RUN_KEY, '/v', RUN_VALUE]);
  return r.ok && r.stdout.includes(RUN_VALUE);
}
async function setAutostart(enable) {
  if (process.platform !== 'win32') {
    app.setLoginItemSettings({ openAtLogin: enable, args: ['--hidden'] });
    return app.getLoginItemSettings().openAtLogin;
  }
  try { app.setLoginItemSettings({ openAtLogin: false, args: ['--hidden'] }); } catch (_) {}
  if (enable) {
    await regExec(['add', RUN_KEY, '/v', RUN_VALUE, '/t', 'REG_SZ', '/d', `"${process.execPath}" --hidden`, '/f']);
  } else {
    await regExec(['delete', RUN_KEY, '/v', RUN_VALUE, '/f']);
  }
  return getAutostart();
}

ipcMain.handle('autostart-get', async () => {
  try { return await getAutostart(); } catch (e) { return false; }
});

ipcMain.handle('autostart-set', async (_e, enable) => {
  try { return await setAutostart(Boolean(enable)); } catch (e) { return false; }
});

// IPC 實際資料存放位置（顯示於奧付，取代原本寫死的路徑）
ipcMain.handle('app-get-paths', () => ({
  userData: app.getPath('userData'),
  sharedBridge: bridgePath(),
}));

// IPC 手動關閉 Fancy Toast
ipcMain.on('toast-close', () => {
  if (toastWindow && !toastWindow.isDestroyed()) {
    toastWindow.close();
    toastWindow = null;
  }
});

// IPC 點擊 Fancy Toast 喚回主視窗
ipcMain.on('toast-clicked', (_e, payload) => {
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('toast-item-selected', payload);
  }
});

// IPC 手動觸發和風華麗浮動吐司（完全獨佔，徹底去除 Windows 原生醜陋方框）
ipcMain.handle('show-windows-notification', (_e, payload) => {
  const p = typeof payload === 'string' ? { title: payload } : (payload || {});
  showFancyToast({
    kicker: p.kicker || 'SHOYODO ARCHIVE DESK ・ 逸品新著收載',
    title: p.title || '《昭和拾一年 改訂 尋常小學算術》',
    price: p.price !== undefined ? p.price : 550,
    body: p.body,
    siteName: p.siteName || '日本の古本屋',
    eraYear: p.eraYear || '戦前資料 ≦1945',
    coverImage: p.coverImage,
    sealText: p.sealText || '収載',
    iconText: p.iconText || '古',
    actionHint: p.actionHint || '點擊開卷閱覽 ➔'
  });
  return true;
});

// IPC 實時爬蟲走查處理
let crawlInProgress = false;
ipcMain.handle('crawler-start-scan', async (_event, config) => {
  if (crawlInProgress) {
    return { success: false, busy: true, error: '上一輪巡行尚未結束，本次略過。', items: [] };
  }
  crawlInProgress = true;
  if (!crawlerInstance) {
    crawlerInstance = new BrowserCrawlerEngine({ headless: true });
  }

  const logSender = (level, message, site) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('crawler-log', {
        id: 'log-' + Math.random().toString(36).substring(2, 9),
        timestamp: Date.now(),
        level,
        site,
        message
      });
    }
  };

  const itemSender = (item) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('crawler-new-item', item);
    }
  };

  try {
    const items = await crawlerInstance.runFullCycle(config, logSender, itemSender);

    // 與已見記錄比對，只有真正首次出現的品項才算「新收載」
    const seenArr = loadSeenIds();
    const seenSet = new Set(seenArr);
    const freshItems = items.filter(it => !seenSet.has(it.id));
    freshItems.forEach(it => seenArr.push(it.id));
    if (freshItems.length > 0) saveSeenIds(seenArr);
    if (items.length > 0) {
      logSender('info', `本次新收載 ${freshItems.length} 件（其餘 ${items.length - freshItems.length} 件先前已收錄）`);
    }

    // 當巡行發現新逸品時，若使用者開啟通知設定，純發射華麗和風自繪浮動吐司
    if (freshItems.length > 0 && config && config.notifyOnNewFinds) {
      const first = freshItems[0];
      const siteNames = { kosho: '日本の古本屋', yahoo: 'Yahoo!拍賣', mercari: 'Mercari煤爐' };
      showFancyToast({
        kicker: 'SHOYODO ARCHIVE DESK ・ 逸品新著收載',
        title: first.title,
        price: first.price,
        siteName: siteNames[first.source] || '古物市場',
        eraYear: first.eraString || '戦前資料 ≦1945',
        coverImage: first.coverImage,
        url: first.externalUrl,
        sealText: '収載',
        iconText: '古',
        actionHint: '點擊開卷閱覽 ➔'
      });
    }

    return { success: true, count: items.length, newCount: freshItems.length, items };
  } catch (err) {
    logSender('warn', '走查過程發生異常：' + err.message);
    return { success: false, error: err.message, items: [] };
  } finally {
    crawlInProgress = false;
  }
});

// 共享資料橋樑 IPC 管理
ipcMain.handle('bridge-get-data', () => {
  return readSharedBridge();
});

ipcMain.handle('bridge-add-prospect', (_e, item) => {
  const data = readSharedBridge();
  const exists = data.prospects.some(p => p.id === item.id || (p.externalUrl && item.externalUrl && p.externalUrl === item.externalUrl));
  if (!exists) {
    data.prospects.unshift({ ...item, addedAt: Date.now() });
    writeSharedBridge(data);
  }
  return data;
});

ipcMain.handle('bridge-promote-to-book', (_e, book) => {
  const data = readSharedBridge();
  data.books.unshift({ ...book, receivedAt: Date.now() });
  data.prospects = data.prospects.filter(p => p.id !== book.id && p.title !== book.title);
  writeSharedBridge(data);
  return data;
});

ipcMain.handle('bridge-remove-prospect', (_e, prospectId) => {
  const data = readSharedBridge();
  data.prospects = data.prospects.filter(p => p.id !== prospectId);
  writeSharedBridge(data);
  return data;
});

// IPC 鑑札認證管理
ipcMain.handle('auth-get-session', () => {
  return getAdminSession();
});

ipcMain.handle('auth-save-session', (_e, session) => {
  saveAdminSession(session);
  return true;
});

ipcMain.handle('auth-clear-session', () => {
  clearAdminSession();
  return true;
});

ipcMain.handle('auth-open-web-login', () => {
  const loginUrl = 'https://kosho-gura.web.app/admin/desktop-auth?client=shoyodo-archive-desk&port=48123';
  shell.openExternal(loginUrl);
  return true;
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  startBridgeServer();
  // 每次開啟台帳都檢查更新；稍候數秒，避開開場動畫與冷啟動
  setTimeout(() => launchUpdater(), 6000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

// 當所有視窗被隱藏/關閉時，不退出應用程式，持續於系統匣背景常駐
app.on('window-all-closed', () => {
  // 保持背景常駐
});
