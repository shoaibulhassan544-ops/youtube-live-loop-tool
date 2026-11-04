'use strict';
/**
 * settings store — plain JSON file in the app userData folder.
 * No database, no native dependency. The YouTube stream key is NEVER
 * stored here in plain text: see safeStorage usage in main.js.
 */
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  mode: 'local', // 'local' | 'cloud'
  quality: '720p', // '720p' | '1080p'
  loop: true,
  autoRestart: true,
  reconnectDelaySec: 5,
  rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
  streamKeyEncrypted: '', // safeStorage-encrypted (base64), empty = not set
  hasStreamKey: false,
  googleClientId: '',
  googleClientSecret: '',
  title: '',
  description: '',
  hashtags: '',
  playlist: [], // [{ path, name, durationSec, width, height }]
  server: {
    host: '', // e.g. 140.238.10.20  (Oracle Always Free VM public IP)
    sshUser: 'ubuntu',
    remoteDir: '/home/ubuntu/youtube-live',
    statusPort: 8080,
    status: 'unknown', // 'online' | 'offline' | 'unknown'
    lastCheckedAt: null,
  },
  cloud: {
    videoUploaded: false,
    remoteVideoName: '',
  },
  updateRepo: '', // e.g. ShoaibAzeez/youtube-live-loop-tool — GitHub Releases source
  updateUrl: '', // optional version.json URL (overrides updateRepo when set)
  lastUpdateCheckAt: null,
};

class Store {
  constructor(userDataPath) {
    this.file = path.join(userDataPath, 'settings.json');
    this.data = { ...DEFAULTS, server: { ...DEFAULTS.server }, cloud: { ...DEFAULTS.cloud } };
    this.load();
  }
  load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.data = { ...this.data, ...raw };
        this.data.server = { ...DEFAULTS.server, ...(raw.server || {}) };
        this.data.cloud = { ...DEFAULTS.cloud, ...(raw.cloud || {}) };
      }
    } catch (e) {
      // Corrupt settings file: keep defaults, do not crash the app.
      this.data = { ...DEFAULTS, server: { ...DEFAULTS.server }, cloud: { ...DEFAULTS.cloud } };
    }
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
  }
  get(key) { return this.data[key]; }
  set(key, value) { this.data[key] = value; this.save(); }
  /** Public copy for the renderer: stream key / client secret are never sent. */
  publicState() {
    const d = JSON.parse(JSON.stringify(this.data));
    delete d.streamKeyEncrypted;
    delete d.googleClientSecret;
    delete d.googleTokens; // access/refresh tokens never leave the main process
    d.hasGoogleSecret = Boolean(this.data.googleClientSecret);
    return d;
  }
}

module.exports = { Store, DEFAULTS };
