const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcherAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  openExternal: (url) => ipcRenderer.send('shell:openExternal', url),

  // Paths
  getPaths: () => ipcRenderer.invoke('get:paths'),

  // Auth
  login: () => ipcRenderer.invoke('auth:login'),
  loginOffline: (username) => ipcRenderer.invoke('auth:offline', username),
  logout: () => ipcRenderer.invoke('auth:logout'),
  getProfile: () => ipcRenderer.invoke('auth:getProfile'),

  // Launcher
  getVersions: () => ipcRenderer.invoke('mc:getVersions'),
  installVersion: (versionId, options) => ipcRenderer.invoke('mc:install', versionId, options),
  launch: (options) => ipcRenderer.invoke('mc:launch', options),
  killGame: () => ipcRenderer.invoke('mc:kill'),

  // Mod sync
  syncMods: (serverConfig) => ipcRenderer.invoke('mods:sync', serverConfig),
  getLocalMods: (instanceDir) => ipcRenderer.invoke('mods:getLocal', instanceDir),
  removeMod: (modPath) => ipcRenderer.invoke('mods:remove', modPath),

  // Settings & servers persistence
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  loadServers: () => ipcRenderer.invoke('servers:load'),
  saveServers: (servers) => ipcRenderer.invoke('servers:save', servers),
  fetchDistro: (url) => ipcRenderer.invoke('distro:fetch', url),

  // Directory selection
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  updateDataDir: (newPath) => ipcRenderer.invoke('settings:updateDataDir', newPath),

  // Skin management
  selectSkinFile: () => ipcRenderer.invoke('dialog:selectSkinFile'),
  uploadSkin: (filePath, variant) => ipcRenderer.invoke('skin:upload', { filePath, variant }),
  getSkinProfile: () => ipcRenderer.invoke('skin:getProfile'),

  // Instance management
  listInstances: () => ipcRenderer.invoke('instances:list'),
  createInstance: (opts) => ipcRenderer.invoke('instances:create', opts),
  deleteInstance: (id) => ipcRenderer.invoke('instances:delete', id),
  getInstanceContents: (instanceId, subfolder) =>
    ipcRenderer.invoke('instances:getContents', { instanceId, subfolder }),
  addInstanceFiles: (instanceId, subfolder) =>
    ipcRenderer.invoke('instances:addFiles', { instanceId, subfolder }),
  removeInstanceFile: (instanceId, subfolder, filename) =>
    ipcRenderer.invoke('instances:removeFile', { instanceId, subfolder, filename }),
  getLoaderVersions: (mcVersion, loader) =>
    ipcRenderer.invoke('instances:getLoaderVersions', { mcVersion, loader }),
  updateInstanceLastPlayed: (id) => ipcRenderer.invoke('instances:updateLastPlayed', id),
  createInstanceFromServer: (opts) => ipcRenderer.invoke('instances:createFromServer', opts),

  // Server ping
  pingServer: (address) => ipcRenderer.invoke('server:ping', address),

  // Game history
  saveGameSession: (session) => ipcRenderer.invoke('game-history:save', session),
  loadGameHistory: () => ipcRenderer.invoke('game-history:load'),
  deleteGameSession: (id) => ipcRenderer.invoke('game-history:delete', id),

  // GitHub mod upload
  selectModsForUpload: () => ipcRenderer.invoke('github:selectMods'),
  uploadModsToGithub: (opts) => ipcRenderer.invoke('github:upload', opts),
  testGithubToken: (token) => ipcRenderer.invoke('github:testToken', token),
  fetchGithubMods: (opts) => ipcRenderer.invoke('github:fetchMods', opts),
  deleteGithubMod: (opts) => ipcRenderer.invoke('github:deleteMod', opts),

  // Auto-updater
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  getAppVersion: () => ipcRenderer.invoke('update:getVersion'),

  // Events from main process
  onProgress: (callback) => ipcRenderer.on('progress', (_e, data) => callback(data)),
  onLog: (callback) => ipcRenderer.on('log', (_e, msg) => callback(msg)),
  onGameClose: (callback) => ipcRenderer.on('game:close', (_e) => callback()),
  onGameStart: (callback) => ipcRenderer.on('game:start', (_e) => callback()),

  // Update events
  onUpdateChecking: (callback) => ipcRenderer.on('update:checking', () => callback()),
  onUpdateAvailable: (callback) => ipcRenderer.on('update:available', (_e, info) => callback(info)),
  onUpdateNotAvailable: (callback) => ipcRenderer.on('update:not-available', (_e, info) => callback(info)),
  onUpdateProgress: (callback) => ipcRenderer.on('update:download-progress', (_e, progress) => callback(progress)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update:downloaded', (_e, info) => callback(info)),
  onUpdateError: (callback) => ipcRenderer.on('update:error', (_e, msg) => callback(msg))
});
