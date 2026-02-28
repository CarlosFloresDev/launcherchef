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
  instances: [],
  selectedInstance: null,
  instanceTab: 'mods',
  uploadFiles: [],
  manageMods: [],
  manageFileSha: null,
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
  // Skins
  skinContainer: $('#skin-container'),
  skinPreview: $('#skin-preview'),
  skinBody: $('#skin-body'),
  skinPlaceholder: $('#skin-placeholder'),
  skinPlayerName: $('#skin-player-name'),
  skinUuid: $('#skin-uuid'),
  skinActions: $('#skin-actions'),
  skinOfflineMsg: $('#skin-offline-msg'),
  btnUploadSkin: $('#btn-upload-skin'),
  variantClassic: $('#variant-classic'),
  variantSlim: $('#variant-slim'),
  // Instances
  instanceList: $('#instance-list'),
  instanceToolbar: $('#instance-toolbar'),
  btnCreateInstance: $('#btn-create-instance'),
  instanceCreateForm: $('#instance-create-form'),
  btnBackInstanceCreate: $('#btn-back-instance-create'),
  instanceName: $('#instance-name'),
  instanceIconPicker: $('#instance-icon-picker'),
  instanceMcVersion: $('#instance-mc-version'),
  instanceLoader: $('#instance-loader'),
  instanceLoaderVersion: $('#instance-loader-version'),
  loaderVersionRow: $('#loader-version-row'),
  btnCreateInstanceConfirm: $('#btn-create-instance-confirm'),
  instanceDetail: $('#instance-detail'),
  btnBackInstanceList: $('#btn-back-instance-list'),
  instanceDetailName: $('#instance-detail-name'),
  instanceDetailVersion: $('#instance-detail-version'),
  instanceDetailLoader: $('#instance-detail-loader'),
  instanceDetailCreated: $('#instance-detail-created'),
  instanceTabs: $$('.instance-tab'),
  instanceFileCount: $('#instance-file-count'),
  btnAddInstanceFiles: $('#btn-add-instance-files'),
  instanceFileList: $('#instance-file-list'),
  btnInstancePlay: $('#btn-instance-play'),
  btnCloseGame: $('#btn-close-game'),
  btnDeleteInstance: $('#btn-delete-instance'),
  instanceProgress: $('#instance-progress'),
  instanceProgressFill: $('#instance-progress-fill'),
  instanceProgressText: $('#instance-progress-text'),
  // Mod Manager
  btnShowModManager: $('#btn-show-mod-manager'),
  githubModManager: $('#github-mod-manager'),
  btnBackModManager: $('#btn-back-mod-manager'),
  manageServerSelect: $('#manage-server-select'),
  btnFetchGithubMods: $('#btn-fetch-github-mods'),
  manageModsListContainer: $('#manage-mods-list-container'),
  manageModsTitle: $('#manage-mods-title'),
  manageModCount: $('#manage-mod-count'),
  manageModList: $('#manage-mod-list'),
  manageProgress: $('#manage-progress'),
  manageProgressFill: $('#manage-progress-fill'),
  manageProgressText: $('#manage-progress-text'),
  // GitHub Upload
  serverUploadToolbar: $('#server-upload-toolbar'),
  btnShowGithubUpload: $('#btn-show-github-upload'),
  githubUploadPanel: $('#github-upload-panel'),
  btnBackUpload: $('#btn-back-upload'),
  uploadServerSelect: $('#upload-server-select'),
  uploadFileCount: $('#upload-file-count'),
  btnSelectJars: $('#btn-select-jars'),
  uploadFileList: $('#upload-file-list'),
  uploadProgress: $('#upload-progress'),
  uploadProgressFill: $('#upload-progress-fill'),
  uploadProgressText: $('#upload-progress-text'),
  btnUploadGithub: $('#btn-upload-github'),
  // Settings
  ramMin: $('#ram-min'),
  ramMax: $('#ram-max'),
  javaPath: $('#java-path'),
  distroUrl: $('#distro-url'),
  githubToken: $('#github-token'),
  githubOwner: $('#github-owner'),
  githubRepo: $('#github-repo'),
  githubTag: $('#github-tag'),
  btnTestGithubToken: $('#btn-test-github-token'),
  dataPathDisplay: $('#data-path-display'),
  btnChangePath: $('#btn-change-path'),
  btnResetPath: $('#btn-reset-path'),
  btnLoadDistro: $('#btn-load-distro'),
  btnSaveSettings: $('#btn-save-settings'),
  // Log
  logConsole: $('#log-console'),
  logBody: $('#log-body'),
  logToggle: $('#log-toggle'),
  btnShowLog: $('#btn-show-log'),
  // Auto-update
  updateBar: $('#update-bar'),
  updateBarText: $('#update-bar-text'),
  updateBarProgress: $('#update-bar-progress'),
  updateBarProgressFill: $('#update-bar-progress-fill'),
  btnUpdateDownload: $('#btn-update-download'),
  btnUpdateInstall: $('#btn-update-install'),
  btnUpdateDismiss: $('#btn-update-dismiss'),
  appVersion: $('#app-version')
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
  setupSkinEvents();
  setupInstanceEvents();
  setupGithubEvents();
  setupModManagerEvents();
  setupProgressEvents();
  setupUpdateEvents();
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

      // Refresh skin preview when switching to skins tab
      if (section === 'skins') {
        refreshSkinPreview();
      }

      // Refresh instances when switching to instances tab
      if (section === 'instances') {
        loadInstances();
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
  dom.githubToken.value = state.settings.githubToken || '';
  dom.githubOwner.value = state.settings.githubOwner || '';
  dom.githubRepo.value = state.settings.githubRepo || '';
  dom.githubTag.value = state.settings.githubTag || 'v1';

  // Show current data path (custom or default)
  if (state.settings.dataDir) {
    dom.dataPathDisplay.textContent = state.settings.dataDir;
  }
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
    dom.userAvatar.innerHTML = `<img src="https://nmsr.nickac.dev/face/${profile.id}" alt="skin">`;
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
        <span><i class="lucide lucide-package"></i> ${server.mods.length} mods</span>
        <span><i class="lucide lucide-radio"></i> ${server.address}</span>
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
    const statusText = isInstalled ? '<i class="lucide lucide-check"></i> Instalado' : '<i class="lucide lucide-clock"></i> Pendiente';

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
    dom.btnPlay.innerHTML = '<span class="play-icon"><i class="lucide lucide-gamepad-2"></i></span> JUGANDO...';
    dom.btnPlay.classList.add('playing');
  } else {
    dom.btnPlay.innerHTML = '<span class="play-icon"><i class="lucide lucide-play"></i></span> JUGAR';
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
    // Update GitHub upload progress bar separately
    if (data.type === 'github-upload') {
      dom.uploadProgress.style.display = 'block';
      const current = data.current || 0;
      const pct = Math.min(100, Math.round((current / data.total) * 100));
      dom.uploadProgressFill.style.width = `${pct}%`;
      dom.uploadProgressText.textContent = data.name || `${current}/${data.total}`;
      return;
    }

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
    // Reset instance play button too
    if (dom.btnInstancePlay) {
      dom.btnInstancePlay.disabled = false;
      dom.btnInstancePlay.className = 'btn-play';
      dom.btnInstancePlay.innerHTML = '<span class="play-icon"><i class="lucide lucide-play"></i></span> JUGAR';
      dom.instanceProgress.style.display = 'none';
    }
    // Reset close game button
    if (dom.btnCloseGame) {
      dom.btnCloseGame.style.display = 'none';
    }
    addLog('[LauncherChef] Minecraft se ha cerrado', 'warn');
  });

  api.onGameStart(() => {
    // Update server section progress
    dom.progressText.textContent = 'Minecraft esta corriendo...';
    dom.progressFill.style.width = '100%';

    // Update instance play button to show "JUGANDO"
    if (dom.btnInstancePlay) {
      dom.btnInstancePlay.disabled = true;
      dom.btnInstancePlay.className = 'btn-play playing';
      dom.btnInstancePlay.innerHTML = '<span class="play-icon"><i class="lucide lucide-gamepad-2"></i></span> JUGANDO...';
      dom.instanceProgressText.textContent = 'Minecraft esta corriendo...';
      dom.instanceProgressFill.style.width = '100%';
    }
    // Show close game button
    if (dom.btnCloseGame) {
      dom.btnCloseGame.style.display = 'inline-flex';
    }
  });
}

