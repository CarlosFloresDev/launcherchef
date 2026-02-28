const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

module.exports = function (ipcMain, getDataDir) {

  // Support both function (dynamic) and string (legacy) for dataDir
  const resolveDataDir = typeof getDataDir === 'function' ? getDataDir : () => getDataDir;

  /**
   * Properly encode a URL, handling special characters in path segments.
   * Fixes issues with spaces, parentheses, brackets etc. in filenames.
   */
  function safeEncodeUrl(url) {
    try {
      const parsed = new URL(url);
      // Re-encode each path segment properly
      parsed.pathname = parsed.pathname.split('/').map(segment => {
        if (!segment) return segment;
        try {
          // Decode first (handle already-encoded parts like %20, %2B)
          const decoded = decodeURIComponent(segment);
          return encodeURIComponent(decoded);
        } catch {
          return encodeURIComponent(segment);
        }
      }).join('/');
      return parsed.toString();
    } catch {
      // If URL parsing fails, return as-is
      return url;
    }
  }

  /**
   * Downloads a file from a URL to a local path.
   * Properly handles URLs with special characters.
   * Returns a promise that resolves when done.
   */
  function downloadFile(url, destPath, onProgress) {
    return new Promise((resolve, reject) => {
      const encodedUrl = safeEncodeUrl(url);
      const proto = encodedUrl.startsWith('https') ? https : http;
      const file = fs.createWriteStream(destPath);

      proto.get(encodedUrl, { headers: { 'User-Agent': 'LauncherChef/1.0' } }, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          return downloadFile(response.headers.location, destPath, onProgress).then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
          return reject(new Error(`HTTP ${response.statusCode} descargando ${path.basename(destPath)}`));
        }

        const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
        let received = 0;

        response.on('data', (chunk) => {
          received += chunk.length;
          if (onProgress && totalBytes > 0) {
            onProgress(received, totalBytes);
          }
        });

        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(err);
      });
    });
  }

  /**
   * Computes SHA-256 hash of a file.
   */
  function hashFile(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Fetches JSON from a URL.
   */
  function fetchJSON(url) {
    return new Promise((resolve, reject) => {
      const proto = url.startsWith('https') ? https : http;
      proto.get(url, { headers: { 'User-Agent': 'LauncherChef/1.0' } }, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchJSON(res.headers.location).then(resolve).catch(reject);
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('JSON invalido del servidor de distribucion'));
          }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  /**
   * Download and extract a configs ZIP to the instance config directory.
   * The ZIP should contain the config folder structure.
   */
  async function syncConfigs(configsUrl, instanceDir, sender) {
    if (!configsUrl) return { synced: false, reason: 'No configs URL' };

    const configDir = path.join(instanceDir, 'config');
    const tempZip = path.join(resolveDataDir(), 'temp_configs.zip');

    try {
      // Check if configs already exist (skip if config dir has files)
      if (fs.existsSync(configDir)) {
        const existingFiles = fs.readdirSync(configDir);
        if (existingFiles.length > 50) {
          sender.send('log', `[ConfigSync] Configs ya existen (${existingFiles.length} archivos), verificando...`);
          // Configs already exist, skip download unless forced
          return { synced: true, reason: 'already-exists', count: existingFiles.length };
        }
      }

      sender.send('log', `[ConfigSync] Descargando configs...`);
      sender.send('progress', { type: 'config-sync', current: 0, total: 100, name: 'Descargando configuraciones...' });

      await downloadFile(configsUrl, tempZip, (received, total) => {
        const pct = Math.round((received / total) * 100);
        sender.send('progress', {
          type: 'config-sync',
          current: pct,
          total: 100,
          name: `Configs: ${(received / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB`
        });
      });

      sender.send('log', '[ConfigSync] Extrayendo configuraciones...');
      sender.send('progress', { type: 'config-sync', current: 90, total: 100, name: 'Extrayendo configuraciones...' });

      // Extract ZIP
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const zip = new AdmZip(tempZip);
      zip.extractAllTo(configDir, true); // overwrite = true

      // Clean up temp file
      if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);

      const configCount = fs.readdirSync(configDir).length;
      sender.send('log', `[ConfigSync] ✓ ${configCount} configuraciones extraidas`);
      sender.send('progress', { type: 'config-sync', current: 100, total: 100, name: 'Configuraciones listas!' });

      return { synced: true, count: configCount };
    } catch (err) {
      if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
      sender.send('log', `[ConfigSync] ✗ Error: ${err.message}`);
      return { synced: false, error: err.message };
    }
  }

  /**
   * Sync mods (and configs) for a server configuration.
   */
  ipcMain.handle('mods:sync', async (event, serverConfig) => {
    try {
      const instanceDir = path.join(resolveDataDir(), 'instances', serverConfig.id);
      const modsDir = path.join(instanceDir, 'mods');

      // Ensure directories
      if (!fs.existsSync(modsDir)) {
        fs.mkdirSync(modsDir, { recursive: true });
      }

      // Get the target mod list (from manifest or inline)
      let targetMods;
      let configsUrl = serverConfig.configsUrl || null;

      if (serverConfig.manifestUrl) {
        event.sender.send('log', `[ModSync] Descargando manifiesto: ${serverConfig.manifestUrl}`);
        const manifest = await fetchJSON(serverConfig.manifestUrl);
        targetMods = manifest.mods || [];

        // Get configs URL from manifest if available
        if (manifest.servers && manifest.servers[0]) {
          configsUrl = configsUrl || manifest.servers[0].configsUrl;
        }
        if (manifest.configsUrl) {
          configsUrl = configsUrl || manifest.configsUrl;
        }
      } else {
        targetMods = serverConfig.mods || [];
      }

      event.sender.send('log', `[ModSync] ${targetMods.length} mods en el manifiesto`);

      // === SYNC CONFIGS FIRST ===
      if (configsUrl) {
        await syncConfigs(configsUrl, instanceDir, event.sender);
      }

      // === SYNC MODS ===
      // Get currently installed mods
      const installedFiles = fs.readdirSync(modsDir)
        .filter(f => f.endsWith('.jar'));

      // Build a set of target filenames
      const targetFilenames = new Set(targetMods.map(m => m.filename));

      // 1. Remove mods that are NOT in the target list
      const toRemove = installedFiles.filter(f => !targetFilenames.has(f));
      for (const file of toRemove) {
        event.sender.send('log', `[ModSync] Eliminando mod obsoleto: ${file}`);
        fs.unlinkSync(path.join(modsDir, file));
      }

      // 2. Download/verify mods that SHOULD be there
      const results = { downloaded: 0, verified: 0, removed: toRemove.length, errors: [] };
      const total = targetMods.length;

      for (let i = 0; i < targetMods.length; i++) {
        const mod = targetMods[i];
        const modPath = path.join(modsDir, mod.filename);

        event.sender.send('progress', {
          type: 'mod-sync',
          current: i + 1,
          total: total,
          name: mod.name || mod.filename
        });

        try {
          if (fs.existsSync(modPath)) {
            // Verify hash if provided
            if (mod.sha256) {
              const localHash = await hashFile(modPath);
              if (localHash === mod.sha256) {
                results.verified++;
                continue;
              } else {
                event.sender.send('log', `[ModSync] Hash diferente, re-descargando: ${mod.filename}`);
                fs.unlinkSync(modPath);
              }
            } else {
              // No hash to verify, assume it's fine
              results.verified++;
              continue;
            }
          }

          // Download the mod
          if (!mod.url) {
            throw new Error('No URL proporcionada');
          }

          event.sender.send('log', `[ModSync] Descargando: ${mod.name || mod.filename}`);
          await downloadFile(mod.url, modPath);

          // Verify after download
          if (mod.sha256) {
            const downloadedHash = await hashFile(modPath);
            if (downloadedHash !== mod.sha256) {
              fs.unlinkSync(modPath);
              throw new Error(`Hash no coincide para ${mod.filename}`);
            }
          }

          results.downloaded++;
          event.sender.send('log', `[ModSync] ✓ Descargado: ${mod.filename}`);
        } catch (err) {
          results.errors.push({ mod: mod.filename, error: err.message });
          event.sender.send('log', `[ModSync] ✗ Error con ${mod.filename}: ${err.message}`);
        }
      }

      event.sender.send('log',
        `[ModSync] Completado: ${results.downloaded} descargados, ` +
        `${results.verified} verificados, ${results.removed} eliminados, ` +
        `${results.errors.length} errores`
      );

      return { success: true, results };
    } catch (err) {
      event.sender.send('log', `[ModSync] Error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // Get locally installed mods
  ipcMain.handle('mods:getLocal', async (_event, instanceId) => {
    try {
      const modsDir = path.join(resolveDataDir(), 'instances', instanceId, 'mods');
      if (!fs.existsSync(modsDir)) return [];

      const files = fs.readdirSync(modsDir).filter(f => f.endsWith('.jar'));
      return files.map(f => {
        const stats = fs.statSync(path.join(modsDir, f));
        return {
          filename: f,
          size: stats.size,
          modified: stats.mtime
        };
      });
    } catch {
      return [];
    }
  });

  // Remove a specific mod
  ipcMain.handle('mods:remove', async (event, modPath) => {
    try {
      if (fs.existsSync(modPath) && modPath.endsWith('.jar')) {
        fs.unlinkSync(modPath);
        event.sender.send('log', `[ModSync] Mod eliminado: ${path.basename(modPath)}`);
        return { success: true };
      }
      return { success: false, error: 'Archivo no encontrado' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
};
