// ============================================
// LauncherChef - Renderer (Frontend Logic)
// ============================================

const api = window.launcherAPI;

// ============================================
// State
// ============================================
let state = {
  loggedIn: false,
  profile: null,
  servers: [],
  selectedServer: null,
  playing: false,
  settings: {
    ramMin: 1024,
    ramMax: 4096,
    javaPath: '',
    distroUrl: ''
  }
};

// ============================================
// DOM References
// ============================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  // Titlebar
  btnMin: $('#btn-minimize'),
  btnMax: $('#btn-maximize'),
  btnClose: $('#btn-close'),
  // Auth
  userAvatar: $('#user-avatar'),
  username: $('#username'),
  btnAuth: $('#btn-auth'),
  btnOffline: $('#btn-offline'),
  offlineModal: $('#offline-modal'),
  offlineUsername: $('#offline-username'),
  offlineCancel: $('#offline-cancel'),
  offlineConfirm: $('#offline-confirm'),
  // Navigation
  navItems: $$('.nav-item'),
  sections: $$('.section'),
  // Servers
  serverList: $('#server-list'),
  serverDetail: $('#server-detail'),
  detailName: $('#detail-server-name'),
  detailVersion: $('#detail-mc-version'),
  detailLoader: $('#detail-mod-loader'),
  detailModCount: $('#detail-mod-count'),
  detailAddress: $('#detail-address'),
  detailModList: $('#detail-mod-list'),
  btnBack: $('#btn-back-servers'),
  btnPlay: $('#btn-play'),
  progressContainer: $('#progress-container'),
  progressFill: $('#progress-fill'),
  progressText: $('#progress-text'),
  // Mods
  modsServerLabel: $('#mods-server-label'),
  btnSyncMods: $('#btn-sync-mods'),
  modGrid: $('#mod-grid'),
  // Settings
  ramMin: $('#ram-min'),
  ramMax: $('#ram-max'),
  javaPath: $('#java-path'),
  distroUrl: $('#distro-url'),
  dataPathDisplay: $('#data-path-display'),
  btnLoadDistro: $('#btn-load-distro'),
  btnSaveSettings: $('#btn-save-settings'),
  // Log
  logConsole: $('#log-console'),
  logBody: $('#log-body'),
  logToggle: $('#log-toggle'),
  btnShowLog: $('#btn-show-log')
};

// ============================================
// Initialization
// ============================================
async function init() {
  setupWindowControls();
  setupNavigation();
  setupLogConsole();
  await loadPaths();
  await loadSettings();
  await checkAuth();
  await loadServers();
  setupServerEvents();
  setupModEvents();
  setupSettingsEvents();
  setupProgressEvents();
}

// ============================================
// Window Controls
// ============================================
function setupWindowControls() {
  dom.btnMin.addEventListener('click', () => api.minimize());
  dom.btnMax.addEventListener('click', () => api.maximize());
  dom.btnClose.addEventListener('click', () => api.close());
}

// ============================================
// Navigation
// ============================================
function setupNavigation() {
  dom.navItems.forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      dom.navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      dom.sections.forEach(s => s.classList.remove('active'));
      $(`#section-${section}`).classList.add('active');

      // Refresh mod list when switching to mods tab
      if (section === 'mods' && state.selectedServer) {
        refreshModList();
      }
    });
  });
}

// ============================================
// Log Console
// ============================================
function setupLogConsole() {
  dom.btnShowLog.addEventListener('click', () => {
    dom.logConsole.style.display = dom.logConsole.style.display === 'none' ? 'flex' : 'none';
  });
  dom.logToggle.addEventListener('click', () => {
    dom.logConsole.style.display = 'none';
  });

  api.onLog((msg) => {
    addLog(msg);
  });
}

function addLog(msg, type = '') {
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = msg;
  dom.logBody.appendChild(line);
  dom.logBody.scrollTop = dom.logBody.scrollHeight;
}

// ============================================
// Paths & Settings
// ============================================
let appPaths = {};

async function loadPaths() {
  appPaths = await api.getPaths();
  dom.dataPathDisplay.textContent = appPaths.data || '-';
}

async function loadSettings() {
  try {
    state.settings = await api.loadSettings();
  } catch {
    // Use defaults
  }

  // Apply to UI
  dom.ramMin.value = state.settings.ramMin || 1024;
  dom.ramMax.value = state.settings.ramMax || 4096;
  dom.javaPath.value = state.settings.javaPath || '';
  dom.distroUrl.value = state.settings.distroUrl || '';
}

