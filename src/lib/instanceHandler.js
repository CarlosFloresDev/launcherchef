// ============================================
// LauncherChef - Instance Manager Handler
// ============================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { dialog, BrowserWindow } = require('electron');

module.exports = function (ipcMain, getDataDir, configDir) {
  const resolveDataDir = typeof getDataDir === 'function' ? getDataDir : () => getDataDir;
  const INSTANCES_FILE = path.join(configDir, 'instances.json');

  // ---- Helpers ----

  function loadInstances() {
    try {
      if (fs.existsSync(INSTANCES_FILE)) {
        return JSON.parse(fs.readFileSync(INSTANCES_FILE, 'utf-8'));
      }
    } catch { /* ignore */ }
    return [];
  }

  function saveInstances(instances) {
    fs.writeFileSync(INSTANCES_FILE, JSON.stringify(instances, null, 2));
  }

  function fetchJSON(url) {
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, { headers: { 'User-Agent': 'LauncherChef/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchJSON(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
  }

  // ---- IPC Handlers ----

  // List all instances
  ipcMain.handle('instances:list', async () => {
    return loadInstances();
  });

  // Create a new instance
  ipcMain.handle('instances:create', async (_e, opts) => {
    try {
      const id = crypto.randomUUID();
      const instanceDir = path.join(resolveDataDir(), 'instances', id);

      for (const sub of ['mods', 'shaderpacks', 'resourcepacks', 'config']) {
        fs.mkdirSync(path.join(instanceDir, sub), { recursive: true });
      }

      const instance = {
        id,
        name: opts.name,
        minecraft_version: opts.minecraft_version,
        mod_loader: opts.mod_loader || 'vanilla',
        mod_loader_version: opts.mod_loader_version || null,
        created: new Date().toISOString(),
        lastPlayed: null,
        icon: opts.icon || '🎮'
      };

      const all = loadInstances();
      all.push(instance);
      saveInstances(all);

      return { success: true, instance };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Delete an instance
  ipcMain.handle('instances:delete', async (_e, instanceId) => {
    try {
      const instanceDir = path.join(resolveDataDir(), 'instances', instanceId);
      if (fs.existsSync(instanceDir)) {
        fs.rmSync(instanceDir, { recursive: true, force: true });
      }
      const all = loadInstances().filter(i => i.id !== instanceId);
      saveInstances(all);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Get contents of a subfolder (mods, shaderpacks, resourcepacks)
  ipcMain.handle('instances:getContents', async (_e, { instanceId, subfolder }) => {
    try {
      const dir = path.join(resolveDataDir(), 'instances', instanceId, subfolder);
      if (!fs.existsSync(dir)) return [];

      const validExts = subfolder === 'mods' ? ['.jar'] : ['.zip', '.jar'];
      return fs.readdirSync(dir)
        .filter(f => validExts.some(ext => f.toLowerCase().endsWith(ext)))
        .map(f => {
          const stats = fs.statSync(path.join(dir, f));
          return { filename: f, size: stats.size, modified: stats.mtime };
        })
        .sort((a, b) => a.filename.localeCompare(b.filename));
    } catch {
      return [];
    }
  });

  // Add files via file picker
  ipcMain.handle('instances:addFiles', async (_e, { instanceId, subfolder }) => {
    try {
      const isMods = subfolder === 'mods';
      const filters = isMods
        ? [{ name: 'Mods (.jar)', extensions: ['jar'] }]
        : [{ name: 'Packs (.zip)', extensions: ['zip'] }];

      const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
        title: `Agregar archivos a ${subfolder}`,
        filters,
        properties: ['openFile', 'multiSelections']
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, canceled: true };
      }

      const destDir = path.join(resolveDataDir(), 'instances', instanceId, subfolder);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

      const added = [];
      for (const src of result.filePaths) {
        const name = path.basename(src);
        fs.copyFileSync(src, path.join(destDir, name));
        added.push(name);
      }
      return { success: true, added };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Remove a file from a subfolder
  ipcMain.handle('instances:removeFile', async (_e, { instanceId, subfolder, filename }) => {
    try {
      const filePath = path.join(resolveDataDir(), 'instances', instanceId, subfolder, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return { success: true };
      }
      return { success: false, error: 'Archivo no encontrado' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Fetch available loader versions for a given MC version
  ipcMain.handle('instances:getLoaderVersions', async (_e, { mcVersion, loader }) => {
    try {
      if (loader === 'fabric') {
        const data = await fetchJSON(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`);
        return data.slice(0, 25).map(entry => ({
          version: entry.loader.version,
          stable: entry.loader.stable !== false
        }));
      }

      if (loader === 'neoforge') {
        const data = await fetchJSON(
          'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge'
        );
        // Filter versions matching MC version pattern (e.g., "1.21.1" -> "21.1")
        const parts = mcVersion.split('.');
        const mcMinor = parts.length >= 3 ? parts[1] + '.' + parts[2] : parts[1];
        const filtered = (data.versions || [])
          .filter(v => v.startsWith(mcMinor))
          .reverse()
          .slice(0, 25);
        return filtered.map(v => ({ version: v, stable: true }));
      }

      if (loader === 'forge') {
        const data = await fetchJSON(
          'https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json'
        );
        // data is { "1.21.1": ["1.21.1-49.0.3", ...], ... }
        const versions = data[mcVersion] || [];
        return versions.slice(-25).reverse().map(v => {
          const forgeVer = v.includes('-') ? v.split('-')[1] : v;
          return { version: forgeVer, stable: true };
        });
      }

      return [];
    } catch (err) {
      console.log(`[Instances] Error fetching loader versions: ${err.message}`);
      return [];
    }
  });

  // Update lastPlayed timestamp
  ipcMain.handle('instances:updateLastPlayed', async (_e, instanceId) => {
    const all = loadInstances();
    const instance = all.find(i => i.id === instanceId);
    if (instance) {
      instance.lastPlayed = new Date().toISOString();
      saveInstances(all);
    }
    return { success: true };
  });

  // Auto-create instance from a server (linked instance)
  ipcMain.handle('instances:createFromServer', async (_e, opts) => {
    try {
      const all = loadInstances();

      // Check if already linked
      const existing = all.find(i => i.serverLinked === opts.serverId);
      if (existing) {
        // Update server info in case it changed
        let changed = false;
        if (existing.name !== opts.serverName) { existing.name = opts.serverName; changed = true; }
        if (existing.minecraft_version !== opts.mcVersion) { existing.minecraft_version = opts.mcVersion; changed = true; }
        if (existing.mod_loader !== opts.modLoader) { existing.mod_loader = opts.modLoader; changed = true; }
        if (existing.mod_loader_version !== opts.modLoaderVersion) { existing.mod_loader_version = opts.modLoaderVersion; changed = true; }
        if (existing.serverAddress !== opts.serverAddress) { existing.serverAddress = opts.serverAddress; changed = true; }
        if (changed) saveInstances(all);
        return { success: true, instance: existing, created: false };
      }

      // Create directories (shaderpacks & resourcepacks are new for servers)
      const instanceDir = path.join(resolveDataDir(), 'instances', opts.serverId);
      for (const sub of ['mods', 'shaderpacks', 'resourcepacks', 'config']) {
        fs.mkdirSync(path.join(instanceDir, sub), { recursive: true });
      }

      const instance = {
        id: opts.serverId,
        name: opts.serverName,
        minecraft_version: opts.mcVersion,
        mod_loader: opts.modLoader || 'vanilla',
        mod_loader_version: opts.modLoaderVersion || null,
        created: new Date().toISOString(),
        lastPlayed: null,
        icon: opts.icon || '🖥️',
        serverLinked: opts.serverId,
        serverAddress: opts.serverAddress || null
      };

      all.push(instance);
      saveInstances(all);

      return { success: true, instance, created: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
};
