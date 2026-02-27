const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// ============================================
// Paths - use userData for packaged builds
// ============================================
const IS_DEV = !app.isPackaged;
const ROOT_DIR = __dirname;

// When packaged: AppData/Roaming/LauncherChef
// When dev: ./minecraft_data and ./config
const USER_DATA = IS_DEV ? ROOT_DIR : app.getPath('userData');
const DATA_DIR = path.join(USER_DATA, 'minecraft_data');
const CONFIG_DIR = path.join(USER_DATA, 'config');

// Bundled config (read-only, inside asar when packaged)
const BUNDLED_CONFIG_DIR = path.join(ROOT_DIR, 'config');

// Ensure directories exist
[DATA_DIR, CONFIG_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Copy default config files if they don't exist yet in user config
function ensureDefaultConfigs() {
  const defaults = ['settings.json', 'servers.json'];
  for (const file of defaults) {
    const userFile = path.join(CONFIG_DIR, file);
    const bundledFile = path.join(BUNDLED_CONFIG_DIR, file);

    if (!fs.existsSync(userFile) && fs.existsSync(bundledFile)) {
      try {
        fs.copyFileSync(bundledFile, userFile);
        console.log(`[Config] Copiado default: ${file}`);
      } catch (err) {
        console.error(`[Config] Error copiando ${file}:`, err.message);
      }
    }
  }
}
ensureDefaultConfigs();

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    resizable: true,
    webPreferences: {
      preload: path.join(ROOT_DIR, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(ROOT_DIR, 'src', 'pages', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

// Window controls via IPC
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow?.close());
ipcMain.on('shell:openExternal', (_e, url) => shell.openExternal(url));

// Expose paths to renderer
ipcMain.handle('get:paths', () => ({
  root: ROOT_DIR,
  data: DATA_DIR,
  config: CONFIG_DIR
}));

// Auth module - pass CONFIG_DIR so it saves auth.json in the right place
require('./src/lib/authHandler')(ipcMain, CONFIG_DIR);

// Launcher module
require('./src/lib/launchHandler')(ipcMain, DATA_DIR, CONFIG_DIR);

// Mod sync module
require('./src/lib/modSyncHandler')(ipcMain, DATA_DIR);

// Settings persistence
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
const SERVERS_FILE = path.join(CONFIG_DIR, 'servers.json');

ipcMain.handle('settings:save', (_e, settings) => {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('settings:load', () => {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { ramMin: 1024, ramMax: 6144, javaPath: '', distroUrl: 'https://raw.githubusercontent.com/CarlosFloresDev/tortillaland-mods/main/distribution.json' };
});

ipcMain.handle('servers:load', () => {
  try {
    if (fs.existsSync(SERVERS_FILE)) {
      return JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return [];
});

ipcMain.handle('servers:save', (_e, servers) => {
  try {
    fs.writeFileSync(SERVERS_FILE, JSON.stringify(servers, null, 2));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Fetch remote distribution manifest
function fetchUrl(url) {
  const proto = url.startsWith('https') ? require('https') : require('http');
  return new Promise((resolve, reject) => {
    proto.get(url, { headers: { 'User-Agent': 'LauncherChef/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('JSON invalido'));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

ipcMain.handle('distro:fetch', async (_e, url) => {
  return fetchUrl(url);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
