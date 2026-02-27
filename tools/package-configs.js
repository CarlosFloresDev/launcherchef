#!/usr/bin/env node
/**
 * ============================================================
 * LauncherChef - Package Config Files into ZIP
 * ============================================================
 *
 * Packages the config directory from a Minecraft instance
 * into a ZIP file for distribution.
 *
 * USAGE:
 *   node tools/package-configs.js <config-source-dir> [output-path]
 *
 * EXAMPLE:
 *   node tools/package-configs.js "C:\Users\car_g\curseforge\minecraft\Instances\TortillaLand 2 (Unofficial)\config"
 *   node tools/package-configs.js ".\minecraft_data\instances\tortillaland-2\config" ".\configs.zip"
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const [,, configSourceDir, outputPath] = process.argv;

if (!configSourceDir) {
  console.log(`
  LauncherChef - Empaquetador de Configs
  =======================================

  USO:
    node tools/package-configs.js <carpeta-config> [salida.zip]

  EJEMPLO:
    node tools/package-configs.js ".\\minecraft_data\\instances\\tortillaland-2\\config"
  `);
  process.exit(1);
}

const sourceDir = path.resolve(configSourceDir);
const output = path.resolve(outputPath || path.join(process.cwd(), 'configs.zip'));

if (!fs.existsSync(sourceDir)) {
  console.error(`Error: No se encontro la carpeta: ${sourceDir}`);
  process.exit(1);
}

console.log('');
console.log('LauncherChef - Empaquetador de Configs');
console.log('======================================');
console.log(`Origen: ${sourceDir}`);
console.log(`Destino: ${output}`);
console.log('');

const zip = new AdmZip();
let fileCount = 0;

function addDirToZip(dirPath, zipPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const entryZipPath = zipPath ? `${zipPath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      addDirToZip(fullPath, entryZipPath);
    } else {
      zip.addLocalFile(fullPath, zipPath || '');
      fileCount++;
    }
  }
}

addDirToZip(sourceDir, '');
zip.writeZip(output);

const stats = fs.statSync(output);
const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

console.log(`Archivos empaquetados: ${fileCount}`);
console.log(`Tamano del ZIP: ${sizeMB} MB`);
console.log(`Guardado en: ${output}`);
console.log('');
console.log('Ahora sube este archivo a tu GitHub Release!');
