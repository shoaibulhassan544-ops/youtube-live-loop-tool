'use strict';
/**
 * YouTube Live Loop Tool v1.0 — main process.
 * FREE tool. No licence, no key, no payment, no account on any server.
 *
 * Two streaming modes:
 *  - Local Test: FFmpeg runs on this PC and pushes RTMP to YouTube.
 *    Stops when this PC / power / internet stops. Good for testing.
 *  - Cloud: the video lives on an Oracle Cloud Always Free VM and the
 *    server streams 24/7. This app only checks the server status and
 *    tells the user how to start/stop it there. See server/ scripts.
 */
const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron');
const path = require('path');
const { Store } = require('./store');
const { Streamer, probe } = require('./streamer');
const oauth = require('./oauth');
const { checkForUpdate } = require('./updater');

let win = null;
let store = null;
let streamer = null;
let pendingRedirectUri = '';
const logs = [];
const MAX_LOGS = 300;

function log(type, message) {
  const entry = { type, message, at: new Date().toISOString() };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.shift();
  if (win && !win.isDestroyed()) win.webContents.send('live:event', entry);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 780,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#eaf4fb',
    title: 'YouTube Live Loop Tool',
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.on('closed', () => { win = null; });
}

// ---- Stream key: encrypted at rest with Electron safeStorage (OS keychain) ----
function encryptSecret(plain) {
  if (!plain) return '';
  if (safeStorage.isEncryptionAvailable()) return safeStorage.encryptString(plain).toString('base64');
  // Fallback (rare, e.g. Linux without a keychain): obfuscated, not plain text.
  return Buffer.from(`obf:${plain}`, 'utf8').toString('base64');
}
function decryptSecret(enc) {
  if (!enc) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(enc, 'base64'));
    const s = Buffer.from(enc, 'base64').toString('utf8');
    return s.startsWith('obf:') ? s.slice(4) : '';
  } catch (e) { return ''; }
}

