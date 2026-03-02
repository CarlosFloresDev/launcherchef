// ============================================
// Game History Handler — Track play sessions
// ============================================
const path = require('path');
const fs = require('fs');

module.exports = function (ipcMain, configDir) {
  const HISTORY_FILE = path.join(configDir, 'game-history.json');

  function loadHistory() {
    try {
      if (fs.existsSync(HISTORY_FILE)) {
        return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
      }
    } catch { /* ignore */ }
    return [];
  }

  function saveHistory(history) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  }

  // Load all play sessions (newest first)
  ipcMain.handle('game-history:load', () => {
    const history = loadHistory();
    history.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    return history;
  });

  // Save or update a play session
  ipcMain.handle('game-history:save', (_e, session) => {
    const history = loadHistory();
    const existingIndex = history.findIndex(s => s.id === session.id);
    if (existingIndex >= 0) {
      history[existingIndex] = { ...history[existingIndex], ...session };
    } else {
      history.push(session);
    }
    saveHistory(history);
    return { success: true };
  });

  // Delete a play session by id
  ipcMain.handle('game-history:delete', (_e, id) => {
    let history = loadHistory();
    history = history.filter(s => s.id !== id);
    saveHistory(history);
    return { success: true };
  });
};
