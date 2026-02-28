// ============================================
// LauncherChef - GitHub Mod Upload Handler
// ============================================
// Handles uploading mods to GitHub Releases
// and updating distribution.json in the repo.

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

module.exports = function (ipcMain, getDataDir, configDir) {
  const { dialog, BrowserWindow } = require('electron');

  // ============================================
  // Helpers
  // ============================================

  /**
   * Generic GitHub API HTTPS request.
   * Supports api.github.com and uploads.github.com.
   */
  function githubApiRequest(method, hostname, apiPath, token, body, contentType) {
    return new Promise((resolve, reject) => {
      const isBuffer = Buffer.isBuffer(body);
      const bodyData = isBuffer ? body : (body ? JSON.stringify(body) : null);

      const options = {
        hostname,
        path: apiPath,
        method,
        headers: {
          'User-Agent': 'LauncherChef/1.0',
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      if (bodyData) {
        options.headers['Content-Type'] = contentType || 'application/json';
        options.headers['Content-Length'] = isBuffer ? body.length : Buffer.byteLength(bodyData, 'utf-8');
      }

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let parsed = null;
          try {
            if (data) parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ statusCode: res.statusCode, data: parsed });
        });
      });

      req.on('error', reject);

      if (bodyData) {
        req.write(bodyData);
      }
      req.end();
    });
  }

  /**
   * SHA-256 hash of a file (streaming).
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
   * Clean mod name from filename.
   * Ported from tools/generate-manifest.js
   */
  function cleanModName(filename) {
    let name = filename
      .replace(/\.jar$/, '')
      .replace(/[-_]neoforge/i, '')
      .replace(/[-_]forge/i, '')
      .replace(/[-_]fabric/i, '')
      .replace(/[-_]mc[\d.]+/i, '')
      .replace(/[-_][\d.]+\+.*$/, '')
      .replace(/[-_][\d.]+$/, '')
      .replace(/[-_]merged/, '')
      .replace(/^\[.*?\]\s*/, '')
      .replace(/[-_]/g, ' ')
      .trim();
    name = name.replace(/\b\w/g, c => c.toUpperCase());
    return name || filename.replace(/\.jar$/, '');
  }

  // ============================================
  // IPC Handlers
  // ============================================

  /**
   * Select .jar files for upload. Returns file info with hash and size.
   */
  ipcMain.handle('github:selectMods', async () => {
    try {
      const result = await dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), {
        title: 'Seleccionar mods (.jar) para subir a GitHub',
        filters: [{ name: 'Mods (.jar)', extensions: ['jar'] }],
        properties: ['openFile', 'multiSelections']
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, canceled: true };
      }

      const files = [];
      for (const filePath of result.filePaths) {
        const stats = fs.statSync(filePath);
        const sha256 = await hashFile(filePath);
        files.push({
          path: filePath,
          filename: path.basename(filePath),
          name: cleanModName(path.basename(filePath)),
          size: stats.size,
          sha256
        });
      }

      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  /**
   * Test a GitHub token by calling GET /user.
   */
  ipcMain.handle('github:testToken', async (_event, token) => {
    try {
      if (!token) return { success: false, error: 'Token vacio' };

      const res = await githubApiRequest('GET', 'api.github.com', '/user', token);
      if (res.statusCode === 200 && res.data.login) {
        return { success: true, username: res.data.login };
      }
      return { success: false, error: `HTTP ${res.statusCode}: ${res.data.message || 'Token invalido'}` };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  /**
   * Full upload flow:
   * 1. Get or create release by tag
   * 2. Upload .jar files as release assets
   * 3. Update distribution.json in the repo
   */
  ipcMain.handle('github:upload', async (event, options) => {
    const { token, owner, repo, tag, serverId, files } = options;

    if (!token || !owner || !repo || !tag) {
      return { success: false, error: 'Faltan campos de configuracion de GitHub (token, owner, repo, tag)' };
    }
    if (!files || files.length === 0) {
      return { success: false, error: 'No hay archivos para subir' };
    }

    const sender = event.sender;
    let uploadedCount = 0;

    try {
      // ========================================
      // Step 1: Get or create the release
      // ========================================
      sender.send('log', `[GitHub] Buscando release con tag: ${tag}...`);
      sender.send('progress', { type: 'github-upload', current: 0, total: files.length + 2, name: 'Buscando release...' });

      let release;
      const releaseRes = await githubApiRequest(
        'GET', 'api.github.com',
        `/repos/${owner}/${repo}/releases/tags/${tag}`,
        token
      );

      if (releaseRes.statusCode === 200) {
        release = releaseRes.data;
        sender.send('log', `[GitHub] Release encontrado: ${release.name || tag} (${release.assets.length} assets)`);
      } else if (releaseRes.statusCode === 404) {
        sender.send('log', `[GitHub] Release no existe, creando: ${tag}...`);
        const createRes = await githubApiRequest(
          'POST', 'api.github.com',
          `/repos/${owner}/${repo}/releases`,
          token,
          { tag_name: tag, name: tag, body: 'Mods uploaded via LauncherChef', draft: false, prerelease: false }
        );
        if (createRes.statusCode !== 201) {
          return { success: false, error: `No se pudo crear el release: HTTP ${createRes.statusCode} - ${createRes.data.message || ''}` };
        }
        release = createRes.data;
        sender.send('log', `[GitHub] Release creado: ${tag}`);
      } else {
        return { success: false, error: `Error obteniendo release: HTTP ${releaseRes.statusCode} - ${releaseRes.data.message || ''}` };
      }

      // Build map of existing assets for duplicate detection
      const existingAssets = {};
      if (release.assets) {
        for (const asset of release.assets) {
          existingAssets[asset.name] = asset.id;
        }
      }

      // ========================================
      // Step 2: Upload each .jar to the release
      // ========================================
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        sender.send('log', `[GitHub] Subiendo (${i + 1}/${files.length}): ${file.filename}`);
        sender.send('progress', {
          type: 'github-upload',
          current: i + 1,
          total: files.length + 2,
          name: `Subiendo: ${file.filename}`
        });

        // Delete existing asset with same name (re-upload)
        if (existingAssets[file.filename]) {
          sender.send('log', `[GitHub] Asset existente, eliminando para re-subir: ${file.filename}`);
          await githubApiRequest(
            'DELETE', 'api.github.com',
            `/repos/${owner}/${repo}/releases/assets/${existingAssets[file.filename]}`,
            token
          );
        }

        // Read file buffer
        const fileBuffer = fs.readFileSync(file.path);

        // Upload asset
        const encodedName = encodeURIComponent(file.filename);
        const uploadRes = await githubApiRequest(
          'POST', 'uploads.github.com',
          `/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodedName}`,
          token,
          fileBuffer,
          'application/java-archive'
        );

        if (uploadRes.statusCode === 201) {
          sender.send('log', `[GitHub] ✓ Subido: ${file.filename}`);
          uploadedCount++;
        } else {
          sender.send('log', `[GitHub] ✗ Error subiendo ${file.filename}: HTTP ${uploadRes.statusCode} - ${uploadRes.data.message || ''}`);
        }
      }

      // ========================================
      // Step 3: Get current distribution.json
      // ========================================
      sender.send('log', '[GitHub] Obteniendo distribution.json del repositorio...');
      sender.send('progress', {
        type: 'github-upload',
        current: files.length + 1,
        total: files.length + 2,
        name: 'Actualizando distribution.json...'
      });

      const contentsRes = await githubApiRequest(
        'GET', 'api.github.com',
        `/repos/${owner}/${repo}/contents/distribution.json`,
        token
      );

      let distribution;
      let fileSha;

      if (contentsRes.statusCode === 200) {
        // Decode base64 content
        const content = Buffer.from(contentsRes.data.content, 'base64').toString('utf-8');
        distribution = JSON.parse(content);
        fileSha = contentsRes.data.sha;
        sender.send('log', `[GitHub] distribution.json encontrado (${distribution.servers?.length || 0} servidores)`);
      } else if (contentsRes.statusCode === 404) {
        // Create new distribution.json
        sender.send('log', '[GitHub] distribution.json no existe, creando nuevo...');
        distribution = {
          launcher_version: '1.0.0',
          generated_at: new Date().toISOString(),
          servers: []
        };
        fileSha = null;
      } else {
        return {
          success: false,
          error: `Error obteniendo distribution.json: HTTP ${contentsRes.statusCode}`
        };
      }

      // ========================================
      // Step 4: Merge new mods into distribution
      // ========================================
      let targetServer = null;
      if (serverId && distribution.servers) {
        targetServer = distribution.servers.find(s => s.id === serverId);
      }
      if (!targetServer && distribution.servers && distribution.servers.length > 0) {
        targetServer = distribution.servers[0];
      }

      if (!targetServer) {
        return {
          success: false,
          error: 'No se encontro el servidor destino en distribution.json. Agrega al menos un servidor primero.'
        };
      }

      if (!targetServer.mods) {
        targetServer.mods = [];
      }

      // Add or update mod entries
      const baseUrl = `https://github.com/${owner}/${repo}/releases/download/${tag}`;

      for (const file of files) {
        const modEntry = {
          name: file.name,
          filename: file.filename,
          url: `${baseUrl}/${encodeURIComponent(file.filename)}`,
          sha256: file.sha256,
          size: file.size,
          required: true
        };

        // Check if mod already exists (by filename), replace or add
        const existingIndex = targetServer.mods.findIndex(m => m.filename === file.filename);
        if (existingIndex >= 0) {
          targetServer.mods[existingIndex] = modEntry;
          sender.send('log', `[GitHub] Mod actualizado en distribution.json: ${file.name}`);
        } else {
          targetServer.mods.push(modEntry);
          sender.send('log', `[GitHub] Mod agregado a distribution.json: ${file.name}`);
        }
      }

      // Sort mods alphabetically
      targetServer.mods.sort((a, b) => a.name.localeCompare(b.name));

      // Update timestamp and mod count in description
      distribution.generated_at = new Date().toISOString();
      targetServer.description = `${targetServer.name} - ${targetServer.mods.length} mods con ${targetServer.mod_loader} ${targetServer.mod_loader_version}`;

      // ========================================
      // Step 5: Push updated distribution.json
      // ========================================
      sender.send('log', '[GitHub] Actualizando distribution.json en el repositorio...');

      const newContent = Buffer.from(JSON.stringify(distribution, null, 2), 'utf-8').toString('base64');

      const updateBody = {
        message: `Update distribution.json - ${uploadedCount} mod(s) via LauncherChef`,
        content: newContent
      };

      // Include sha if updating existing file
      if (fileSha) {
        updateBody.sha = fileSha;
      }

      const updateRes = await githubApiRequest(
        'PUT', 'api.github.com',
        `/repos/${owner}/${repo}/contents/distribution.json`,
        token,
        updateBody
      );

      if (updateRes.statusCode === 200 || updateRes.statusCode === 201) {
        sender.send('log', `[GitHub] ✓ distribution.json actualizado correctamente`);
      } else {
        sender.send('log', `[GitHub] ✗ Error actualizando distribution.json: HTTP ${updateRes.statusCode} - ${updateRes.data.message || ''}`);
        return {
          success: false,
          error: `Error actualizando distribution.json: HTTP ${updateRes.statusCode} - ${updateRes.data.message || ''}`
        };
      }

      // ========================================
      // Done!
      // ========================================
      sender.send('progress', {
        type: 'github-upload',
        current: files.length + 2,
        total: files.length + 2,
        name: 'Completado!'
      });

      sender.send('log', `[GitHub] ✓ Subida completada: ${uploadedCount}/${files.length} archivos subidos, distribution.json actualizado`);

      return {
        success: true,
        uploaded: uploadedCount,
        total: files.length
      };

    } catch (err) {
      sender.send('log', `[GitHub] ✗ Error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // ============================================
  // Fetch Mods from GitHub
  // ============================================

  /**
   * Fetch mods from distribution.json on GitHub for a specific server.
   * Returns the list of mods + file SHA (needed for updates).
   */
  ipcMain.handle('github:fetchMods', async (_event, options) => {
    const { token, owner, repo, serverId, tag } = options;

    if (!token || !owner || !repo) {
      return { success: false, error: 'Faltan campos de configuracion de GitHub' };
    }

    try {
      // Get distribution.json from repo
      const res = await githubApiRequest(
        'GET', 'api.github.com',
        `/repos/${owner}/${repo}/contents/distribution.json`,
        token
      );

      if (res.statusCode !== 200) {
        return { success: false, error: `No se encontro distribution.json: HTTP ${res.statusCode}` };
      }

      const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
      const distribution = JSON.parse(content);
      const fileSha = res.data.sha;

      // Find the target server
      let targetServer = null;
      if (serverId && distribution.servers) {
        targetServer = distribution.servers.find(s => s.id === serverId);
      }

      if (!targetServer) {
        return { success: false, error: 'Servidor no encontrado en distribution.json' };
      }

      // Also get release assets to map mod filenames to asset IDs
      const releaseTag = tag || 'v1';
      let assetMap = {};
      const releaseRes = await githubApiRequest(
        'GET', 'api.github.com',
        `/repos/${owner}/${repo}/releases/tags/${releaseTag}`,
        token
      );

      if (releaseRes.statusCode === 200 && releaseRes.data.assets) {
        for (const asset of releaseRes.data.assets) {
          assetMap[asset.name] = asset.id;
        }
      }

      // Enrich mods with asset IDs
      const mods = (targetServer.mods || []).map(mod => ({
        ...mod,
        assetId: assetMap[mod.filename] || null
      }));

      return {
        success: true,
        mods,
        fileSha,
        serverName: targetServer.name,
        serverId: targetServer.id
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // ============================================
  // Delete Mod from GitHub
  // ============================================

  /**
   * Delete a mod from GitHub:
   * 1. Delete the release asset (if exists)
   * 2. Remove from distribution.json and push update
   */
  ipcMain.handle('github:deleteMod', async (event, options) => {
    const { token, owner, repo, serverId, modFilename, assetId } = options;

    if (!token || !owner || !repo || !modFilename) {
      return { success: false, error: 'Faltan parametros para eliminar el mod' };
    }

    const sender = event.sender;

    try {
      // Step 1: Delete the release asset if we have an asset ID
      if (assetId) {
        sender.send('log', `[GitHub] Eliminando asset del release: ${modFilename}...`);
        const deleteRes = await githubApiRequest(
          'DELETE', 'api.github.com',
          `/repos/${owner}/${repo}/releases/assets/${assetId}`,
          token
        );
        if (deleteRes.statusCode === 204) {
          sender.send('log', `[GitHub] Asset eliminado: ${modFilename}`);
        } else {
          sender.send('log', `[GitHub] No se pudo eliminar asset: HTTP ${deleteRes.statusCode}`);
        }
      }

      // Step 2: Get current distribution.json (fresh copy for latest SHA)
      sender.send('log', '[GitHub] Actualizando distribution.json...');
      const contentsRes = await githubApiRequest(
        'GET', 'api.github.com',
        `/repos/${owner}/${repo}/contents/distribution.json`,
        token
      );

      if (contentsRes.statusCode !== 200) {
        return { success: false, error: `No se encontro distribution.json: HTTP ${contentsRes.statusCode}` };
      }

      const content = Buffer.from(contentsRes.data.content, 'base64').toString('utf-8');
      const distribution = JSON.parse(content);
      const currentSha = contentsRes.data.sha;

      // Step 3: Find server and remove mod
      let targetServer = null;
      if (serverId && distribution.servers) {
        targetServer = distribution.servers.find(s => s.id === serverId);
      }
      if (!targetServer || !targetServer.mods) {
        return { success: false, error: 'Servidor no encontrado en distribution.json' };
      }

      const beforeCount = targetServer.mods.length;
      targetServer.mods = targetServer.mods.filter(m => m.filename !== modFilename);
      const afterCount = targetServer.mods.length;

      if (beforeCount === afterCount) {
        sender.send('log', `[GitHub] Mod no encontrado en distribution.json: ${modFilename}`);
      }

      // Update metadata
      distribution.generated_at = new Date().toISOString();
      targetServer.description = `${targetServer.name} - ${targetServer.mods.length} mods con ${targetServer.mod_loader} ${targetServer.mod_loader_version}`;

      // Step 4: Push updated distribution.json
      const newContent = Buffer.from(JSON.stringify(distribution, null, 2), 'utf-8').toString('base64');
      const updateRes = await githubApiRequest(
        'PUT', 'api.github.com',
        `/repos/${owner}/${repo}/contents/distribution.json`,
        token,
        {
          message: `Remove mod: ${modFilename} via LauncherChef`,
          content: newContent,
          sha: currentSha
        }
      );

      if (updateRes.statusCode === 200 || updateRes.statusCode === 201) {
        sender.send('log', `[GitHub] Mod eliminado de distribution.json: ${modFilename}`);
        return {
          success: true,
          newFileSha: updateRes.data.content ? updateRes.data.content.sha : null,
          remainingMods: targetServer.mods.length
        };
      } else {
        return {
          success: false,
          error: `Error actualizando distribution.json: HTTP ${updateRes.statusCode} - ${updateRes.data.message || ''}`
        };
      }
    } catch (err) {
      sender.send('log', `[GitHub] Error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });
};
