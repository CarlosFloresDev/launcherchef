const fs = require('fs');
const path = require('path');

module.exports = function (ipcMain, configDir) {
  // Use configDir passed from main.js (resolves to correct location in both dev and packaged)
  const AUTH_FILE = configDir
    ? path.join(configDir, 'auth.json')
    : path.join(__dirname, '..', '..', 'config', 'auth.json');

  // Store the MSMC Minecraft token object in memory for launching
  let currentMCToken = null;

  function loadSavedAuth() {
    try {
      if (fs.existsSync(AUTH_FILE)) {
        return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
      }
    } catch {
      // Corrupted auth file
    }
    return null;
  }

  function saveAuth(data) {
    try {
      fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2));
    } catch {
      // Non-critical
    }
  }

  function clearAuth() {
    try {
      if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
    } catch { /* ignore */ }
    currentMCToken = null;
  }

  // Login with Microsoft via MSMC v5
  ipcMain.handle('auth:login', async () => {
    try {
      // MSMC v5 uses require('msmc').Auth
      const { Auth } = require('msmc');
      const auth = new Auth('select_account');

      // Launch Electron popup for Microsoft login
      const xbox = await auth.launch('electron');

      // Get Minecraft token from Xbox token
      const mc = await xbox.getMinecraft();

      if (mc.isDemo()) {
        return { success: false, error: 'Esta cuenta es una Demo. Necesitas Minecraft comprado.' };
      }

      // Store for launching
      currentMCToken = mc;

      const profile = mc.profile;
      const authData = {
        name: profile.name,
        uuid: profile.id,
        mcToken: mc.mcToken,
        refreshToken: mc.refreshTkn || '',
        profile: {
          name: profile.name,
          id: profile.id
        }
      };

      saveAuth(authData);

      return {
        success: true,
        profile: authData.profile
      };
    } catch (err) {
      return { success: false, error: err.message || 'Error de autenticacion' };
    }
  });

  // Offline (non-premium) login
  ipcMain.handle('auth:offline', async (_e, username) => {
    if (!username || username.trim().length < 1) {
      return { success: false, error: 'El nombre de usuario no puede estar vacio' };
    }

    const name = username.trim().replace(/[^a-zA-Z0-9_]/g, '');
    if (name.length < 1 || name.length > 16) {
      return { success: false, error: 'Nombre invalido (1-16 caracteres, solo letras, numeros y _)' };
    }

    // Generate a consistent offline UUID from the username
    const crypto = require('crypto');
    const offlineUuid = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest('hex');
    const formattedUuid = [
      offlineUuid.slice(0, 8),
      offlineUuid.slice(8, 12),
      offlineUuid.slice(12, 16),
      offlineUuid.slice(16, 20),
      offlineUuid.slice(20)
    ].join('-');

    const authData = {
      name: name,
      uuid: formattedUuid,
      mcToken: '',
      refreshToken: '',
      premium: false,
      profile: {
        name: name,
        id: formattedUuid,
        premium: false
      }
    };

    saveAuth(authData);
    currentMCToken = null;

    return { success: true, profile: authData.profile };
  });

  // Logout
  ipcMain.handle('auth:logout', async () => {
    clearAuth();
    return { success: true };
  });

  // Get saved profile info
  ipcMain.handle('auth:getProfile', async () => {
    const saved = loadSavedAuth();
    if (saved && saved.profile) {
      return { loggedIn: true, profile: saved.profile };
    }
    return { loggedIn: false };
  });

  // Get MCLC-compatible auth object for launching
  ipcMain.handle('auth:getMclcAuth', async () => {
    // If we have a live MSMC token, use its mclc() method
    if (currentMCToken) {
      try {
        return { success: true, auth: currentMCToken.mclc() };
      } catch {
        // Token might be expired, fall through
      }
    }

    // Try to build from saved data
    const saved = loadSavedAuth();
    if (saved && saved.mcToken) {
      // Try refreshing
      try {
        const { Auth } = require('msmc');
        const auth = new Auth('none');
        if (saved.refreshToken) {
          const xbox = await auth.refresh(saved.refreshToken);
          const mc = await xbox.getMinecraft();
          currentMCToken = mc;

          // Update saved token
          saved.mcToken = mc.mcToken;
          saved.refreshToken = mc.refreshTkn || saved.refreshToken;
          saveAuth(saved);

          return { success: true, auth: mc.mclc() };
        }
      } catch {
        // Refresh failed
      }

      // Fallback: construct auth object manually
      return {
        success: true,
        auth: {
          access_token: saved.mcToken,
          client_token: '',
          uuid: saved.uuid || saved.profile?.id || '',
          name: saved.name || saved.profile?.name || 'Player',
          user_properties: '{}'
        }
      };
    }

    return { success: false, error: 'No hay sesion activa' };
  });
};
