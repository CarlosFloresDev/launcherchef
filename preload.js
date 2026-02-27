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

  // Events from main process
  onProgress: (callback) => ipcRenderer.on('progress', (_e, data) => callback(data)),
  onLog: (callback) => ipcRenderer.on('log', (_e, msg) => callback(msg)),
  onGameClose: (callback) => ipcRenderer.on('game:close', (_e) => callback()),
  onGameStart: (callback) => ipcRenderer.on('game:start', (_e) => callback())
});
