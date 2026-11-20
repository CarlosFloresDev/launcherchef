const { Client, Authenticator } = require('minecraft-launcher-core');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const AdmZip = require('adm-zip');

module.exports = function (ipcMain, getDataDir, configDir) {
  const launcher = new Client();
  const { execSync } = require('child_process');

  // Track the running game process
  let gameProcess = null;

  // Config directory (passed from main.js)
  const CONFIG_PATH = configDir || path.join(__dirname, '..', '..', 'config');

  // Support both function (dynamic) and string (legacy) for dataDir
  const resolveDataDir = typeof getDataDir === 'function' ? getDataDir : () => getDataDir;

  // Java runtimes are resolved per Minecraft version (8, 17, 21...) by the Java manager.
  const createJavaManager = require('./javaManager');
  const { ensureLoaderProfile } = require('./loaderProfiles');
  let currentSender = null;
  const javaManager = createJavaManager(
    resolveDataDir,
    (msg) => currentSender && currentSender.send('log', msg),
    (p) => currentSender && currentSender.send('progress', p),
  );

  /**
   * Download a file from URL to dest. Handles redirects.
   */
  function downloadFile(url, dest, onProgress) {
    return new Promise((resolve, reject) => {
      const proto = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(dest);

      proto.get(url, { headers: { 'User-Agent': 'LauncherChef/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          if (fs.existsSync(dest)) fs.unlinkSync(dest);
          return downloadFile(res.headers.location, dest, onProgress).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          file.close();
          if (fs.existsSync(dest)) fs.unlinkSync(dest);
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;

        res.on('data', (chunk) => {
          received += chunk.length;
          if (onProgress && totalBytes > 0) {
            onProgress(received, totalBytes);
          }
        });

        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
    });
  }

  /**
   * Fetch JSON from a URL.
   */
  function fetchJSON(url) {
    return new Promise((resolve, reject) => {
      const proto = url.startsWith('https') ? https : http;
      proto.get(url, { headers: { 'User-Agent': 'LauncherChef/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchJSON(res.headers.location).then(resolve).catch(reject);
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('JSON invalido')); }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  /**
   * Ensure NeoForge installer is downloaded.
   */
  async function ensureNeoForgeInstaller(neoforgeVersion, instanceDir, sender) {
    const installersDir = path.join(resolveDataDir(), 'installers');
    if (!fs.existsSync(installersDir)) fs.mkdirSync(installersDir, { recursive: true });

    const installerName = `neoforge-${neoforgeVersion}-installer.jar`;
    const installerPath = path.join(installersDir, installerName);

    if (fs.existsSync(installerPath)) {
      sender.send('log', `[NeoForge] Instalador ya existe: ${installerName}`);
      return installerPath;
    }

    const url = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoforgeVersion}/neoforge-${neoforgeVersion}-installer.jar`;
    sender.send('log', `[NeoForge] Descargando instalador: ${url}`);
    sender.send('progress', { type: 'NeoForge', current: 0, total: 100, name: 'Descargando instalador NeoForge...' });

    await downloadFile(url, installerPath, (received, total) => {
      const pct = Math.round((received / total) * 100);
      sender.send('progress', {
        type: 'NeoForge',
        current: pct,
        total: 100,
        name: `Instalador NeoForge: ${(received / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB`
      });
    });

    sender.send('log', `[NeoForge] Instalador descargado: ${installerPath}`);
    return installerPath;
  }

  /**
   * Ensure classic Forge installer is downloaded.
   */
  async function ensureForgeInstaller(mcVersion, forgeVersion, sender) {
    const installersDir = path.join(resolveDataDir(), 'installers');
    if (!fs.existsSync(installersDir)) fs.mkdirSync(installersDir, { recursive: true });

    const fullVersion = `${mcVersion}-${forgeVersion}`;
    const installerName = `forge-${fullVersion}-installer.jar`;
    const installerPath = path.join(installersDir, installerName);

    if (fs.existsSync(installerPath)) {
      sender.send('log', `[Forge] Instalador ya existe: ${installerName}`);
      return installerPath;
    }

    const url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullVersion}/forge-${fullVersion}-installer.jar`;
    sender.send('log', `[Forge] Descargando instalador: ${url}`);
    sender.send('progress', { type: 'Forge', current: 0, total: 100, name: 'Descargando instalador Forge...' });

    await downloadFile(url, installerPath, (received, total) => {
      const pct = Math.round((received / total) * 100);
      sender.send('progress', {
        type: 'Forge',
        current: pct,
        total: 100,
        name: `Instalador Forge: ${(received / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB`
      });
    });

    sender.send('log', `[Forge] Instalador descargado: ${installerPath}`);
    return installerPath;
  }

  ipcMain.handle('mc:getVersions', async () => {
    try {
      return new Promise((resolve, reject) => {
        https.get('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json', (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const manifest = JSON.parse(data);
              const versions = manifest.versions
                .filter(v => v.type === 'release')
                .slice(0, 30)
                .map(v => ({ id: v.id, type: v.type, url: v.url, releaseTime: v.releaseTime }));
              resolve(versions);
            } catch (e) { reject(e.message); }
          });
          res.on('error', reject);
        });
      });
    } catch { return []; }
  });

  ipcMain.handle('mc:launch', async (event, options) => {
    try {
      // Load settings
      const configPath = path.join(CONFIG_PATH, 'settings.json');
      let settings = {};
      try {
        if (fs.existsSync(configPath)) {
          settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
      } catch { /* defaults */ }

      const ramMin = settings.ramMin || 1024;
      const ramMax = settings.ramMax || 6144;

      currentSender = event.sender;
      const mcVersionForJava = options.version || '1.21.1';

      // Each Minecraft version needs a specific Java (1.16 and older: 8, 1.17-1.20.4: 17, 1.20.5+: 21).
      event.sender.send('log', '[LauncherChef] Verificando Java...');
      // Older settings stored a single global Java path; keep it only for the Java major it actually is.
      const javaOverrides = { ...(settings.javaOverrides || {}) };
      if (settings.javaPath && fs.existsSync(settings.javaPath)) {
        const legacyMajor = javaManager.javaMajorOf(settings.javaPath);
        if (legacyMajor && !javaOverrides[legacyMajor]) javaOverrides[legacyMajor] = settings.javaPath;
      }
      const java = await javaManager.resolveFor(mcVersionForJava, javaOverrides);
      const javaPath = java.path;

      // Game files (versions, libraries, assets) are shared by all instances; saves, mods and configs are per instance.
      const serverId = options.serverId || 'default';
      const instanceDir = path.join(resolveDataDir(), 'instances', serverId);
      const sharedRoot = path.join(resolveDataDir(), 'shared');
      fs.mkdirSync(sharedRoot, { recursive: true });

      if (!fs.existsSync(instanceDir)) {
        fs.mkdirSync(instanceDir, { recursive: true });
      }

      // Get auth — NOTE: Authenticator.getAuth() is async in MCLC v3
      let authObj;
      let isOfflineAccount = true;
      try {
        const authFile = path.join(CONFIG_PATH, 'auth.json');
        if (fs.existsSync(authFile)) {
          const authData = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
          if (authData.premium === false || !authData.mcToken) {
            // Offline mode
            authObj = await Authenticator.getAuth(authData.name || 'Player');
            authObj.meta = { type: 'mojang', demo: false };
          } else {
            // Premium Microsoft account
            isOfflineAccount = false;
            authObj = {
              access_token: authData.mcToken,
              client_token: '',
              uuid: authData.uuid || authData.profile?.id || '',
              name: authData.name || authData.profile?.name || 'Player',
              user_properties: '{}',
              meta: { type: 'msa', demo: false }
            };
          }
        } else {
          authObj = await Authenticator.getAuth(options.username || 'Player');
          authObj.meta = { type: 'mojang', demo: false };
        }
      } catch {
        authObj = await Authenticator.getAuth(options.username || 'Player');
        authObj.meta = { type: 'mojang', demo: false };
      }

      // Determine mod loader
      const modLoader = options.modLoader || 'vanilla';
      const modLoaderVersion = options.modLoaderVersion || '';
      const mcVersion = options.version || '1.21.1';

      event.sender.send('log', `[LauncherChef] Preparando Minecraft ${mcVersion} + ${modLoader} ${modLoaderVersion}`);
      event.sender.send('log', `[LauncherChef] Directorio: ${instanceDir}`);
      event.sender.send('log', `[LauncherChef] Java: ${javaPath}`);
      event.sender.send('log', `[LauncherChef] RAM: ${ramMin}M - ${ramMax}M`);
      event.sender.send('log', `[LauncherChef] Jugador: ${authObj.name}`);

      // Build launch options
      const launchOpts = {
        authorization: authObj,
        root: sharedRoot,
        version: {
          number: mcVersion,
          type: 'release'
        },
        memory: {
          min: `${ramMin}M`,
          max: `${ramMax}M`
        },
        javaPath: javaPath,
        overrides: {
          gameDirectory: instanceDir
        }
      };

      // For offline accounts: bypass Xbox Live multiplayer check
      // Redirects Minecraft services API to an invalid host so the game
      // can't verify account and defaults to allowing multiplayer
      if (isOfflineAccount) {
        launchOpts.customArgs = [
          '-Dminecraft.api.env=custom',
          '-Dminecraft.api.auth.host=https://nope.invalid',
          '-Dminecraft.api.account.host=https://nope.invalid',
          '-Dminecraft.api.session.host=https://nope.invalid',
          '-Dminecraft.api.services.host=https://nope.invalid'
        ];
        event.sender.send('log', '[LauncherChef] Modo offline: bypass de servicios Xbox Live para multiplayer');
      }

      // Handle mod loaders
      if (modLoader === 'neoforge') {
        event.sender.send('progress', { type: 'setup', current: 10, total: 100, name: 'Descargando instalador de NeoForge...' });
        const installerPath = await ensureNeoForgeInstaller(modLoaderVersion, sharedRoot, event.sender);
        launchOpts.forge = installerPath;
        event.sender.send('log', `[LauncherChef] Usando instalador NeoForge: ${installerPath}`);
        event.sender.send('progress', { type: 'setup', current: 30, total: 100, name: 'Instalador listo, iniciando Minecraft...' });
      } else if (modLoader === 'forge') {
        event.sender.send('progress', { type: 'setup', current: 10, total: 100, name: 'Descargando instalador de Forge...' });
        const installerPath = await ensureForgeInstaller(mcVersion, modLoaderVersion, event.sender);
        launchOpts.forge = installerPath;
        event.sender.send('log', `[LauncherChef] Usando instalador Forge: ${installerPath}`);
        event.sender.send('progress', { type: 'setup', current: 30, total: 100, name: 'Instalador listo, iniciando Minecraft...' });
      } else if (modLoader === 'fabric' || modLoader === 'quilt') {
        event.sender.send('progress', { type: 'setup', current: 10, total: 100, name: `Preparando ${modLoader}...` });
        const profile = await ensureLoaderProfile(sharedRoot, modLoader, mcVersion, modLoaderVersion);
        launchOpts.version.custom = profile.id;
        event.sender.send('log', `[LauncherChef] Usando ${modLoader} ${profile.version} (${profile.id})`);
      }

      // Auto-connect to server
      if (options.serverAddress) {
        const parts = options.serverAddress.split(':');
        launchOpts.server = {
          host: parts[0],
          port: parts[1] || '25565'
        };
      }

      // Remove old listeners to avoid duplicates
      launcher.removeAllListeners();

      // Progress events
      launcher.on('progress', (e) => {
        event.sender.send('progress', {
          type: e.type,
          task: e.task,
          total: e.total
        });
      });

      launcher.on('download-status', (e) => {
        event.sender.send('progress', {
          type: 'download',
          current: e.current,
          total: e.total,
          name: e.name
        });
      });

      launcher.on('debug', (msg) => {
        event.sender.send('log', msg);
      });

      launcher.on('data', (msg) => {
        event.sender.send('log', msg);
      });

      launcher.on('close', (code) => {
        event.sender.send('log', `[LauncherChef] Minecraft cerrado con codigo: ${code}`);
        event.sender.send('game:close');
      });

      // Launch!
      event.sender.send('log', `[LauncherChef] Lanzando...`);

      gameProcess = await launcher.launch(launchOpts);

      // Notify renderer that game has started (process is running)
      event.sender.send('game:start');

      // When process exits, clear reference
      if (gameProcess && gameProcess.on) {
        gameProcess.on('close', () => {
          gameProcess = null;
        });
      }

      return { success: true };
    } catch (err) {
      event.sender.send('log', `[ERROR] ${err.message}`);
      event.sender.send('log', `[ERROR] Stack: ${err.stack}`);
      gameProcess = null;
      event.sender.send('game:close');
      return { success: false, error: err.message };
    }
  });

  // Kill the running game process
  ipcMain.handle('mc:kill', async (event) => {
    try {
      if (gameProcess) {
        event.sender.send('log', '[LauncherChef] Cerrando Minecraft...');
        gameProcess.kill();
        gameProcess = null;
        return { success: true };
      }
      return { success: false, error: 'No hay juego en ejecucion' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
};
