// ============================================
// LauncherChef - Fabric / Quilt profiles
// minecraft-launcher-core can launch a custom version only if its JSON exists in versions/<id>/<id>.json.
// These helpers fetch the official loader profile so Fabric and Quilt instances actually start.
// ============================================
const fs = require('fs');
const path = require('path');
const { fetchJSON } = require('./net');

const META = {
  fabric: 'https://meta.fabricmc.net/v2',
  quilt: 'https://meta.quiltmc.org/v3',
};

async function latestLoaderVersion(loader, mcVersion) {
  const list = await fetchJSON(`${META[loader]}/versions/loader/${encodeURIComponent(mcVersion)}`);
  if (!Array.isArray(list) || list.length === 0) throw new Error(`${loader} no está disponible para Minecraft ${mcVersion}`);
  const isStable = (v) => !/(alpha|beta|pre|rc)/i.test(v);
  const stable = list.find((e) => e.loader?.stable === true) || list.find((e) => isStable(e.loader.version)) || list[0];
  return stable.loader.version;
}

/**
 * Ensures versions/<id>/<id>.json exists for the given Fabric/Quilt loader and returns the version id.
 */
async function ensureLoaderProfile(root, loader, mcVersion, loaderVersion) {
  if (!META[loader]) throw new Error(`Loader no soportado: ${loader}`);
  const version = loaderVersion || (await latestLoaderVersion(loader, mcVersion));
  const profile = await fetchJSON(
    `${META[loader]}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(version)}/profile/json`,
  );
  const id = profile.id;
  const dir = path.join(root, 'versions', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(profile, null, 2));
  return { id, version };
}

module.exports = { ensureLoaderProfile, latestLoaderVersion };