// ============================================
// Authentication
// ============================================
async function checkAuth() {
  try {
    const result = await api.getProfile();
    if (result.loggedIn && result.profile) {
      setLoggedIn(result.profile);
    }
  } catch {
    // Not logged in
  }
}

function setLoggedIn(profile) {
  state.loggedIn = true;
  state.profile = profile;
  dom.username.textContent = profile.name;

  const isPremium = profile.premium !== false;
  const tag = isPremium ? '(Premium)' : '(No Premium)';
  dom.username.textContent = profile.name;

  // Replace both buttons with a single logout button
  dom.btnAuth.textContent = 'Cerrar Sesion';
  dom.btnAuth.classList.add('logout');
  dom.btnOffline.style.display = 'none';

  // Set avatar
  if (isPremium && profile.id && !profile.id.includes('-')) {
    // Premium: use real skin
    dom.userAvatar.innerHTML = `<img src="https://mc-heads.net/avatar/${profile.id}/40" alt="skin">`;
  } else {
    // Offline: just show initial
    dom.userAvatar.innerHTML = '';
    dom.userAvatar.textContent = profile.name.charAt(0).toUpperCase();
  }

  updatePlayButton();
  const mode = isPremium ? 'Premium' : 'No Premium';
  addLog(`[Auth] Sesion iniciada como: ${profile.name} (${mode})`, 'success');
}

function setLoggedOut() {
  state.loggedIn = false;
  state.profile = null;
  dom.username.textContent = 'No conectado';
  dom.btnAuth.textContent = 'Premium';
  dom.btnAuth.classList.remove('logout');
  dom.btnOffline.style.display = '';
  dom.userAvatar.innerHTML = '?';
  updatePlayButton();
  addLog('[Auth] Sesion cerrada');
}

// Premium login
dom.btnAuth.addEventListener('click', async () => {
  if (state.loggedIn) {
    await api.logout();
    setLoggedOut();
  } else {
    dom.btnAuth.textContent = 'Conectando...';
    dom.btnAuth.disabled = true;
    const result = await api.login();
    dom.btnAuth.disabled = false;
    if (result.success) {
      setLoggedIn(result.profile);
    } else {
      dom.btnAuth.textContent = 'Premium';
      addLog(`[Auth] Error: ${result.error}`, 'error');
    }
  }
});

// Non-premium (offline) login
dom.btnOffline.addEventListener('click', () => {
  dom.offlineModal.style.display = 'flex';
  dom.offlineUsername.value = '';
  dom.offlineUsername.focus();
});

dom.offlineCancel.addEventListener('click', () => {
  dom.offlineModal.style.display = 'none';
});

dom.offlineConfirm.addEventListener('click', async () => {
  const username = dom.offlineUsername.value.trim();
  if (!username) return;

  dom.offlineConfirm.textContent = 'Entrando...';
  dom.offlineConfirm.disabled = true;
  const result = await api.loginOffline(username);
  dom.offlineConfirm.textContent = 'Entrar';
  dom.offlineConfirm.disabled = false;

  if (result.success) {
    dom.offlineModal.style.display = 'none';
    setLoggedIn(result.profile);
  } else {
    addLog(`[Auth] Error: ${result.error}`, 'error');
  }
});

// Allow pressing Enter in the username field
dom.offlineUsername.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') dom.offlineConfirm.click();
  if (e.key === 'Escape') dom.offlineCancel.click();
});

// ============================================
// Servers
// ============================================
async function loadServers() {
  // First load cached servers from local storage
  let cachedServers = [];
  try {
    cachedServers = await api.loadServers();
  } catch { /* ignore */ }

  // Auto-fetch latest distribution from remote URL
  const distroUrl = state.settings.distroUrl;
  if (distroUrl) {
    try {
      addLog('[Distro] Actualizando lista de servidores...');
      const distro = await api.fetchDistro(distroUrl);
      if (distro && distro.servers && distro.servers.length > 0) {
        state.servers = distro.servers;
        await api.saveServers(distro.servers);
        addLog(`[Distro] Lista actualizada: ${distro.servers.length} servidores, ${distro.servers.reduce((sum, s) => sum + s.mods.length, 0)} mods totales`, 'success');
        renderServerList();
        return;
      }
    } catch (err) {
      addLog(`[Distro] No se pudo actualizar (usando cache local): ${err.message}`, 'warn');
    }
  }

  // Fallback to cached servers
  if (cachedServers && cachedServers.length > 0) {
    state.servers = cachedServers;
  } else {
    state.servers = getExampleServers();
  }

  renderServerList();
}

