const { Client, Authenticator } = require('minecraft-launcher-core');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const AdmZip = require('adm-zip');

module.exports = function (ipcMain, dataDir, configDir) {
  const launcher = new Client();
  const { execSync } = require('child_process');

  // Config directory (passed from main.js)
  const CONFIG_PATH = configDir || path.join(__dirname, '..', '..', 'config');

  // Directory where we store our own Java runtime
  const JAVA_DIR = path.join(dataDir, 'java');

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
   * Download and install Adoptium Java 21 JRE.
   * Downloads a ZIP from Adoptium API, extracts it to JAVA_DIR.
   * Returns the path to javaw.exe.
   */
  async function downloadJava21(sender) {
    const javaExe = path.join(JAVA_DIR, 'bin', 'javaw.exe');

    // Already downloaded?
    if (fs.existsSync(javaExe)) {
      sender.send('log', `[Java] Java 21 ya descargado: ${javaExe}`);
      return javaExe;
    }

    sender.send('log', '[Java] Java 21 no encontrado. Descargando automaticamente...');
    sender.send('progress', { type: 'java', current: 0, total: 100, name: 'Buscando Java 21...' });

    if (!fs.existsSync(JAVA_DIR)) {
      fs.mkdirSync(JAVA_DIR, { recursive: true });
    }

    try {
      // Use Adoptium API to get the latest Java 21 JRE for Windows x64
      const apiUrl = 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse';
      sender.send('log', '[Java] Consultando Adoptium API...');

      const assets = await fetchJSON(apiUrl);

      if (!assets || assets.length === 0) {
        throw new Error('No se encontraron releases de Java 21 en Adoptium');
      }

      const asset = assets[0];
      const downloadUrl = asset.binary?.package?.link;
      const fileName = asset.binary?.package?.name || 'jdk21-jre.zip';
      const fileSize = asset.binary?.package?.size || 0;

      if (!downloadUrl) {
        throw new Error('URL de descarga no disponible');
      }

      sender.send('log', `[Java] Descargando: ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);

      const zipPath = path.join(dataDir, 'java21-temp.zip');

      await downloadFile(downloadUrl, zipPath, (received, total) => {
        const pct = Math.round((received / total) * 100);
        sender.send('progress', {
          type: 'java',
          current: pct,
          total: 100,
          name: `Java 21: ${(received / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB`
        });
      });

      sender.send('log', '[Java] Extrayendo Java 21...');
      sender.send('progress', { type: 'java', current: 95, total: 100, name: 'Extrayendo Java 21...' });

      // Extract ZIP
      const zip = new AdmZip(zipPath);
      const tempExtractDir = path.join(dataDir, 'java21-temp-extract');

      if (fs.existsSync(tempExtractDir)) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }

      zip.extractAllTo(tempExtractDir, true);

      // The ZIP contains a folder like "jdk-21.0.x+y-jre" - find it and move contents to JAVA_DIR
      const extractedDirs = fs.readdirSync(tempExtractDir);
      const jdkDir = extractedDirs.find(d => d.startsWith('jdk-'));

      if (!jdkDir) {
        throw new Error('No se encontro carpeta JDK en el ZIP extraido');
      }

      const sourceDir = path.join(tempExtractDir, jdkDir);

      // Remove old JAVA_DIR if exists and recreate
      if (fs.existsSync(JAVA_DIR)) {
        fs.rmSync(JAVA_DIR, { recursive: true, force: true });
      }

      // Move extracted JDK to JAVA_DIR
      fs.renameSync(sourceDir, JAVA_DIR);

      // Clean up temp files
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      if (fs.existsSync(tempExtractDir)) {
        fs.rmSync(tempExtractDir, { recursive: true, force: true });
      }

      // Verify
      if (fs.existsSync(javaExe)) {
        sender.send('log', `[Java] ✓ Java 21 instalado correctamente: ${javaExe}`);
        sender.send('progress', { type: 'java', current: 100, total: 100, name: 'Java 21 listo!' });
        return javaExe;
      } else {
        throw new Error('javaw.exe no encontrado despues de la extraccion');
      }

    } catch (err) {
      sender.send('log', `[Java] ✗ Error descargando Java 21: ${err.message}`);
      // Try to fall back to system detection
      const fallback = autoDetectJava(sender);
      if (fallback) return fallback;
      throw new Error(`No se pudo obtener Java 21: ${err.message}. Instala Java 21 manualmente.`);
    }
  }

  /**
   * Auto-detect Java 21+ on the system.
   * Checks common locations: our own download, CurseForge, Program Files, JAVA_HOME, PATH.
   */
  function autoDetectJava(sender) {
    const candidates = [
      // LauncherChef's own Java (downloaded automatically)
      path.join(JAVA_DIR, 'bin', 'javaw.exe'),
      // CurseForge Java 21
      path.join(process.env.USERPROFILE || '', 'curseforge', 'minecraft', 'Install', 'java', 'Jre_21', 'bin', 'javaw.exe'),
      path.join(process.env.USERPROFILE || '', 'curseforge', 'minecraft', 'Install', 'java', 'Jre_21', 'bin', 'java.exe'),
      // CurseForge runtime delta
      path.join(process.env.USERPROFILE || '', 'curseforge', 'minecraft', 'Install', 'runtime', 'java-runtime-delta', 'windows-x64', 'java-runtime-delta', 'bin', 'javaw.exe'),
      // Adoptium / Temurin
      'C:\\Program Files\\Eclipse Adoptium\\jdk-21\\bin\\javaw.exe',
      'C:\\Program Files\\Eclipse Adoptium\\jre-21\\bin\\javaw.exe',
      // Oracle JDK
      'C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe',
      // Microsoft JDK
      'C:\\Program Files\\Microsoft\\jdk-21\\bin\\javaw.exe',
      // Minecraft Launcher runtime
      path.join(process.env.APPDATA || '', '.minecraft', 'runtime', 'java-runtime-delta', 'windows-x64', 'java-runtime-delta', 'bin', 'javaw.exe'),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        if (sender) sender.send('log', `[Java] Auto-detectado: ${candidate}`);
        return candidate;
      }
    }

    // Last resort: try system PATH
    try {
      execSync('"java" -version', { stdio: 'pipe' });
      if (sender) sender.send('log', '[Java] Usando java del PATH del sistema');
      return 'java';
    } catch {
      // No java found
    }

    return '';
  }

  /**
   * Get Java path - first try auto-detect, then auto-download.
   */
  async function ensureJava(sender) {
    // Check settings first
    const configPath = path.join(CONFIG_PATH, 'settings.json');
    try {
      if (fs.existsSync(configPath)) {
        const settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (settings.javaPath && fs.existsSync(settings.javaPath)) {
          sender.send('log', `[Java] Usando ruta de settings: ${settings.javaPath}`);
          return settings.javaPath;
        }
      }
    } catch { /* ignore */ }

    // Try auto-detect
    const detected = autoDetectJava(sender);
    if (detected) return detected;

    // Auto-download Java 21
    sender.send('log', '[Java] No se detecto Java en el sistema. Descargando automaticamente...');
    return await downloadJava21(sender);
  }

  /**
   * Ensure NeoForge installer is downloaded.
   */
  async function ensureNeoForgeInstaller(neoforgeVersion, instanceDir, sender) {
    const installersDir = path.join(dataDir, 'installers');
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

      // Ensure Java is available (auto-detect or auto-download)
      event.sender.send('log', '[LauncherChef] Verificando Java...');
      const javaPath = await ensureJava(event.sender);

      if (!javaPath) {
        throw new Error('No se pudo encontrar ni descargar Java 21. Ve a Ajustes e indica la ruta manualmente, o instala Java 21 desde https://adoptium.net');
      }

      // Instance directory per server
      const serverId = options.serverId || 'default';
      const instanceDir = path.join(dataDir, 'instances', serverId);

      if (!fs.existsSync(instanceDir)) {
        fs.mkdirSync(instanceDir, { recursive: true });
      }

      // Get auth
      let authObj;
      try {
        const authFile = path.join(CONFIG_PATH, 'auth.json');
        if (fs.existsSync(authFile)) {
          const authData = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
          if (authData.premium === false || !authData.mcToken) {
            authObj = Authenticator.getAuth(authData.name || 'Player');
          } else {
            authObj = {
              access_token: authData.mcToken,
              client_token: '',
              uuid: authData.uuid || authData.profile?.id || '',
              name: authData.name || authData.profile?.name || 'Player',
              user_properties: '{}'
            };
          }
        } else {
          authObj = Authenticator.getAuth(options.username || 'Player');
        }
      } catch {
        authObj = Authenticator.getAuth(options.username || 'Player');
      }

      // Determine mod loader
      const modLoader = options.modLoader || 'neoforge';
      const modLoaderVersion = options.modLoaderVersion || '21.1.219';
      const mcVersion = options.version || '1.21.1';

      event.sender.send('log', `[LauncherChef] Preparando Minecraft ${mcVersion} + ${modLoader} ${modLoaderVersion}`);
      event.sender.send('log', `[LauncherChef] Directorio: ${instanceDir}`);
      event.sender.send('log', `[LauncherChef] Java: ${javaPath}`);
      event.sender.send('log', `[LauncherChef] RAM: ${ramMin}M - ${ramMax}M`);
      event.sender.send('log', `[LauncherChef] Jugador: ${authObj.name}`);

      // Build launch options
      const launchOpts = {
        authorization: authObj,
        root: instanceDir,
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

      // Handle NeoForge / Forge
      if (modLoader === 'neoforge' || modLoader === 'forge') {
        event.sender.send('progress', { type: 'setup', current: 10, total: 100, name: 'Descargando instalador de NeoForge...' });

        const installerPath = await ensureNeoForgeInstaller(modLoaderVersion, instanceDir, event.sender);
        launchOpts.forge = installerPath;

        event.sender.send('log', `[LauncherChef] Usando instalador: ${installerPath}`);
        event.sender.send('progress', { type: 'setup', current: 30, total: 100, name: 'Instalador listo, iniciando Minecraft...' });
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
      event.sender.send('game:start');

      await launcher.launch(launchOpts);

      return { success: true };
    } catch (err) {
      event.sender.send('log', `[ERROR] ${err.message}`);
      event.sender.send('log', `[ERROR] Stack: ${err.stack}`);
      event.sender.send('game:close');
      return { success: false, error: err.message };
    }
  });
};
