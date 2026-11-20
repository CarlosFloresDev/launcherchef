// ============================================
// LauncherChef - Encrypted JSON files
// Account tokens are stored encrypted with the OS keychain (DPAPI on Windows) via Electron safeStorage.
// Falls back to plain JSON when encryption is unavailable, and reads old plain files transparently.
// ============================================
const fs = require('fs');

let safeStorage = null;
try {
  ({ safeStorage } = require('electron'));
} catch {
  safeStorage = null;
}

const PREFIX = 'LCENC1:';

function canEncrypt() {
  try {
    return Boolean(safeStorage && safeStorage.isEncryptionAvailable());
  } catch {
    return false;
  }
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  try {
    if (raw.startsWith(PREFIX)) {
      if (!canEncrypt()) return null;
      return JSON.parse(safeStorage.decryptString(Buffer.from(raw.slice(PREFIX.length), 'base64')));
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(file, data) {
  const json = JSON.stringify(data, null, 2);
  const out = canEncrypt() ? PREFIX + safeStorage.encryptString(json).toString('base64') : json;
  fs.writeFileSync(file, out);
}

module.exports = { readJson, writeJson };