// ============================================
// Mods Management
// ============================================
function setupModEvents() {
  dom.btnSyncMods.addEventListener('click', async () => {
    if (!state.selectedServer) return;

    dom.btnSyncMods.disabled = true;
    dom.btnSyncMods.innerHTML = '<i class="lucide lucide-loader lucide-spin"></i> Sincronizando...';

    const result = await api.syncMods({
      id: state.selectedServer.id,
      mods: state.selectedServer.mods,
      configsUrl: state.selectedServer.configsUrl || null
    });

    dom.btnSyncMods.disabled = false;
    dom.btnSyncMods.innerHTML = '<i class="lucide lucide-refresh-cw"></i> Sincronizar';

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
        statusEl.innerHTML = isInstalled ? '<i class="lucide lucide-check"></i> Instalado' : '<i class="lucide lucide-clock"></i> Pendiente';
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
        <span class="empty-icon"><i class="lucide lucide-package"></i></span>
        <p>Selecciona un servidor primero para ver sus mods</p>
      </div>`;
    return;
  }

  const localMods = await api.getLocalMods(state.selectedServer.id);
  dom.modGrid.innerHTML = '';

  if (localMods.length === 0) {
    dom.modGrid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon"><i class="lucide lucide-package"></i></span>
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
// Skins
// ============================================
let skinVariant = 'classic';

function setupSkinEvents() {
  // Variant selector
  dom.variantClassic.addEventListener('click', () => {
    skinVariant = 'classic';
    dom.variantClassic.classList.add('active');
    dom.variantSlim.classList.remove('active');
  });

  dom.variantSlim.addEventListener('click', () => {
    skinVariant = 'slim';
    dom.variantSlim.classList.add('active');
    dom.variantClassic.classList.remove('active');
  });

  // Upload skin button
  dom.btnUploadSkin.addEventListener('click', async () => {
    const filePath = await api.selectSkinFile();
    if (!filePath) return;

    dom.btnUploadSkin.innerHTML = '<i class="lucide lucide-loader lucide-spin"></i> Subiendo...';
    dom.btnUploadSkin.disabled = true;

    const result = await api.uploadSkin(filePath, skinVariant);

    dom.btnUploadSkin.disabled = false;

    if (result.success) {
      dom.btnUploadSkin.innerHTML = '<i class="lucide lucide-check"></i> Skin cambiada!';
      addLog('[Skin] Skin cambiada exitosamente', 'success');

      // Immediately update preview using the texture hash from Mojang response
      if (result.skinUrl) {
        // Extract texture hash from URL like http://textures.minecraft.net/texture/{hash}
        const parts = result.skinUrl.split('/');
        const textureHash = parts[parts.length - 1];
        if (textureHash && textureHash.length > 10) {
          // Use nmsr.nickac.dev with texture hash for instant render (no cache)
          dom.skinBody.src = `https://nmsr.nickac.dev/fullbody/textures/${textureHash}`;
          dom.skinBody.style.display = 'block';
          dom.skinPlaceholder.style.display = 'none';
        }
      }
    } else {
      dom.btnUploadSkin.innerHTML = '<i class="lucide lucide-x"></i> Error';
      addLog(`[Skin] Error: ${result.error}`, 'error');
    }

    setTimeout(() => {
      dom.btnUploadSkin.innerHTML = '<i class="lucide lucide-folder-open"></i> Cambiar Skin';
    }, 3000);
  });
}

