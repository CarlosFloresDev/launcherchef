// ============================================
// LauncherChef - Network helpers
// Redirect-aware JSON fetch and file download with retries and optional checksum.
// ============================================
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

const USER_AGENT = 'LauncherChef/3.0 (+https://github.com/CarlosFloresDev/launcherchef)';

function request(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects <= 0) return reject(new Error('Demasiadas redirecciones'));
        return resolve(request(new URL(res.headers.location, url).toString(), redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} en ${url}`));
      }
      resolve(res);
    });
    req.setTimeout(30000, () => req.destroy(new Error(`Tiempo de espera agotado: ${url}`)));
    req.on('error', reject);
  });
}

async function fetchJSON(url) {
  const res = await request(url);
  let data = '';
  for await (const chunk of res) data += chunk;
  try {
    return JSON.parse(data);
  } catch {
    throw new Error(`Respuesta no válida de ${url}`);
  }
}

function hashFile(file, algorithm) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    fs.createReadStream(file).on('data', (d) => hash.update(d)).on('end', () => resolve(hash.digest('hex'))).on('error', reject);
  });
}

/**
 * Downloads `url` to `dest` atomically (via a .part file), retrying transient failures.
 * Verifies sha1/sha256/sha512 when provided.
 */
async function downloadFile(url, dest, { sha1, sha256, sha512, onProgress, retries = 3 } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await request(url);
      const total = Number(res.headers['content-length'] || 0);
      let received = 0;
      await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(part);
        res.on('data', (chunk) => {
          received += chunk.length;
          if (onProgress && total) onProgress(received, total);
        });
        res.on('error', reject);
        out.on('error', reject);
        out.on('finish', resolve);
        res.pipe(out);
      });

      const expected = sha512 ? ['sha512', sha512] : sha256 ? ['sha256', sha256] : sha1 ? ['sha1', sha1] : null;
      if (expected) {
        const actual = await hashFile(part, expected[0]);
        if (actual.toLowerCase() !== expected[1].toLowerCase()) throw new Error(`Checksum incorrecto en ${path.basename(dest)}`);
      }
      fs.renameSync(part, dest);
      return dest;
    } catch (err) {
      lastError = err;
      fs.rmSync(part, { force: true });
      if (attempt < retries) await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  throw lastError;
}

/** Runs async jobs with a concurrency limit, collecting results in order. */
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

module.exports = { fetchJSON, downloadFile, hashFile, pool, USER_AGENT };
