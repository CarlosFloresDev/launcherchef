// ============================================
// LauncherChef - Java runtime manager
// Picks the Java version each Minecraft version needs (8, 17, 21, 25...)
// and downloads an Adoptium Temurin JRE when none is available.
// ============================================
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const AdmZip = require('adm-zip');
const { fetchJSON, downloadFile } = require('./net');

const VERSION_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const versionJsonCache = new Map();
let manifestCache = null;

async function getVersionManifest() {
  if (!manifestCache) manifestCache = await fetchJSON(VERSION_MANIFEST);
  return manifestCache;
}

/** Major Java version required by a vanilla Minecraft version (from Mojang's version JSON). */
async function requiredJavaMajor(mcVersion) {
  if (!versionJsonCache.has(mcVersion)) {
    const manifest = await getVersionManifest();
    const entry = manifest.versions.find((v) => v.id === mcVersion);
    if (!entry) throw new Error(`Versión de Minecraft desconocida: ${mcVersion}`);
    versionJsonCache.set(mcVersion, await fetchJSON(entry.url));
  }
  const major = versionJsonCache.get(mcVersion).javaVersion?.majorVersion;
  return major || 8; // versions before 1.17 do not declare it and run on Java 8
}

/** Adoptium does not ship every major (e.g. 16); use the closest LTS that the game accepts. */
function adoptiumMajor(major) {
  if (major <= 8) return 8;
  if (major <= 17) return 17;
  if (major <= 21) return 21;
  return major;
}

function javaMajorOf(executable) {
  const java = executable.replace(/javaw\.exe$/i, 'java.exe');
  // `java -version` prints to stderr, so read both streams.
  const res = spawnSync(java, ['-version'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
  return parseMajor(`${res.stdout || ''}${res.stderr || ''}`);
}

function parseMajor(text) {
  const m = /version "(\d+)(?:\.(\d+))?/.exec(text || '');
  if (!m) return null;
  return m[1] === '1' ? Number(m[2]) : Number(m[1]);
}

/** Known places where a JRE may already be installed on Windows. */
function systemCandidates() {
  const home = process.env.USERPROFILE || '';
  const appdata = process.env.APPDATA || '';
  const roots = [
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Java',
    'C:\\Program Files\\Microsoft',
    'C:\\Program Files\\Zulu',
    path.join(home, 'curseforge', 'minecraft', 'Install', 'java'),
  ];
  const found = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root)) {
      const exe = path.join(root, dir, 'bin', 'javaw.exe');
      if (fs.existsSync(exe)) found.push(exe);
    }
  }
  const mojangRuntime = path.join(appdata, '.minecraft', 'runtime');
  if (fs.existsSync(mojangRuntime)) {
    for (const comp of fs.readdirSync(mojangRuntime)) {
      const exe = path.join(mojangRuntime, comp, 'windows-x64', comp, 'bin', 'javaw.exe');
      if (fs.existsSync(exe)) found.push(exe);
    }
  }
  return found;
}

module.exports = function createJavaManager(getDataDir, log, progress) {
  const runtimesDir = () => path.join(getDataDir(), 'runtimes');

  function managedExe(major) {
    return path.join(runtimesDir(), `java-${major}`, 'bin', 'javaw.exe');
  }

  async function download(major) {
    const target = path.join(runtimesDir(), `java-${major}`);
    const api = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse`;
    log(`[Java] Descargando Java ${major} (Temurin)...`);
    const assets = await fetchJSON(api);
    const pkg = assets?.[0]?.binary?.package;
    if (!pkg?.link) throw new Error(`Adoptium no tiene Java ${major} para Windows x64`);

    fs.mkdirSync(runtimesDir(), { recursive: true });
    const zipPath = path.join(runtimesDir(), `java-${major}.zip`);
    await downloadFile(pkg.link, zipPath, {
      sha256: pkg.checksum,
      onProgress: (got, total) =>
        progress({ type: 'java', current: got, total, name: `Java ${major}: ${(got / 1048576).toFixed(0)} / ${(total / 1048576).toFixed(0)} MB` }),
    });

    log(`[Java] Extrayendo Java ${major}...`);
    const tmp = `${target}.tmp`;
    fs.rmSync(tmp, { recursive: true, force: true });
    new AdmZip(zipPath).extractAllTo(tmp, true);
    const inner = fs.readdirSync(tmp).find((d) => fs.existsSync(path.join(tmp, d, 'bin', 'javaw.exe')));
    if (!inner) throw new Error('El paquete de Java no contiene javaw.exe');
    fs.rmSync(target, { recursive: true, force: true });
    fs.renameSync(path.join(tmp, inner), target);
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(zipPath, { force: true });
    log(`[Java] Java ${major} listo.`);
    return managedExe(major);
  }

  /**
   * Returns a javaw.exe that can run the given Minecraft version.
   * Order: user override for that major, our managed runtime, a matching system JRE, then download.
   */
  async function resolveFor(mcVersion, overrides = {}) {
    const required = await requiredJavaMajor(mcVersion);
    const major = adoptiumMajor(required);
    log(`[Java] Minecraft ${mcVersion} necesita Java ${required}.`);

    const override = overrides[String(major)];
    if (override && fs.existsSync(override)) {
      log(`[Java] Usando ruta personalizada: ${override}`);
      return { path: override, major };
    }

    if (fs.existsSync(managedExe(major))) return { path: managedExe(major), major };

    for (const exe of systemCandidates()) {
      const found = javaMajorOf(exe);
      // Old versions need exactly Java 8; newer ones accept the required major or the same LTS line.
      if (found === major) {
        log(`[Java] Encontrado en el sistema: ${exe}`);
        return { path: exe, major };
      }
    }

    return { path: await download(major), major };
  }

  return { resolveFor, requiredJavaMajor, javaMajorOf, systemCandidates };
};

module.exports.requiredJavaMajor = requiredJavaMajor;
module.exports.adoptiumMajor = adoptiumMajor;
module.exports.parseMajor = parseMajor;