async function refreshSkinPreview() {
  try {
    const skinInfo = await api.getSkinProfile();
    if (!skinInfo.success || !skinInfo.uuid) {
      // Not logged in
      dom.skinPlaceholder.style.display = 'flex';
      dom.skinBody.style.display = 'none';
      dom.skinActions.style.display = 'none';
      dom.skinOfflineMsg.style.display = 'none';
      dom.skinPlayerName.textContent = '-';
      dom.skinUuid.textContent = '-';
      return;
    }

    dom.skinPlayerName.textContent = skinInfo.name;
    dom.skinUuid.textContent = skinInfo.uuid;

    // Clean UUID (remove dashes)
    const cleanUuid = skinInfo.uuid.replace(/-/g, '');

    if (skinInfo.premium) {
      // Premium: show full body render and upload options
      dom.skinBody.src = `https://nmsr.nickac.dev/fullbody/${cleanUuid}?ts=${Date.now()}`;
      dom.skinBody.style.display = 'block';
      dom.skinPlaceholder.style.display = 'none';
      dom.skinActions.style.display = 'block';
      dom.skinOfflineMsg.style.display = 'none';
    } else {
      // Offline: show default skin preview, no upload
      dom.skinBody.src = `https://nmsr.nickac.dev/fullbody/MHF_Steve`;
      dom.skinBody.style.display = 'block';
      dom.skinPlaceholder.style.display = 'none';
      dom.skinActions.style.display = 'none';
      dom.skinOfflineMsg.style.display = 'flex';
    }
  } catch {
    dom.skinPlaceholder.style.display = 'flex';
    dom.skinBody.style.display = 'none';
  }
}

// ============================================
// Instances
// ============================================
let selectedIcon = '🎮';

async function loadInstances() {
  state.instances = await api.listInstances();
  renderInstanceList();
}