function getExampleServers() {
  return [
    {
      id: 'survival-chef',
      name: 'Survival Chef',
      description: 'Servidor survival con mods de optimizacion y calidad de vida. Ideal para empezar.',
      address: 'play.launcherchef.com:25565',
      minecraft_version: '1.20.4',
      mod_loader: 'fabric',
      mod_loader_version: '0.15.6',
      icon: '🍖',
      status: 'online',
      mods: [
        { name: 'Sodium', filename: 'sodium-fabric-0.5.8+mc1.20.4.jar', url: '', sha256: '', required: true },
        { name: 'Lithium', filename: 'lithium-fabric-0.12.1+mc1.20.4.jar', url: '', sha256: '', required: true },
        { name: 'Iris Shaders', filename: 'iris-1.6.11+mc1.20.4.jar', url: '', sha256: '', required: false },
        { name: 'Fabric API', filename: 'fabric-api-0.96.4+1.20.4.jar', url: '', sha256: '', required: true }
      ]
    },
    {
      id: 'modded-kitchen',
      name: 'Modded Kitchen',
      description: 'Servidor con mods de tecnologia y magia. Create, Botania, y mas.',
      address: 'modded.launcherchef.com:25565',
      minecraft_version: '1.20.1',
      mod_loader: 'forge',
      mod_loader_version: '47.2.0',
      icon: '🔧',
      status: 'online',
      mods: [
        { name: 'Create', filename: 'create-1.20.1-0.5.1f.jar', url: '', sha256: '', required: true },
        { name: 'Botania', filename: 'Botania-1.20.1-444.jar', url: '', sha256: '', required: true },
        { name: 'JEI', filename: 'jei-1.20.1-forge-15.3.0.4.jar', url: '', sha256: '', required: true },
        { name: 'Applied Energistics 2', filename: 'appliedenergistics2-forge-15.2.1.jar', url: '', sha256: '', required: true },
        { name: 'Journeymap', filename: 'journeymap-1.20.1-5.9.18-forge.jar', url: '', sha256: '', required: false }
      ]
    },
    {
      id: 'pvp-arena',
      name: 'PvP Arena',
      description: 'Servidor competitivo con mods de combate mejorado.',
      address: 'pvp.launcherchef.com:25565',
      minecraft_version: '1.20.4',
      mod_loader: 'fabric',
      mod_loader_version: '0.15.6',
      icon: '⚔️',
      status: 'offline',
      mods: [
        { name: 'Sodium', filename: 'sodium-fabric-0.5.8+mc1.20.4.jar', url: '', sha256: '', required: true },
        { name: 'Better Combat', filename: 'bettercombat-fabric-1.8.4+1.20.4.jar', url: '', sha256: '', required: true }
      ]
    }
  ];
}

function renderServerList() {
  dom.serverList.innerHTML = '';
  state.servers.forEach(server => {
    const card = document.createElement('div');
    card.className = 'server-card';
    card.dataset.serverId = server.id;
    card.innerHTML = `
      <div class="server-status ${server.status === 'online' ? '' : 'offline'}"></div>
      <div class="server-name">${server.icon || '🖥️'} ${server.name}</div>
      <span class="server-version">${server.minecraft_version} - ${server.mod_loader}</span>
      <p class="server-description">${server.description}</p>
      <div class="server-meta">
        <span>📦 ${server.mods.length} mods</span>
        <span>📡 ${server.address}</span>
      </div>
    `;
    card.addEventListener('click', () => selectServer(server));
    dom.serverList.appendChild(card);
  });
}

async function selectServer(server) {
  state.selectedServer = server;

  // Show detail view
  dom.serverList.style.display = 'none';
  dom.serverDetail.style.display = 'block';

  // Fill detail
  dom.detailName.textContent = `${server.icon || ''} ${server.name}`;
  dom.detailVersion.textContent = server.minecraft_version;
  dom.detailLoader.textContent = `${server.mod_loader} ${server.mod_loader_version}`;
  dom.detailModCount.textContent = server.mods.length;
  dom.detailAddress.textContent = server.address;

  // Get locally installed mods to check status
  let localMods = [];
  try {
    localMods = await api.getLocalMods(server.id);
  } catch { /* no mods yet */ }
  const localFilenames = new Set(localMods.map(m => m.filename));

  // Mod list with real status
  dom.detailModList.innerHTML = '<h4>Mods del servidor</h4>';
  let installedCount = 0;
  server.mods.forEach(mod => {
    const isInstalled = localFilenames.has(mod.filename);
    if (isInstalled) installedCount++;
    const statusClass = isInstalled ? 'installed' : 'pending';
    const statusText = isInstalled ? '✓ Instalado' : 'Pendiente';

    const item = document.createElement('div');
    item.className = 'mod-item';
    item.innerHTML = `
      <span class="mod-item-name">${mod.name}</span>
      <span class="mod-item-version">${mod.filename}</span>
      <span class="mod-item-status ${statusClass}">${statusText}</span>
    `;
    dom.detailModList.appendChild(item);
  });

  // Show summary
  const summary = document.createElement('div');
  summary.className = 'mod-summary';
  summary.innerHTML = `<span>${installedCount}/${server.mods.length} mods instalados</span>`;
  dom.detailModList.insertBefore(summary, dom.detailModList.children[1]);

  // Update mods section
  dom.modsServerLabel.textContent = `Servidor: ${server.name}`;
  dom.btnSyncMods.disabled = false;

  updatePlayButton();
  addLog(`[Server] Seleccionado: ${server.name} (${installedCount}/${server.mods.length} mods instalados)`);
}

