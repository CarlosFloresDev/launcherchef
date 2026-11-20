// ============================================
// LauncherChef - Modrinth integration
// Search mods, resource packs, shaders and modpacks; install them into an instance with their
// required dependencies; and create instances from .mrpack modpacks.
// API docs: https://docs.modrinth.com/api/
// ============================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { fetchJSON, downloadFile, pool } = require('./net');

const API = 'https://api.modrinth.com/v2';

const FOLDER_BY_TYPE = {
  mod: 'mods',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks',
  datapack: 'datapacks',
};

function facetsFor({ projectType, mcVersion, loader }) {
  const facets = [[`project_type:${projectType || 'mod'}`]];
  if (mcVersion) facets.push([`versions:${mcVersion}`]);
  // Loaders only apply to mods; vanilla instances can still use resource packs and shaders.
  if ((projectType || 'mod') === 'mod' && loader && loader !== 'vanilla') facets.push([`categories:${loader}`]);
  return JSON.stringify(facets);
}

async function search({ query = '', projectType = 'mod', mcVersion, loader, offset = 0, limit = 20, sort = 'relevance' }) {
  const params = new URLSearchParams({
    query,
    facets: facetsFor({ projectType, mcVersion, loader }),
    index: sort,
    offset: String(offset),
    limit: String(limit),
  });
  const res = await fetchJSON(`${API}/search?${params}`);
  return {
    total: res.total_hits,
    hits: res.hits.map((h) => ({
      id: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      author: h.author,
      icon: h.icon_url,
      downloads: h.downloads,
      follows: h.follows,
      categories: h.display_categories || h.categories,
      type: h.project_type,
      updated: h.date_modified,
    })),
  };
}

/** Best version of a project for the instance: newest release that matches version and loader. */
async function pickVersion(projectId, { mcVersion, loader, projectType }) {
  const params = new URLSearchParams();
  if (mcVersion) params.set('game_versions', JSON.stringify([mcVersion]));
  if (projectType === 'mod' && loader && loader !== 'vanilla') {
    // Quilt can load most Fabric mods.
    params.set('loaders', JSON.stringify(loader === 'quilt' ? ['quilt', 'fabric'] : [loader]));
  }
  const versions = await fetchJSON(`${API}/project/${projectId}/version?${params}`);
  if (!versions.length) return null;
  return versions.find((v) => v.version_type === 'release') || versions[0];
}

function primaryFile(version) {
  return version.files.find((f) => f.primary) || version.files[0];
}