function renderInstanceList() {
  dom.instanceList.innerHTML = '';
  if (state.instances.length === 0) {
    dom.instanceList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon"><i class="lucide lucide-gamepad-2"></i></span>
        <p>No hay instancias. Crea una para empezar.</p>
      </div>`;
    return;
  }
  state.instances.forEach(inst => {
    const card = document.createElement('div');
    card.className = 'server-card';
    card.innerHTML = `
      <div class="server-name">${inst.icon || '🎮'} ${inst.name}</div>
      <span class="server-version">${inst.minecraft_version} - ${inst.mod_loader}${inst.mod_loader_version ? ' ' + inst.mod_loader_version : ''}</span>
      <div class="server-meta">
        <span><i class="lucide lucide-calendar"></i> ${new Date(inst.created).toLocaleDateString()}</span>
        ${inst.lastPlayed ? `<span><i class="lucide lucide-gamepad-2"></i> ${new Date(inst.lastPlayed).toLocaleDateString()}</span>` : ''}
      </div>
    `;
    card.addEventListener('click', () => selectInstance(inst));
    dom.instanceList.appendChild(card);
  });
}

function showInstanceView(view) {
  dom.instanceList.style.display = view === 'list' ? 'grid' : 'none';
  dom.instanceToolbar.style.display = view === 'list' ? 'flex' : 'none';
  dom.instanceCreateForm.style.display = view === 'create' ? 'block' : 'none';
  dom.instanceDetail.style.display = view === 'detail' ? 'block' : 'none';
}

async function selectInstance(instance) {
  state.selectedInstance = instance;
  dom.instanceDetailName.textContent = `${instance.icon} ${instance.name}`;
  dom.instanceDetailVersion.textContent = instance.minecraft_version;
  dom.instanceDetailLoader.textContent = instance.mod_loader +
    (instance.mod_loader_version ? ` ${instance.mod_loader_version}` : '');
  dom.instanceDetailCreated.textContent = new Date(instance.created).toLocaleString();

  // Enable play button if logged in
  dom.btnInstancePlay.disabled = !state.loggedIn;

  state.instanceTab = 'mods';
  dom.instanceTabs.forEach(t => {
    t.classList.toggle('active', t.dataset.tab === 'mods');
  });
  await refreshInstanceFiles();
  showInstanceView('detail');
}

async function refreshInstanceFiles() {
  if (!state.selectedInstance) return;
  const files = await api.getInstanceContents(state.selectedInstance.id, state.instanceTab);
  dom.instanceFileCount.textContent = `${files.length} archivos`;
  dom.instanceFileList.innerHTML = '';

  if (files.length === 0) {
    dom.instanceFileList.innerHTML = `
      <div class="empty-state" style="padding:30px;">
        <span class="empty-icon"><i class="lucide lucide-folder-open"></i></span>
        <p>No hay archivos. Presiona "+ Agregar" para anadir.</p>
      </div>`;
    return;
  }

  files.forEach(file => {
    const item = document.createElement('div');
    item.className = 'mod-item';
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    item.innerHTML = `
      <span class="mod-item-name">${file.filename}</span>
      <span class="mod-item-size">${sizeMB} MB</span>
      <button class="btn-remove-file" data-filename="${file.filename}">✕</button>
    `;
    item.querySelector('.btn-remove-file').addEventListener('click', async (e) => {
      e.stopPropagation();
      const result = await api.removeInstanceFile(
        state.selectedInstance.id, state.instanceTab, file.filename
      );
      if (result.success) refreshInstanceFiles();
    });
    dom.instanceFileList.appendChild(item);
  });
}

function setupInstanceEvents() {
  // Icon picker
  const icons = ['🎮', '⚔️', '🏰', '🌍', '🔧', '🍖', '🎯', '🚀', '🌙', '💎'];
  dom.instanceIconPicker.innerHTML = icons
    .map(icon => `<button class="icon-btn${icon === '🎮' ? ' active' : ''}" data-icon="${icon}">${icon}</button>`)
    .join('');
  dom.instanceIconPicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.icon-btn');
    if (!btn) return;
    dom.instanceIconPicker.querySelectorAll('.icon-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedIcon = btn.dataset.icon;
  });

  // Create button -> show form
  dom.btnCreateInstance.addEventListener('click', async () => {
    showInstanceView('create');
    dom.instanceName.value = '';
    dom.instanceLoader.value = 'vanilla';
    dom.loaderVersionRow.style.display = 'none';
    selectedIcon = '🎮';
    dom.instanceIconPicker.querySelectorAll('.icon-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.icon === '🎮');
    });

    // Populate MC versions
    dom.instanceMcVersion.innerHTML = '<option>Cargando...</option>';
    const versions = await api.getVersions();
    dom.instanceMcVersion.innerHTML = versions
      .map(v => `<option value="${v.id}">${v.id}</option>`).join('');
  });

  // Back buttons
  dom.btnBackInstanceCreate.addEventListener('click', () => showInstanceView('list'));
  dom.btnBackInstanceList.addEventListener('click', () => {
    showInstanceView('list');
    loadInstances();
  });

  // Loader change -> fetch loader versions
  dom.instanceLoader.addEventListener('change', async () => {
    const loader = dom.instanceLoader.value;
    if (loader === 'vanilla') {
      dom.loaderVersionRow.style.display = 'none';
      return;
    }
    dom.loaderVersionRow.style.display = 'flex';
    dom.instanceLoaderVersion.innerHTML = '<option>Cargando...</option>';
    const mcVer = dom.instanceMcVersion.value;
    const versions = await api.getLoaderVersions(mcVer, loader);
    if (versions.length === 0) {
      dom.instanceLoaderVersion.innerHTML = '<option value="">No disponible para esta version</option>';
    } else {
      dom.instanceLoaderVersion.innerHTML = versions
        .map(v => `<option value="${v.version}">${v.version}${v.stable ? '' : ' (beta)'}</option>`)
        .join('');
    }
  });

  // MC version change -> re-fetch loader versions
  dom.instanceMcVersion.addEventListener('change', () => {
    if (dom.instanceLoader.value !== 'vanilla') {
      dom.instanceLoader.dispatchEvent(new Event('change'));
    }
  });

  // Create instance confirm
  dom.btnCreateInstanceConfirm.addEventListener('click', async () => {
    const name = dom.instanceName.value.trim();
    if (!name) { addLog('[Instancias] El nombre no puede estar vacio', 'warn'); return; }

    const loader = dom.instanceLoader.value;
    if (loader !== 'vanilla' && !dom.instanceLoaderVersion.value) {
      addLog('[Instancias] Selecciona una version del loader', 'warn');
      return;
    }

    dom.btnCreateInstanceConfirm.disabled = true;
    dom.btnCreateInstanceConfirm.textContent = 'Creando...';

    const result = await api.createInstance({
      name,
      minecraft_version: dom.instanceMcVersion.value,
      mod_loader: loader,
      mod_loader_version: loader === 'vanilla' ? null : dom.instanceLoaderVersion.value,
      icon: selectedIcon
    });

    dom.btnCreateInstanceConfirm.disabled = false;
    dom.btnCreateInstanceConfirm.textContent = 'Crear Instancia';

    if (result.success) {
      addLog(`[Instancias] Instancia "${name}" creada`, 'success');
      await loadInstances();
      showInstanceView('list');
    } else {
      addLog(`[Instancias] Error: ${result.error}`, 'error');
    }
  });

  // Tab switching
  dom.instanceTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      dom.instanceTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.instanceTab = tab.dataset.tab;
      refreshInstanceFiles();
    });
  });

  // Add files
  dom.btnAddInstanceFiles.addEventListener('click', async () => {
    if (!state.selectedInstance) return;
    const result = await api.addInstanceFiles(state.selectedInstance.id, state.instanceTab);
    if (result.success) {
      addLog(`[Instancias] ${result.added.length} archivo(s) agregado(s)`, 'success');
      refreshInstanceFiles();
    }
  });

  // Launch instance
  dom.btnInstancePlay.addEventListener('click', async () => {
    if (!state.selectedInstance || state.playing) return;
    const inst = state.selectedInstance;

    state.playing = true;
    updatePlayButton();
    dom.btnInstancePlay.disabled = true;
    dom.btnInstancePlay.innerHTML = '<span class="play-icon"><i class="lucide lucide-loader lucide-spin"></i></span> LANZANDO...';

    dom.instanceProgress.style.display = 'block';
    dom.instanceProgressText.textContent = 'Preparando Minecraft...';
    dom.instanceProgressFill.style.width = '10%';

    addLog(`[Launch] Lanzando instancia: ${inst.name} (${inst.minecraft_version} ${inst.mod_loader})`);

    // Update lastPlayed
    await api.updateInstanceLastPlayed(inst.id);

    const launchResult = await api.launch({
      version: inst.minecraft_version,
      serverId: inst.id,
      modLoader: inst.mod_loader,
      modLoaderVersion: inst.mod_loader_version || '',
      username: state.profile?.name || 'Player'
    });

    if (!launchResult.success) {
      addLog(`[Launch] Error: ${launchResult.error}`, 'error');
      state.playing = false;
      updatePlayButton();
      dom.btnInstancePlay.disabled = false;
      dom.btnInstancePlay.innerHTML = '<span class="play-icon"><i class="lucide lucide-play"></i></span> JUGAR';
      dom.instanceProgress.style.display = 'none';
    }
  });

  // Close game button
  dom.btnCloseGame.addEventListener('click', async () => {
    dom.btnCloseGame.disabled = true;
    dom.btnCloseGame.innerHTML = '<i class="lucide lucide-loader lucide-spin"></i> Cerrando...';
    addLog('[LauncherChef] Cerrando Minecraft...');
    const result = await api.killGame();
    if (result.success) {
      addLog('[LauncherChef] Minecraft cerrado por el usuario', 'success');
    } else {
      addLog(`[LauncherChef] Error cerrando: ${result.error}`, 'error');
    }
    dom.btnCloseGame.disabled = false;
    dom.btnCloseGame.innerHTML = '<i class="lucide lucide-square"></i> Cerrar Juego';
  });

  // Delete instance
  dom.btnDeleteInstance.addEventListener('click', async () => {
    if (!state.selectedInstance) return;
    const name = state.selectedInstance.name;
    if (!confirm(`Eliminar instancia "${name}"?\nSe borraran todos los archivos.`)) return;

    const result = await api.deleteInstance(state.selectedInstance.id);
    if (result.success) {
      addLog(`[Instancias] Instancia "${name}" eliminada`, 'success');
      state.selectedInstance = null;
      await loadInstances();
      showInstanceView('list');
    }
  });
}

// ============================================
// GitHub Mod Upload
// ============================================
function setupGithubEvents() {
  // Show upload panel
  dom.btnShowGithubUpload.addEventListener('click', () => {
    if (!state.settings.githubToken || !state.settings.githubOwner || !state.settings.githubRepo) {
      addLog('[GitHub] Configura el token, owner y repo en Ajustes primero', 'warn');
      return;
    }
    dom.serverList.style.display = 'none';
    dom.serverDetail.style.display = 'none';
    dom.githubUploadPanel.style.display = 'block';
    dom.serverUploadToolbar.style.display = 'none';
    state.uploadFiles = [];
    renderUploadFileList();
    populateUploadServerSelect();
  });

  // Back button
  dom.btnBackUpload.addEventListener('click', () => {
    dom.githubUploadPanel.style.display = 'none';
    dom.serverList.style.display = 'grid';
    dom.serverUploadToolbar.style.display = 'flex';
  });

  // Select JAR files
  dom.btnSelectJars.addEventListener('click', async () => {
    const result = await api.selectModsForUpload();
    if (!result.success || result.canceled) return;
    // Merge with existing (avoid duplicates by filename)
    const existingNames = new Set(state.uploadFiles.map(f => f.filename));
    for (const file of result.files) {
      if (!existingNames.has(file.filename)) {
        state.uploadFiles.push(file);
      }
    }
    renderUploadFileList();
    addLog(`[GitHub] ${result.files.length} archivo(s) seleccionado(s)`, 'success');
  });

  // Upload button
  dom.btnUploadGithub.addEventListener('click', async () => {
    if (state.uploadFiles.length === 0) return;

    const serverId = dom.uploadServerSelect.value;
    if (!serverId) {
      addLog('[GitHub] Selecciona un servidor destino', 'warn');
      return;
    }

    dom.btnUploadGithub.disabled = true;
    dom.btnUploadGithub.innerHTML = '<span class="play-icon"><i class="lucide lucide-loader lucide-spin"></i></span> Subiendo...';
    dom.uploadProgress.style.display = 'block';
    dom.uploadProgressText.textContent = 'Preparando subida...';
    dom.uploadProgressFill.style.width = '0%';

    const result = await api.uploadModsToGithub({
      token: state.settings.githubToken,
      owner: state.settings.githubOwner,
      repo: state.settings.githubRepo,
      tag: state.settings.githubTag || 'v1',
      serverId,
      files: state.uploadFiles
    });

    if (result.success) {
      addLog(`[GitHub] Subida completada: ${result.uploaded} archivos subidos, distribution.json actualizado`, 'success');
      dom.btnUploadGithub.innerHTML = '<span class="play-icon"><i class="lucide lucide-check"></i></span> Completado!';
      dom.uploadProgressText.textContent = 'Subida completada!';
      dom.uploadProgressFill.style.width = '100%';
      state.uploadFiles = [];
      renderUploadFileList();
    } else {
      addLog(`[GitHub] Error: ${result.error}`, 'error');
      dom.btnUploadGithub.innerHTML = '<span class="play-icon"><i class="lucide lucide-x"></i></span> Error';
      dom.uploadProgressText.textContent = `Error: ${result.error}`;
    }

    setTimeout(() => {
      dom.btnUploadGithub.innerHTML = '<span class="play-icon"><i class="lucide lucide-upload"></i></span> Subir a GitHub';
      dom.btnUploadGithub.disabled = state.uploadFiles.length === 0;
      dom.uploadProgress.style.display = 'none';
    }, 3000);
  });

  // Test token button
  dom.btnTestGithubToken.addEventListener('click', async () => {
    const token = dom.githubToken.value.trim();
    if (!token) {
      addLog('[GitHub] Introduce un token primero', 'warn');
      return;
    }
    dom.btnTestGithubToken.textContent = 'Probando...';
    dom.btnTestGithubToken.disabled = true;
    const result = await api.testGithubToken(token);
    dom.btnTestGithubToken.disabled = false;
    if (result.success) {
      dom.btnTestGithubToken.innerHTML = `<i class="lucide lucide-check"></i> ${result.username}`;
      addLog(`[GitHub] Token valido - usuario: ${result.username}`, 'success');
    } else {
      dom.btnTestGithubToken.innerHTML = '<i class="lucide lucide-x"></i> Token invalido';
      addLog(`[GitHub] Token invalido: ${result.error}`, 'error');
    }
    setTimeout(() => {
      dom.btnTestGithubToken.textContent = 'Probar Token';
    }, 3000);
  });
}

function populateUploadServerSelect() {
  dom.uploadServerSelect.innerHTML = '';
  state.servers.forEach(server => {
    const option = document.createElement('option');
    option.value = server.id;
    option.textContent = `${server.icon || ''} ${server.name} (${server.mods.length} mods)`;
    dom.uploadServerSelect.appendChild(option);
  });
}

function renderUploadFileList() {
  dom.uploadFileCount.textContent = `${state.uploadFiles.length} archivos seleccionados`;
  dom.btnUploadGithub.disabled = state.uploadFiles.length === 0;
  dom.uploadFileList.innerHTML = '';

  if (state.uploadFiles.length === 0) {
    dom.uploadFileList.innerHTML = `
      <div class="empty-state" style="padding:30px;">
        <span class="empty-icon"><i class="lucide lucide-package"></i></span>
        <p>Selecciona archivos .jar para subir al release de GitHub</p>
      </div>`;
    return;
  }

  state.uploadFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'mod-item';
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    item.innerHTML = `
      <span class="mod-item-name">${file.name}</span>
      <span class="mod-item-version">${file.filename}</span>
      <span class="mod-item-size">${sizeMB} MB</span>
      <button class="btn-remove-file" data-index="${index}">✕</button>
    `;
    item.querySelector('.btn-remove-file').addEventListener('click', (e) => {
      e.stopPropagation();
      state.uploadFiles.splice(index, 1);
      renderUploadFileList();
    });
    dom.uploadFileList.appendChild(item);
  });
}

// ============================================
// Mod Manager (Delete Mods from GitHub)
// ============================================
function setupModManagerEvents() {
  // Show mod manager panel
  dom.btnShowModManager.addEventListener('click', () => {
    if (!state.settings.githubToken || !state.settings.githubOwner || !state.settings.githubRepo) {
      addLog('[GitHub] Configura el token, owner y repo en Ajustes primero', 'warn');
      return;
    }
    dom.serverList.style.display = 'none';
    dom.serverDetail.style.display = 'none';
    dom.githubUploadPanel.style.display = 'none';
    dom.githubModManager.style.display = 'block';
    dom.serverUploadToolbar.style.display = 'none';
    dom.manageModsListContainer.style.display = 'none';
    dom.manageProgress.style.display = 'none';
    state.manageMods = [];
    state.manageFileSha = null;
    populateManageServerSelect();
  });

  // Back button
  dom.btnBackModManager.addEventListener('click', () => {
    dom.githubModManager.style.display = 'none';
    dom.serverList.style.display = 'grid';
    dom.serverUploadToolbar.style.display = 'flex';
  });

  // Fetch mods from GitHub
  dom.btnFetchGithubMods.addEventListener('click', async () => {
    const serverId = dom.manageServerSelect.value;
    if (!serverId) {
      addLog('[GitHub] Selecciona un servidor', 'warn');
      return;
    }

    dom.btnFetchGithubMods.disabled = true;
    dom.btnFetchGithubMods.innerHTML = '<i class="lucide lucide-loader lucide-spin"></i> Cargando...';
    dom.manageProgress.style.display = 'block';
    dom.manageProgressText.textContent = 'Obteniendo mods de GitHub...';
    dom.manageProgressFill.style.width = '50%';

    const result = await api.fetchGithubMods({
      token: state.settings.githubToken,
      owner: state.settings.githubOwner,
      repo: state.settings.githubRepo,
      tag: state.settings.githubTag || 'v1',
      serverId
    });

    dom.btnFetchGithubMods.disabled = false;
    dom.btnFetchGithubMods.innerHTML = '<i class="lucide lucide-download"></i> Cargar mods de GitHub';
    dom.manageProgress.style.display = 'none';

    if (result.success) {
      state.manageMods = result.mods;
      state.manageFileSha = result.fileSha;
      dom.manageModsTitle.textContent = `Mods en: ${result.serverName}`;
      dom.manageModsListContainer.style.display = 'block';
      renderManageModList();
      addLog(`[GitHub] ${result.mods.length} mods encontrados en "${result.serverName}"`, 'success');
    } else {
      addLog(`[GitHub] Error: ${result.error}`, 'error');
    }
  });
}

function populateManageServerSelect() {
  dom.manageServerSelect.innerHTML = '';
  state.servers.forEach(server => {
    const option = document.createElement('option');
    option.value = server.id;
    option.textContent = `${server.icon || ''} ${server.name} (${server.mods.length} mods)`;
    dom.manageServerSelect.appendChild(option);
  });
}

function renderManageModList() {
  dom.manageModCount.textContent = `${state.manageMods.length} mods`;
  dom.manageModList.innerHTML = '';

  if (state.manageMods.length === 0) {
    dom.manageModList.innerHTML = `
      <div class="empty-state" style="padding:30px;">
        <span class="empty-icon"><i class="lucide lucide-package"></i></span>
        <p>Este servidor no tiene mods en distribution.json</p>
      </div>`;
    return;
  }

  state.manageMods.forEach((mod, index) => {
    const item = document.createElement('div');
    item.className = 'mod-manage-item';
    const sizeMB = mod.size ? (mod.size / (1024 * 1024)).toFixed(1) + ' MB' : '-';
    item.innerHTML = `
      <div class="mod-manage-info">
        <span class="mod-manage-name">${mod.name}</span>
        <span class="mod-manage-filename">${mod.filename}</span>
      </div>
      <span class="mod-manage-size">${sizeMB}</span>
      <button class="btn-delete-mod" data-index="${index}" title="Eliminar mod">
        <i class="lucide lucide-trash-2"></i>
      </button>
    `;
    item.querySelector('.btn-delete-mod').addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteMod(index);
    });
    dom.manageModList.appendChild(item);
  });
}

async function handleDeleteMod(index) {
  const mod = state.manageMods[index];
  if (!mod) return;

  if (!confirm(`Eliminar "${mod.name}" (${mod.filename})?\n\nSe eliminara del release de GitHub y de distribution.json.`)) {
    return;
  }

  // Disable all delete buttons during operation
  dom.manageModList.querySelectorAll('.btn-delete-mod').forEach(btn => btn.disabled = true);

  dom.manageProgress.style.display = 'block';
  dom.manageProgressText.textContent = `Eliminando: ${mod.name}...`;
  dom.manageProgressFill.style.width = '50%';

  const result = await api.deleteGithubMod({
    token: state.settings.githubToken,
    owner: state.settings.githubOwner,
    repo: state.settings.githubRepo,
    tag: state.settings.githubTag || 'v1',
    serverId: dom.manageServerSelect.value,
    modFilename: mod.filename,
    assetId: mod.assetId || null,
    fileSha: state.manageFileSha
  });

  if (result.success) {
    // Remove from local state
    state.manageMods.splice(index, 1);
    if (result.newFileSha) {
      state.manageFileSha = result.newFileSha;
    }

    dom.manageProgressText.textContent = `"${mod.name}" eliminado correctamente`;
    dom.manageProgressFill.style.width = '100%';
    addLog(`[GitHub] Mod eliminado: ${mod.name} (${mod.filename})`, 'success');

    renderManageModList();

    setTimeout(() => {
      dom.manageProgress.style.display = 'none';
    }, 2000);
  } else {
    addLog(`[GitHub] Error eliminando "${mod.name}": ${result.error}`, 'error');
    dom.manageProgressText.textContent = `Error: ${result.error}`;
    dom.manageModList.querySelectorAll('.btn-delete-mod').forEach(btn => btn.disabled = false);
    setTimeout(() => {
      dom.manageProgress.style.display = 'none';
    }, 3000);
  }
}

// ============================================
// Settings
// ============================================
function setupSettingsEvents() {
  // Change installation directory
  dom.btnChangePath.addEventListener('click', async () => {
    const selectedPath = await api.selectDirectory();
    if (selectedPath) {
      dom.dataPathDisplay.textContent = selectedPath;
      state.settings.dataDir = selectedPath;
      addLog(`[Settings] Ruta de instalacion cambiada a: ${selectedPath}`);
    }
  });

  // Reset to default path
  dom.btnResetPath.addEventListener('click', async () => {
    const paths = await api.getPaths();
    dom.dataPathDisplay.textContent = paths.defaultData;
    state.settings.dataDir = '';
    addLog('[Settings] Ruta de instalacion restaurada a la por defecto');
  });

  dom.btnSaveSettings.addEventListener('click', async () => {
    const newDataDir = state.settings.dataDir || '';

    state.settings = {
      ramMin: parseInt(dom.ramMin.value) || 1024,
      ramMax: parseInt(dom.ramMax.value) || 4096,
      javaPath: dom.javaPath.value.trim(),
      dataDir: newDataDir,
      distroUrl: dom.distroUrl.value.trim(),
      githubToken: dom.githubToken.value.trim(),
      githubOwner: dom.githubOwner.value.trim(),
      githubRepo: dom.githubRepo.value.trim(),
      githubTag: dom.githubTag.value.trim() || 'v1'
    };

    const result = await api.saveSettings(state.settings);
    if (result.success) {
      // Update the data directory in the main process
      await api.updateDataDir(newDataDir || null);
      const paths = await api.getPaths();
      dom.dataPathDisplay.textContent = paths.data;

      addLog('[Settings] Ajustes guardados', 'success');
      dom.btnSaveSettings.innerHTML = '<i class="lucide lucide-check"></i> Guardado';
    } else {
      addLog(`[Settings] Error: ${result.error}`, 'error');
      dom.btnSaveSettings.innerHTML = '<i class="lucide lucide-x"></i> Error';
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
// Auto-Update
// ============================================
async function setupUpdateEvents() {
  // Show dynamic version
  try {
    const version = await api.getAppVersion();
    if (version && dom.appVersion) {
      dom.appVersion.textContent = `v${version}`;
    }
  } catch { /* ignore in dev */ }

  // Update event listeners
  api.onUpdateChecking(() => {
    addLog('[Updater] Buscando actualizaciones...');
  });

  api.onUpdateAvailable((info) => {
    addLog(`[Updater] Nueva version disponible: v${info.version}`, 'success');
    dom.updateBar.style.display = 'flex';
    dom.updateBarText.textContent = `Nueva version disponible: v${info.version}`;
    dom.btnUpdateDownload.style.display = 'inline-flex';
    dom.btnUpdateInstall.style.display = 'none';
    dom.updateBarProgress.style.display = 'none';
  });

  api.onUpdateNotAvailable(() => {
    addLog('[Updater] Ya tienes la ultima version');
  });

  api.onUpdateProgress((progress) => {
    dom.updateBar.style.display = 'flex';
    dom.updateBarProgress.style.display = 'block';
    dom.updateBarProgressFill.style.width = `${progress.percent}%`;
    dom.btnUpdateDownload.style.display = 'none';

    const mbTransferred = (progress.transferred / (1024 * 1024)).toFixed(1);
    const mbTotal = (progress.total / (1024 * 1024)).toFixed(1);
    const speed = (progress.bytesPerSecond / (1024 * 1024)).toFixed(1);
    dom.updateBarText.textContent = `Descargando: ${mbTransferred}/${mbTotal} MB (${speed} MB/s) - ${progress.percent}%`;
  });

  api.onUpdateDownloaded((info) => {
    addLog(`[Updater] Actualizacion v${info.version} descargada. Lista para instalar.`, 'success');
    dom.updateBarText.textContent = `v${info.version} lista para instalar`;
    dom.updateBarProgress.style.display = 'none';
    dom.btnUpdateDownload.style.display = 'none';
    dom.btnUpdateInstall.style.display = 'inline-flex';
  });

  api.onUpdateError((msg) => {
    addLog(`[Updater] Error: ${msg}`, 'error');
    // No mostrar la barra si no hay update
    if (dom.updateBar.style.display === 'flex') {
      dom.updateBarText.textContent = `Error de actualizacion`;
      setTimeout(() => {
        dom.updateBar.style.display = 'none';
      }, 5000);
    }
  });

  // Botones de la barra
  dom.btnUpdateDownload.addEventListener('click', async () => {
    dom.btnUpdateDownload.textContent = 'Descargando...';
    dom.btnUpdateDownload.disabled = true;
    addLog('[Updater] Iniciando descarga...');
    const result = await api.downloadUpdate();
    if (!result.success) {
      addLog(`[Updater] Error descargando: ${result.error}`, 'error');
      dom.btnUpdateDownload.textContent = 'Reintentar';
      dom.btnUpdateDownload.disabled = false;
    }
  });

  dom.btnUpdateInstall.addEventListener('click', () => {
    addLog('[Updater] Instalando actualizacion y reiniciando...');
    api.installUpdate();
  });

  dom.btnUpdateDismiss.addEventListener('click', () => {
    dom.updateBar.style.display = 'none';
  });
}

// ============================================
// Start the app
// ============================================
document.addEventListener('DOMContentLoaded', init);