function setupServerEvents() {
  dom.btnBack.addEventListener('click', () => {
    dom.serverList.style.display = 'grid';
    dom.serverDetail.style.display = 'none';
  });
}

// ============================================
// Play Button
// ============================================
function updatePlayButton() {
  const canPlay = state.selectedServer !== null;
  dom.btnPlay.disabled = !canPlay || state.playing;

  if (state.playing) {
    dom.btnPlay.innerHTML = '<span class="play-icon">🎮</span> JUGANDO...';
    dom.btnPlay.classList.add('playing');
  } else {
    dom.btnPlay.innerHTML = '<span class="play-icon">▶</span> JUGAR';
    dom.btnPlay.classList.remove('playing');
  }
}

dom.btnPlay.addEventListener('click', async () => {
  if (!state.selectedServer || state.playing) return;

  const server = state.selectedServer;
  state.playing = true;
  updatePlayButton();

  // Show progress
  dom.progressContainer.style.display = 'block';
  dom.progressText.textContent = 'Sincronizando mods...';
  dom.progressFill.style.width = '0%';

  // Step 1: Sync mods and configs
  addLog(`[Launch] Sincronizando mods y configs para ${server.name}...`);
  const syncResult = await api.syncMods({
    id: server.id,
    mods: server.mods,
    configsUrl: server.configsUrl || null
  });

  if (!syncResult.success) {
    addLog(`[Launch] Error sincronizando mods: ${syncResult.error}`, 'error');
  }

  // Refresh mod status display after sync
  await refreshServerModStatus();

  // Step 2: Launch Minecraft
  dom.progressText.textContent = 'Lanzando Minecraft...';
  dom.progressFill.style.width = '50%';

  const launchResult = await api.launch({
    version: server.minecraft_version,
    serverId: server.id,
    serverAddress: server.address,
    modLoader: server.mod_loader,
    modLoaderVersion: server.mod_loader_version,
    username: state.profile?.name || 'Player'
  });

  if (!launchResult.success) {
    addLog(`[Launch] Error: ${launchResult.error}`, 'error');
    state.playing = false;
    updatePlayButton();
    dom.progressContainer.style.display = 'none';
  }
});

// ============================================
// Progress Events
// ============================================
function setupProgressEvents() {
  api.onProgress((data) => {
    dom.progressContainer.style.display = 'block';

    if (data.total && data.total > 0) {
      const current = data.current || data.task || 0;
      const pct = Math.min(100, Math.round((current / data.total) * 100));
      dom.progressFill.style.width = `${pct}%`;
      dom.progressText.textContent = data.name
        ? `${data.type}: ${data.name} (${current}/${data.total})`
        : `${data.type}: ${current}/${data.total}`;
    }
  });

  api.onGameClose(() => {
    state.playing = false;
    updatePlayButton();
    dom.progressContainer.style.display = 'none';
    dom.progressText.textContent = '';
    addLog('[LauncherChef] Minecraft se ha cerrado', 'warn');
  });

  api.onGameStart(() => {
    dom.progressText.textContent = 'Minecraft esta corriendo...';
    dom.progressFill.style.width = '100%';
  });
}

// ============================================
// Mods Management
// ============================================
function setupModEvents() {
  dom.btnSyncMods.addEventListener('click', async () => {
    if (!state.selectedServer) return;

    dom.btnSyncMods.disabled = true;
    dom.btnSyncMods.textContent = '⏳ Sincronizando...';

    const result = await api.syncMods({
      id: state.selectedServer.id,
      mods: state.selectedServer.mods,
      configsUrl: state.selectedServer.configsUrl || null
    });

    dom.btnSyncMods.disabled = false;
    dom.btnSyncMods.textContent = '🔄 Sincronizar';

    if (result.success) {
      addLog('[Mods] Sincronizacion completada', 'success');
    } else {
      addLog(`[Mods] Error: ${result.error}`, 'error');
    }

    refreshModList();
    refreshServerModStatus();
  });
}

