#!/usr/bin/env node
/**
 * ============================================================
 * LauncherChef - Actualizar URLs del Manifiesto
 * ============================================================
 *
 * Despues de subir los mods a un GitHub Release, ejecuta este
 * script para actualizar todas las URLs en distribution.json
 * y servers.json automaticamente.
 *
 * USO:
 *   node tools/update-urls.js <github-usuario> <github-repo> <release-tag>
 *
 * EJEMPLO:
 *   node tools/update-urls.js MiUsuario tortillaland-mods v1
 *
 * Esto genera URLs como:
 *   https://github.com/MiUsuario/tortillaland-mods/releases/download/v1/mod-name.jar
 */

const fs = require('fs');
const path = require('path');

const [,, ghUser, ghRepo, ghTag] = process.argv;

if (!ghUser || !ghRepo || !ghTag) {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║     LauncherChef - Actualizador de URLs                  ║
╚══════════════════════════════════════════════════════════╝

USO:
  node tools/update-urls.js <github-usuario> <github-repo> <release-tag>

EJEMPLO:
  node tools/update-urls.js MiUsuario tortillaland-mods v1
`);
  process.exit(1);
}

const baseUrl = `https://github.com/${ghUser}/${ghRepo}/releases/download/${ghTag}`;
console.log('');
console.log('🍳 LauncherChef - Actualizador de URLs');
console.log('======================================');
console.log(`📦 Base URL: ${baseUrl}`);
console.log('');

// Update distribution.json
const distroPath = path.join(process.cwd(), 'distribution.json');
if (fs.existsSync(distroPath)) {
  const distro = JSON.parse(fs.readFileSync(distroPath, 'utf-8'));
  let count = 0;
  for (const server of distro.servers) {
    for (const mod of server.mods) {
      const encoded = encodeURIComponent(mod.filename);
      mod.url = `${baseUrl}/${encoded}`;
      count++;
    }
  }
  fs.writeFileSync(distroPath, JSON.stringify(distro, null, 2));
  console.log(`✅ distribution.json actualizado (${count} URLs)`);
} else {
  console.log('⚠️  distribution.json no encontrado');
}

// Update servers.json
const serversPath = path.join(process.cwd(), 'config', 'servers.json');
if (fs.existsSync(serversPath)) {
  const servers = JSON.parse(fs.readFileSync(serversPath, 'utf-8'));
  let count = 0;
  for (const server of servers) {
    for (const mod of server.mods || []) {
      const encoded = encodeURIComponent(mod.filename);
      mod.url = `${baseUrl}/${encoded}`;
      count++;
    }
    // Also set the manifestUrl for remote distribution
    // This will be the raw GitHub URL of distribution.json
    server.manifestUrl = `https://raw.githubusercontent.com/${ghUser}/${ghRepo}/main/distribution.json`;
  }
  fs.writeFileSync(serversPath, JSON.stringify(servers, null, 2));
  console.log(`✅ config/servers.json actualizado (${count} URLs)`);
} else {
  console.log('⚠️  config/servers.json no encontrado');
}

console.log('');
console.log('═══════════════════════════════════════════════');
console.log('AHORA:');
console.log(`1. Sube distribution.json a tu repo ${ghRepo}`);
console.log('2. Los jugadores que usen el launcher ya podran');
console.log('   sincronizar los mods automaticamente!');
console.log('');
console.log('URL del manifiesto para el launcher:');
console.log(`  https://raw.githubusercontent.com/${ghUser}/${ghRepo}/main/distribution.json`);
console.log('═══════════════════════════════════════════════');
