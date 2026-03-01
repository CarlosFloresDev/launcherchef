const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
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
const DEFAULT_DATA_DIR = path.join(USER_DATA, 'minecraft_data');
const CONFIG_DIR = path.join(USER_DATA, 'config');

// Bundled config (read-only, inside asar when packaged)
const BUNDLED_CONFIG_DIR = path.join(ROOT_DIR, 'config');

// Ensure config directory exists first (needed to read settings)
if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

// Read custom data directory from settings (if configured)
function getCustomDataDir() {
  try {
    const settingsFile = path.join(CONFIG_DIR, 'settings.json');
    if (fs.existsSync(settingsFile)) {
      const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
      if (settings.dataDir && fs.existsSync(settings.dataDir)) {
        return settings.dataDir;
      }
    }
  } catch { /* ignore */ }
  return null;
}

// DATA_DIR: use custom path if set, otherwise default
let DATA_DIR = getCustomDataDir() || DEFAULT_DATA_DIR;

// Function to get current DATA_DIR (used by handlers)
function getDataDir() {
  return DATA_DIR;
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

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
  data: getDataDir(),
  defaultData: DEFAULT_DATA_DIR,
  config: CONFIG_DIR
}));

// Directory picker dialog
ipcMain.handle('dialog:selectDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar carpeta de instalacion',
    defaultPath: getDataDir(),
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Update DATA_DIR at runtime (after user saves new path)
ipcMain.handle('settings:updateDataDir', (_e, newPath) => {
  if (newPath && typeof newPath === 'string') {
    try {
      if (!fs.existsSync(newPath)) fs.mkdirSync(newPath, { recursive: true });
      DATA_DIR = newPath;
      return { success: true, path: DATA_DIR };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  // Reset to default
  DATA_DIR = DEFAULT_DATA_DIR;
  return { success: true, path: DATA_DIR };
});

// Auth module - pass CONFIG_DIR so it saves auth.json in the right place
require('./src/lib/authHandler')(ipcMain, CONFIG_DIR);

// Launcher module - pass getDataDir function for dynamic path
require('./src/lib/launchHandler')(ipcMain, getDataDir, CONFIG_DIR);

// Mod sync module - pass getDataDir function for dynamic path
require('./src/lib/modSyncHandler')(ipcMain, getDataDir);

// Instance manager module
require('./src/lib/instanceHandler')(ipcMain, getDataDir, CONFIG_DIR);

// GitHub mod upload module
require('./src/lib/githubHandler')(ipcMain, getDataDir, CONFIG_DIR);

// Server ping module (Minecraft SLP protocol)
require('./src/lib/serverPingHandler')(ipcMain);

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
  return { ramMin: 1024, ramMax: 6144, javaPath: '', dataDir: '', distroUrl: 'https://raw.githubusercontent.com/CarlosFloresDev/tortillaland-mods/main/distribution.json' };
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

// ============================================
// Skin Management
// ============================================

// Select a skin file (.png) via native dialog
ipcMain.handle('dialog:selectSkinFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Seleccionar skin de Minecraft',
    filters: [{ name: 'Imagenes PNG', extensions: ['png'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Refresh the Minecraft access token using MSMC
async function refreshMcToken() {
  const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json');
  if (!fs.existsSync(AUTH_FILE)) return null;

  const authData = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
  if (!authData.refreshToken) return authData.mcToken || null;

  try {
    const { Auth } = require('msmc');
    const auth = new Auth('none');
    const xbox = await auth.refresh(authData.refreshToken);
    const mc = await xbox.getMinecraft();

    // Update saved tokens
    authData.mcToken = mc.mcToken;
    authData.refreshToken = mc.refreshTkn || authData.refreshToken;
    fs.writeFileSync(AUTH_FILE, JSON.stringify(authData, null, 2));

    console.log('[Skin] Token refrescado exitosamente');
    return mc.mcToken;
  } catch (err) {
    console.log('[Skin] Error refrescando token:', err.message);
    return authData.mcToken || null;
  }
}

// Upload skin to Mojang API (Premium only)
ipcMain.handle('skin:upload', async (_e, { filePath, variant }) => {
  try {
    // Read auth data
    const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json');
    if (!fs.existsSync(AUTH_FILE)) {
      return { success: false, error: 'No hay sesion activa' };
    }
    const authData = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    if (!authData.mcToken) {
      return { success: false, error: 'Solo cuentas Premium pueden cambiar su skin' };
    }

    // Refresh token before uploading
    const freshToken = await refreshMcToken();
    if (!freshToken) {
      return { success: false, error: 'No se pudo refrescar el token. Vuelve a iniciar sesion.' };
    }

    // Read the skin file
    const skinData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    // Build multipart form data
    const boundary = '----LauncherChefBoundary' + Date.now();
    const CRLF = '\r\n';

    let body = '';
    body += `--${boundary}${CRLF}`;
    body += `Content-Disposition: form-data; name="variant"${CRLF}${CRLF}`;
    body += `${variant || 'classic'}${CRLF}`;
    body += `--${boundary}${CRLF}`;
    body += `Content-Disposition: form-data; name="file"; filename="${fileName}"${CRLF}`;
    body += `Content-Type: image/png${CRLF}${CRLF}`;

    const bodyStart = Buffer.from(body, 'utf-8');
    const bodyEnd = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf-8');
    const fullBody = Buffer.concat([bodyStart, skinData, bodyEnd]);

    const https = require('https');
    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'api.minecraftservices.com',
        path: '/minecraft/profile/skins',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${freshToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': fullBody.length
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log(`[Skin] API response: ${res.statusCode} - ${data.substring(0, 200)}`);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            // Parse response to get the new skin texture URL
            let skinTextureUrl = null;
            try {
              const respJson = JSON.parse(data);
              if (respJson.skins && respJson.skins.length > 0) {
                skinTextureUrl = respJson.skins[0].url;
              }
            } catch { /* ignore parse error */ }
            resolve({ success: true, skinUrl: skinTextureUrl });
          } else if (res.statusCode === 401) {
            resolve({ success: false, error: 'Token expirado. Cierra sesion y vuelve a iniciar.' });
          } else {
            resolve({ success: false, error: `Error ${res.statusCode}: ${data.substring(0, 100)}` });
          }
        });
      });
      req.on('error', (err) => resolve({ success: false, error: err.message }));
      req.write(fullBody);
      req.end();
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Get skin profile info
ipcMain.handle('skin:getProfile', async () => {
  try {
    const SETTINGS_AUTH = path.join(CONFIG_DIR, 'auth.json');
    if (!fs.existsSync(SETTINGS_AUTH)) return { success: false };
    const authData = JSON.parse(fs.readFileSync(SETTINGS_AUTH, 'utf-8'));
    return {
      success: true,
      uuid: authData.uuid || authData.profile?.id || '',
      name: authData.name || authData.profile?.name || '',
      premium: !!authData.mcToken
    };
  } catch {
    return { success: false };
  }
});

// ============================================
// Auto-Updater (electron-updater)
// ============================================
const { autoUpdater } = require('electron-updater');

function setupAutoUpdater() {
  // Configurar: no descargar automaticamente, el usuario decide
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Eventos del auto-updater -> enviar al renderer
  autoUpdater.on('checking-for-update', () => {
    if (mainWindow) mainWindow.webContents.send('update:checking');
  });

  autoUpdater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes || ''
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update:not-available', {
      version: info.version
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) mainWindow.webContents.send('update:download-progress', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) mainWindow.webContents.send('update:downloaded', {
      version: info.version
    });
  });

  autoUpdater.on('error', (err) => {
    if (mainWindow) mainWindow.webContents.send('update:error', err.message || 'Error desconocido');
  });

  // Verificar actualizaciones al iniciar (solo en produccion)
  if (!IS_DEV) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 3000);
  }
}

// IPC handlers para el auto-updater
ipcMain.handle('update:check', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, version: result?.updateInfo?.version };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('update:download', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('update:getVersion', () => {
  return app.getVersion();
});

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