/**
 * Refresh the mod status badges in the server detail view
 */
async function refreshServerModStatus() {
  if (!state.selectedServer) return;

  let localMods = [];
  try {
    localMods = await api.getLocalMods(state.selectedServer.id);
  } catch { return; }

  const localFilenames = new Set(localMods.map(m => m.filename));
  let installedCount = 0;

  // Update each mod item status
  const modItems = dom.detailModList.querySelectorAll('.mod-item');
  modItems.forEach((item, index) => {
    if (index < state.selectedServer.mods.length) {
      const mod = state.selectedServer.mods[index];
      const isInstalled = localFilenames.has(mod.filename);
      if (isInstalled) installedCount++;

      const statusEl = item.querySelector('.mod-item-status');
      if (statusEl) {
        statusEl.className = `mod-item-status ${isInstalled ? 'installed' : 'pending'}`;
        statusEl.textContent = isInstalled ? '✓ Instalado' : 'Pendiente';
      }
    }
  });

  // Update summary
  const summaryEl = dom.detailModList.querySelector('.mod-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `<span>${installedCount}/${state.selectedServer.mods.length} mods instalados</span>`;
  }
}

async function refreshModList() {
  if (!state.selectedServer) {
    dom.modGrid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📦</span>
        <p>Selecciona un servidor primero para ver sus mods</p>
      </div>`;
    return;
  }

  const localMods = await api.getLocalMods(state.selectedServer.id);
  dom.modGrid.innerHTML = '';

  if (localMods.length === 0) {
    dom.modGrid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📦</span>
        <p>No hay mods instalados. Presiona "Sincronizar" para descargarlos.</p>
      </div>`;
    return;
  }

  localMods.forEach(mod => {
    const card = document.createElement('div');
    card.className = 'mod-card';
    const sizeMB = (mod.size / (1024 * 1024)).toFixed(1);
    card.innerHTML = `
      <div class="mod-card-header">
        <span class="mod-card-name">${mod.filename.replace('.jar', '')}</span>
        <span class="mod-card-version">${sizeMB} MB</span>
      </div>
      <span class="mod-card-file">${mod.filename}</span>
    `;
    dom.modGrid.appendChild(card);
  });
}

// ============================================
// Settings
// ============================================
function setupSettingsEvents() {
  dom.btnSaveSettings.addEventListener('click', async () => {
    state.settings = {
      ramMin: parseInt(dom.ramMin.value) || 1024,
      ramMax: parseInt(dom.ramMax.value) || 4096,
      javaPath: dom.javaPath.value.trim(),
      distroUrl: dom.distroUrl.value.trim()
    };

    const result = await api.saveSettings(state.settings);
    if (result.success) {
      addLog('[Settings] Ajustes guardados', 'success');
      dom.btnSaveSettings.textContent = '✓ Guardado';
    } else {
      addLog(`[Settings] Error: ${result.error}`, 'error');
      dom.btnSaveSettings.textContent = '✗ Error';
    }
    setTimeout(() => {
      dom.btnSaveSettings.textContent = 'Guardar Ajustes';
    }, 2000);
  });

  dom.btnLoadDistro.addEventListener('click', async () => {
    const url = dom.distroUrl.value.trim();
    if (!url) {
      addLog('[Distro] Introduce una URL de manifiesto', 'warn');
      return;
    }

    dom.btnLoadDistro.textContent = 'Cargando...';
    dom.btnLoadDistro.disabled = true;

    try {
      const distro = await api.fetchDistro(url);
      if (distro && distro.servers && distro.servers.length > 0) {
        state.servers = distro.servers;
        await api.saveServers(distro.servers);
        renderServerList();
        addLog(`[Distro] Cargados ${distro.servers.length} servidores desde el manifiesto`, 'success');
      } else {
        addLog('[Distro] El manifiesto no contiene servidores validos', 'warn');
      }
    } catch (err) {
      addLog(`[Distro] Error: ${err.message}`, 'error');
    }

    dom.btnLoadDistro.textContent = 'Cargar';
    dom.btnLoadDistro.disabled = false;
  });
}

// ============================================
// Start the app
// ============================================
document.addEventListener('DOMContentLoaded', init);