module.exports = function (ipcMain, getDataDir, configDir) {
  const resolveDataDir = typeof getDataDir === 'function' ? getDataDir : () => getDataDir;
  const instancesFile = path.join(configDir, 'instances.json');
  const instanceDir = (id) => path.join(resolveDataDir(), 'instances', id);

  function loadInstances() {
    try {
      return JSON.parse(fs.readFileSync(instancesFile, 'utf8'));
    } catch {
      return [];
    }
  }

  ipcMain.handle('modrinth:search', async (_e, opts) => {
    try {
      return { success: true, ...(await search(opts || {})) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('modrinth:project', async (_e, idOrSlug) => {
    try {
      const p = await fetchJSON(`${API}/project/${encodeURIComponent(idOrSlug)}`);
      return {
        success: true,
        project: {
          id: p.id,
          title: p.title,
          description: p.description,
          body: p.body,
          icon: p.icon_url,
          downloads: p.downloads,
          gallery: (p.gallery || []).map((g) => g.url),
          source: p.source_url,
          wiki: p.wiki_url,
          discord: p.discord_url,
          gameVersions: p.game_versions,
          loaders: p.loaders,
          type: p.project_type,
        },
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  /**
   * Installs a project into an instance, resolving required dependencies recursively.
   * Returns the list of installed files.
   */
  ipcMain.handle('modrinth:install', async (event, { instanceId, projectId, projectType = 'mod' }) => {
    const send = (msg) => event.sender.send('log', `[Modrinth] ${msg}`);
    try {
      const inst = loadInstances().find((i) => i.id === instanceId);
      if (!inst) throw new Error('Instancia no encontrada');
      const ctx = { mcVersion: inst.minecraft_version, loader: inst.mod_loader, projectType };

      const queue = [projectId];
      const seen = new Set();
      const installed = [];

      while (queue.length) {
        const id = queue.shift();
        if (seen.has(id)) continue;
        seen.add(id);

        const version = await pickVersion(id, { ...ctx, projectType: id === projectId ? projectType : 'mod' });
        if (!version) {
          if (id === projectId) throw new Error(`No hay una versión compatible con ${inst.minecraft_version} ${inst.mod_loader}`);
          send(`Dependencia ${id} sin versión compatible, se omite.`);
          continue;
        }

        const type = id === projectId ? projectType : 'mod';
        const folder = path.join(instanceDir(instanceId), FOLDER_BY_TYPE[type] || 'mods');
        const file = primaryFile(version);
        const dest = path.join(folder, file.filename);
        if (!fs.existsSync(dest)) {
          send(`Descargando ${file.filename}`);
          await downloadFile(file.url, dest, { sha1: file.hashes?.sha1, sha512: file.hashes?.sha512 });
        }
        installed.push(file.filename);

        for (const dep of version.dependencies || []) {
          if (dep.dependency_type === 'required' && dep.project_id) queue.push(dep.project_id);
        }
      }

      send(`Instalado: ${installed.join(', ')}`);
      return { success: true, installed };
    } catch (err) {
      send(`Error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  /**
   * Creates an instance from a Modrinth modpack (.mrpack): downloads every file with hash checks and copies overrides.
   * Accepts either a local .mrpack path or a Modrinth modpack project id.
   */
  ipcMain.handle('modrinth:importPack', async (event, { file, projectId, name }) => {
    const send = (msg) => event.sender.send('log', `[Modpack] ${msg}`);
    const progress = (current, total, label) => event.sender.send('progress', { type: 'modpack', current, total, name: label });
    let tmpPack;
    try {
      let packPath = file;
      if (!packPath && projectId) {
        const version = await pickVersion(projectId, { projectType: 'modpack' });
        if (!version) throw new Error('El modpack no tiene versiones publicadas');
        const pf = primaryFile(version);
        tmpPack = path.join(resolveDataDir(), 'temp', pf.filename);
        send(`Descargando ${pf.filename}`);
        await downloadFile(pf.url, tmpPack, { sha1: pf.hashes?.sha1 });
        packPath = tmpPack;
      }
      if (!packPath || !fs.existsSync(packPath)) throw new Error('Archivo .mrpack no encontrado');

      const zip = new AdmZip(packPath);
      const index = JSON.parse(zip.readAsText('modrinth.index.json'));
      const deps = index.dependencies || {};
      const mcVersion = deps.minecraft;
      const loader = deps['fabric-loader'] ? 'fabric' : deps['quilt-loader'] ? 'quilt' : deps.neoforge ? 'neoforge' : deps.forge ? 'forge' : 'vanilla';
      const loaderVersion = deps['fabric-loader'] || deps['quilt-loader'] || deps.neoforge || deps.forge || null;

      const id = crypto.randomUUID();
      const dir = instanceDir(id);
      fs.mkdirSync(dir, { recursive: true });

      // Client-side files only; paths are validated so a pack cannot write outside its instance.
      const files = (index.files || []).filter((f) => f.env?.client !== 'unsupported');
      let done = 0;
      await pool(files, 6, async (f) => {
        const dest = path.resolve(dir, f.path);
        if (!dest.startsWith(path.resolve(dir) + path.sep)) throw new Error(`Ruta no permitida en el modpack: ${f.path}`);
        await downloadFile(f.downloads[0], dest, { sha1: f.hashes?.sha1, sha512: f.hashes?.sha512 });
        progress(++done, files.length, path.basename(f.path));
      });

      for (const entry of zip.getEntries()) {
        const m = /^(overrides|client-overrides)\/(.+)$/.exec(entry.entryName);
        if (!m || entry.isDirectory) continue;
        const dest = path.resolve(dir, m[2]);
        if (!dest.startsWith(path.resolve(dir) + path.sep)) continue;
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, entry.getData());
      }

      const instance = {
        id,
        name: name || index.name || 'Modpack',
        minecraft_version: mcVersion,
        mod_loader: loader,
        mod_loader_version: loaderVersion,
        created: new Date().toISOString(),
        lastPlayed: null,
        icon: 'package',
        source: { type: 'modrinth', versionId: index.versionId || null, name: index.name },
      };
      const all = loadInstances();
      all.push(instance);
      fs.writeFileSync(instancesFile, JSON.stringify(all, null, 2));
      send(`Modpack listo: ${instance.name} (${files.length} archivos)`);
      return { success: true, instance };
    } catch (err) {
      send(`Error: ${err.message}`);
      return { success: false, error: err.message };
    } finally {
      if (tmpPack) fs.rmSync(tmpPack, { force: true });
    }
  });
};

module.exports.search = search;
module.exports.pickVersion = pickVersion;
