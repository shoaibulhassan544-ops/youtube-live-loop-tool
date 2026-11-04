'use strict';
/**
 * Preload: the ONLY bridge between the renderer (UI) and the main process.
 * The stream key is never exposed to the renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('liveTool', {
  getState: () => ipcRenderer.invoke('app:getState'),
  pickVideos: () => ipcRenderer.invoke('app:pickVideos'),
  saveSettings: (patch) => ipcRenderer.invoke('app:saveSettings', patch),
  setStreamKey: (key) => ipcRenderer.invoke('app:setStreamKey', key),
  clearStreamKey: () => ipcRenderer.invoke('app:clearStreamKey'),
  setGoogleClient: (creds) => ipcRenderer.invoke('app:setGoogleClient', creds),
  connectYouTube: () => ipcRenderer.invoke('app:connectYouTube'),
  checkServer: () => ipcRenderer.invoke('app:checkServer'),
  checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
  startLive: () => ipcRenderer.invoke('app:startLive'),
  stopLive: () => ipcRenderer.invoke('app:stopLive'),
  getLogs: () => ipcRenderer.invoke('app:getLogs'),
  openLink: (url) => ipcRenderer.invoke('app:openLink', url),
  onEvent: (cb) => ipcRenderer.on('live:event', (_e, entry) => cb(entry)),
  onUpdateAvailable: (cb) => ipcRenderer.on('live:update-available', (_e, info) => cb(info)),
});
