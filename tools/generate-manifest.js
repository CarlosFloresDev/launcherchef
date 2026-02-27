#!/usr/bin/env node
/**
 * ============================================================
 * LauncherChef - Generador de Manifiesto de Distribucion
 * ============================================================
 *
 * Este script escanea una carpeta de mods de Minecraft y genera
 * el archivo distribution.json que el launcher usa para sincronizar
 * mods automaticamente con los jugadores.
 *
 * USO:
 *   node tools/generate-manifest.js [ruta-a-mods] [opciones]
 *
 * EJEMPLOS:
 *   node tools/generate-manifest.js "C:\Users\car_g\curseforge\minecraft\Instances\TortillaLand 2 (Unofficial)\mods"
 *   node tools/generate-manifest.js ./mis-mods --base-url https://github.com/tu-usuario/tu-repo/releases/download/mods/
 *
 * OPCIONES:
 *   --base-url <url>    URL base donde se van a hospedar los .jar
 *   --output <archivo>  Ruta de salida (default: distribution.json)
 *   --server-name <n>   Nombre del servidor
 *   --server-id <id>    ID del servidor (sin espacios)
 *   --server-ip <ip>    IP:puerto del servidor
 *   --mc-version <v>    Version de Minecraft (default: detectar)
 *   --loader <loader>   Mod loader: forge/neoforge/fabric (default: detectar)
 *   --loader-ver <v>    Version del mod loader
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ============================================
// Parse arguments
// ============================================
const args = process.argv.slice(2);

function getArg(flag, defaultVal = '') {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return defaultVal;
}

// First non-flag argument is the mods path
const modsPath = args.find(a => !a.startsWith('--')) || '';
const baseUrl = getArg('--base-url', 'https://CAMBIAR-TU-URL/mods/');
const outputFile = getArg('--output', path.join(process.cwd(), 'distribution.json'));
const serverName = getArg('--server-name', 'TortillaLand 2');
const serverId = getArg('--server-id', 'tortillaland-2');
const serverIp = getArg('--server-ip', '147.135.9.233:19606');
const mcVersion = getArg('--mc-version', '1.21.1');
const modLoader = getArg('--loader', 'neoforge');
const modLoaderVer = getArg('--loader-ver', '21.1.219');

// ============================================
// Validate
// ============================================
if (!modsPath) {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         LauncherChef - Generador de Manifiesto              ║
╚══════════════════════════════════════════════════════════════╝

USO:
  node tools/generate-manifest.js <ruta-a-carpeta-mods> [opciones]

OPCIONES:
  --base-url <url>      URL base donde subiras los .jar
  --output <archivo>    Archivo de salida (default: distribution.json)
  --server-name <nom>   Nombre del servidor
  --server-id <id>      ID unico del servidor
  --server-ip <ip:port> IP del servidor
  --mc-version <ver>    Version de Minecraft
  --loader <nombre>     neoforge / forge / fabric
  --loader-ver <ver>    Version del mod loader

EJEMPLO:
  node tools/generate-manifest.js "C:\\ruta\\a\\mods" --base-url https://github.com/user/repo/releases/download/v1/
`);
  process.exit(1);
}

if (!fs.existsSync(modsPath)) {
  console.error(`ERROR: La carpeta no existe: ${modsPath}`);
  process.exit(1);
}

// ============================================
// Scan mods
// ============================================
console.log('');
console.log('🍳 LauncherChef - Generador de Manifiesto');
console.log('==========================================');
console.log(`📂 Carpeta de mods: ${modsPath}`);
console.log(`🎮 Minecraft: ${mcVersion}`);
console.log(`🔧 Loader: ${modLoader} ${modLoaderVer}`);
console.log(`🖥️  Servidor: ${serverName} (${serverIp})`);
console.log('');

const files = fs.readdirSync(modsPath).filter(f => f.endsWith('.jar'));
console.log(`📦 Encontrados ${files.length} mods (.jar)`);
console.log('');
console.log('Calculando hashes SHA-256... (esto puede tardar un momento)');
console.log('');

const mods = [];
let processed = 0;

for (const filename of files) {
  const filePath = path.join(modsPath, filename);
  const stats = fs.statSync(filePath);

  // Calculate SHA-256
  const fileBuffer = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // Try to extract a clean mod name from filename
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

  // Capitalize first letter of each word
  name = name.replace(/\b\w/g, c => c.toUpperCase());

  // Build download URL
  const encodedFilename = encodeURIComponent(filename);
  const url = baseUrl.endsWith('/') ? `${baseUrl}${encodedFilename}` : `${baseUrl}/${encodedFilename}`;

  mods.push({
    name: name,
    filename: filename,
    url: url,
    sha256: sha256,
    size: stats.size,
    required: true
  });

  processed++;
  if (processed % 20 === 0 || processed === files.length) {
    console.log(`  ✓ ${processed}/${files.length} procesados...`);
  }
}

// Sort alphabetically
mods.sort((a, b) => a.name.localeCompare(b.name));

// ============================================
// Generate manifest
// ============================================
const distribution = {
  launcher_version: '1.0.0',
  generated_at: new Date().toISOString(),
  servers: [
    {
      id: serverId,
      name: serverName,
      description: `Servidor ${serverName} - ${mods.length} mods con ${modLoader} ${modLoaderVer}`,
      address: serverIp,
      minecraft_version: mcVersion,
      mod_loader: modLoader,
      mod_loader_version: modLoaderVer,
      icon: '🌮',
      status: 'online',
      mods: mods
    }
  ]
};

// Write output
fs.writeFileSync(outputFile, JSON.stringify(distribution, null, 2), 'utf-8');

console.log('');
console.log('✅ Manifiesto generado exitosamente!');
console.log(`📄 Archivo: ${outputFile}`);
console.log(`📦 Total mods: ${mods.length}`);
const totalSize = mods.reduce((sum, m) => sum + m.size, 0);
console.log(`💾 Tamaño total: ${(totalSize / (1024 * 1024)).toFixed(1)} MB`);
console.log('');
console.log('═══════════════════════════════════════════════');
console.log('SIGUIENTE PASO:');
console.log('');
console.log('1. Sube los archivos .jar a tu hosting/GitHub');
console.log('2. Actualiza la "base-url" en el manifiesto');
console.log('   para que apunte a donde subiste los mods');
console.log('3. Sube distribution.json a tu repo de GitHub');
console.log('4. Pon la URL raw del JSON en el launcher');
console.log('═══════════════════════════════════════════════');