function registerIpc() {
  ipcMain.handle('app:getState', () => ({ settings: store.publicState(), logs, stream: streamer.status() }));

  ipcMain.handle('app:pickVideos', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Select video file(s) for the live loop',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm'] }],
    });
    if (r.canceled) return { ok: false };
    const items = [];
    for (const file of r.filePaths) {
      const info = await probe(file);
      items.push({ path: file, name: path.basename(file), durationSec: info.ok ? info.durationSec : 0, width: info.ok ? info.width : 0, height: info.ok ? info.height : 0, ok: info.ok, error: info.ok ? '' : info.error });
    }
    store.set('playlist', items);
    return { ok: true, items };
  });

  ipcMain.handle('app:saveSettings', (_e, patch) => {
    const allowed = ['mode', 'quality', 'loop', 'autoRestart', 'title', 'description', 'hashtags', 'rtmpUrl', 'updateRepo', 'updateUrl'];
    for (const k of allowed) if (patch[k] !== undefined) store.set(k, patch[k]);
    if (patch.server) store.set('server', { ...store.get('server'), ...patch.server });
    if (patch.cloud) store.set('cloud', { ...store.get('cloud'), ...patch.cloud });
    return { ok: true, settings: store.publicState() };
  });

  ipcMain.handle('app:setStreamKey', (_e, key) => {
    const k = String(key || '').trim();
    if (!k) return { ok: false, error: 'Stream key is empty.' };
    store.set('streamKeyEncrypted', encryptSecret(k));
    store.set('hasStreamKey', true);
    log('info', 'Stream key saved (encrypted, never shown in logs).');
    return { ok: true };
  });
  ipcMain.handle('app:clearStreamKey', () => {
    store.set('streamKeyEncrypted', '');
    store.set('hasStreamKey', false);
    log('info', 'Stream key removed.');
    return { ok: true };
  });

  ipcMain.handle('app:setGoogleClient', (_e, { clientId, clientSecret }) => {
    if (clientId !== undefined) store.set('googleClientId', String(clientId || '').trim());
    if (clientSecret) store.set('googleClientSecret', encryptSecret(String(clientSecret)));
    return { ok: true };
  });

  ipcMain.handle('app:connectYouTube', async () => {
    const clientId = store.get('googleClientId');
    const clientSecret = decryptSecret(store.get('googleClientSecret'));
    if (!clientId || !clientSecret) return { ok: false, error: 'Add your Google Client ID and Secret first (Settings). These come from Google Cloud Console — no password is ever used.' };
    try {
      const code = await oauth.waitForCode((port) => {
        pendingRedirectUri = `http://127.0.0.1:${port}/oauth-callback`;
        const url = oauth.authUrl(clientId, pendingRedirectUri);
        shell.openExternal(url);
      });
      const tokens = await oauth.exchangeCode(code, clientId, clientSecret, pendingRedirectUri);
      store.set('googleTokens', { accessToken: tokens.access_token, refreshToken: tokens.refresh_token || '', expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000 });
      const channel = await oauth.fetchChannel(tokens.access_token);
      store.set('channel', channel);
      log('info', `YouTube connected: ${channel.title}.`);
      return { ok: true, channel };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('app:checkServer', async () => {
    const srv = store.get('server');
    if (!srv.host) return { ok: false, status: 'unknown', error: 'No server host set. Add your Oracle VM public IP in Cloud settings first.' };
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`http://${srv.host}:${srv.statusPort || 8080}/status`, { signal: ctrl.signal });
      clearTimeout(t);
      const data = await res.json();
      const status = data.streaming ? 'online' : 'online-idle';
      store.set('server', { ...srv, status, lastCheckedAt: new Date().toISOString() });
      return { ok: true, status, data };
    } catch (e) {
      store.set('server', { ...srv, status: 'offline', lastCheckedAt: new Date().toISOString() });
      return { ok: false, status: 'offline', error: `Server not reachable at ${srv.host}. Is the VM running and is status-server.py running on it? (${e.message})` };
    }
  });

  ipcMain.handle('app:startLive', () => {
    const mode = store.get('mode');
    if (mode === 'cloud') {
      return { ok: false, error: 'Cloud mode: start the stream ON the server (see server/ scripts — ssh in and run live-loop.sh start). This app cannot start a remote stream by itself in V1; it only monitors the server. Use Local Test mode to stream from this PC.' };
    }
    const streamKey = decryptSecret(store.get('streamKeyEncrypted'));
    const result = streamer.start({
      playlist: store.get('playlist'),
      loop: store.get('loop'),
      quality: store.get('quality'),
      autoRestart: store.get('autoRestart'),
      reconnectDelaySec: store.get('reconnectDelaySec'),
      rtmpUrl: store.get('rtmpUrl'),
      streamKey,
    });
    if (result.ok) log('start', 'Local live started.');
    return result;
  });

  ipcMain.handle('app:checkUpdate', async () => {
    try {
      const result = await checkForUpdate({ repo: store.get('updateRepo'), updateUrl: store.get('updateUrl') });
      store.set('lastUpdateCheckAt', new Date().toISOString());
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('app:stopLive', () => streamer.stop());
  ipcMain.handle('app:getLogs', () => logs);
  ipcMain.handle('app:openLink', (_e, url) => { shell.openExternal(url); return { ok: true }; });
}

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  streamer = new Streamer((ev) => log(ev.type, ev.message));
  registerIpc();
  createWindow();
  // Silent update check on startup (MetaBox-style): only tell the user
  // when a newer version actually exists. Never auto-downloads anything.
  setTimeout(async () => {
    try {
      if (!store.get('updateRepo') && !store.get('updateUrl')) return;
      const r = await checkForUpdate({ repo: store.get('updateRepo'), updateUrl: store.get('updateUrl') });
      if (r.available && win && !win.isDestroyed()) win.webContents.send('live:update-available', r);
    } catch (e) { /* offline or no releases yet — stay quiet */ }
  }, 5000);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  // Stop the local stream when the app closes, so no orphan ffmpeg keeps running.
  try { streamer && streamer.stop(); } catch (e) { /* ignore */ }
  if (process.platform !== 'darwin') app.quit();
});
