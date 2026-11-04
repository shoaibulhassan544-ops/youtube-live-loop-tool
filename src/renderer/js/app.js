'use strict';
/* Renderer: UI only. The stream key is never read here — it is only sent
   to the main process when the user saves it. */
const $ = (id) => document.getElementById(id);
let state = null;
let uptimeTimer = null;

function fmtHMS(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
function fmtDur(sec) {
  if (!sec) return '—';
  return fmtHMS(sec);
}
function appendLog(entry) {
  const box = $('logBox');
  box.textContent += `\n[${new Date(entry.at).toLocaleTimeString()}] ${entry.message}`;
  box.scrollTop = box.scrollHeight;
}
function setLiveUI(running) {
  $('liveBadge').textContent = running ? '● LIVE' : 'OFFLINE';
  $('liveBadge').className = 'badge ' + (running ? 'badge-live' : 'badge-off');
  $('btnStart').disabled = running;
  $('btnStop').disabled = !running;
  $('streamState').textContent = running ? 'Live' : 'Stopped';
  if (running) {
    const startedAt = state.stream.startedAt || Date.now();
    clearInterval(uptimeTimer);
    uptimeTimer = setInterval(() => {
      $('uptime').textContent = fmtHMS(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
  } else {
    clearInterval(uptimeTimer);
    $('uptime').textContent = '00:00:00';
  }
}
function renderPlaylist(items) {
  $('playlist').innerHTML = items.map((v, i) =>
    `<div class="item"><span>${i + 1}. ${v.name}</span><span>${v.ok ? fmtDur(v.durationSec) + ' · ' + v.width + '×' + v.height : 'probe failed'}</span></div>`
  ).join('');
  if (items.length) {
    $('videoMeta').textContent = `${items.length} video(s) · total ${fmtDur(items.reduce((a, v) => a + (v.durationSec || 0), 0))}`;
    const first = items[0];
    $('videoPreview').src = 'file://' + first.path;
    $('videoPreview').classList.add('show');
    $('previewEmpty').style.display = 'none';
  }
}
function applyState(s) {
  state = s;
  const st = s.settings;
  $('title').value = st.title || '';
  $('description').value = st.description || '';
  $('hashtags').value = st.hashtags || '';
  $('rtmpUrl').value = st.rtmpUrl || '';
  $('quality').value = st.quality || '720p';
  $('loopToggle').checked = !!st.loop;
  $('autoRestartToggle').checked = !!st.autoRestart;
  $('googleClientId').value = st.googleClientId || '';
  $('serverHost').value = st.server?.host || '';
  $('serverUser').value = st.server?.sshUser || 'ubuntu';
  $('updateRepo').value = st.updateRepo || '';
  $('keyStatus').textContent = st.hasStreamKey ? 'Stream key saved (encrypted).' : 'No stream key saved yet.';
  if (st.channel) {
    $('channelName').textContent = st.channel.title;
    $('channelMeta').textContent = `${Number(st.channel.subscribers || 0).toLocaleString()} subscribers${st.channel.handle ? ' · ' + st.channel.handle : ''}`;
    if (st.channel.thumbnail) $('channelAvatar').innerHTML = `<img src="${st.channel.thumbnail}" alt="">`;
  }
  setMode(st.mode || 'local');
  setServerUI(st.server?.status || 'unknown');
  renderPlaylist(st.playlist || []);
  $('reconnects').textContent = String(s.stream.reconnects || 0);
  setLiveUI(!!s.stream.running);
  if (s.stream.running && s.stream.startedAt) $('uptime').textContent = fmtHMS(s.stream.uptimeSec || 0);
}
function setMode(mode) {
  $('modeLocal').classList.toggle('active', mode === 'local');
  $('modeCloud').classList.toggle('active', mode === 'cloud');
  $('modeHint').textContent = mode === 'cloud'
    ? 'Cloud Server streams 24/7 from the Oracle VM. Live keeps running even if this PC, power or internet goes off — once the server is set up and Online.'
    : 'Local Test streams from this PC. Stop when this PC, power or internet stops — good for testing.';
  $('cloudCard').style.display = mode === 'cloud' ? '' : '';
}
function setServerUI(status) {
  const dot = $('serverDot');
  const label = $('serverStatus');
  if (status === 'online') { dot.className = 'dot dot-green'; label.textContent = 'Cloud Server Online'; }
  else if (status === 'online-idle') { dot.className = 'dot dot-green'; label.textContent = 'Cloud Server Online (idle — no live running)'; }
  else if (status === 'offline') { dot.className = 'dot dot-red'; label.textContent = 'Cloud Server Offline'; }
  else { dot.className = 'dot dot-grey'; label.textContent = 'Not set up'; }
}
function saveDebounced() {
  window.liveTool.saveSettings({
    title: $('title').value, description: $('description').value, hashtags: $('hashtags').value,
    rtmpUrl: $('rtmpUrl').value, quality: $('quality').value,
    loop: $('loopToggle').checked, autoRestart: $('autoRestartToggle').checked,
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  const s = await window.liveTool.getState();
  applyState(s);
  s.logs.forEach(appendLog);
  window.liveTool.onEvent((entry) => {
    appendLog(entry);
    if (entry.type === 'start') setLiveUI(true);
    if (entry.type === 'stop') setLiveUI(false);
    if (entry.type === 'reconnect') $('reconnects').textContent = String((parseInt($('reconnects').textContent, 10) || 0) + 1);
  });

  $('btnPick').onclick = async () => {
    const r = await window.liveTool.pickVideos();
    if (r.ok) { renderPlaylist(r.items); appendLog({ at: new Date().toISOString(), message: `${r.items.length} video(s) selected.` }); }
  };
  ['title', 'description', 'hashtags', 'rtmpUrl'].forEach((id) => $(id).addEventListener('change', saveDebounced));
  $('quality').addEventListener('change', saveDebounced);
  $('loopToggle').addEventListener('change', saveDebounced);
  $('autoRestartToggle').addEventListener('change', saveDebounced);

  $('btnSaveKey').onclick = async () => {
    const key = $('streamKey').value.trim();
    if (!key) { $('keyStatus').textContent = 'Paste the stream key first.'; return; }
    const r = await window.liveTool.setStreamKey(key);
    $('keyStatus').textContent = r.ok ? 'Stream key saved (encrypted).' : (r.error || 'Failed to save.');
    $('streamKey').value = '';
  };
  $('btnClearKey').onclick = async () => {
    await window.liveTool.clearStreamKey();
    $('keyStatus').textContent = 'No stream key saved yet.';
  };
  $('btnSaveGoogle').onclick = async () => {
    await window.liveTool.setGoogleClient({ clientId: $('googleClientId').value.trim(), clientSecret: $('googleClientSecret').value });
    $('googleClientSecret').value = '';
    appendLog({ at: new Date().toISOString(), message: 'Google client saved.' });
  };
  $('btnConnect').onclick = async () => {
    $('btnConnect').disabled = true;
    $('btnConnect').textContent = 'Opening Google sign-in…';
    const r = await window.liveTool.connectYouTube();
    $('btnConnect').disabled = false;
    $('btnConnect').textContent = '＋ Connect YouTube';
    if (r.ok) {
      $('channelName').textContent = r.channel.title;
      $('channelMeta').textContent = `${Number(r.channel.subscribers || 0).toLocaleString()} subscribers`;
      appendLog({ at: new Date().toISOString(), message: `YouTube connected: ${r.channel.title}.` });
    } else {
      appendLog({ at: new Date().toISOString(), message: `Connect failed: ${r.error}` });
      alert(r.error);
    }
  };
  $('modeLocal').onclick = async () => { await window.liveTool.saveSettings({ mode: 'local' }); setMode('local'); };
  $('modeCloud').onclick = async () => { await window.liveTool.saveSettings({ mode: 'cloud' }); setMode('cloud'); };

  $('btnSaveServer').onclick = async () => {
    await window.liveTool.saveSettings({ server: { host: $('serverHost').value.trim(), sshUser: $('serverUser').value.trim() || 'ubuntu' } });
    $('serverMsg').textContent = 'Server saved. Press Check Server to test it.';
  };
  $('btnCheckServer').onclick = async () => {
    $('serverMsg').textContent = 'Checking server…';
    const r = await window.liveTool.checkServer();
    setServerUI(r.status);
    $('serverMsg').textContent = r.ok ? `Server reachable. Streaming: ${r.data.streaming ? 'yes' : 'no'} — ${r.data.message || ''}` : (r.error || 'Server not reachable.');
  };
  $('btnStart').onclick = async () => {
    const r = await window.liveTool.startLive();
    if (!r.ok) { appendLog({ at: new Date().toISOString(), message: `Start failed: ${r.error}` }); alert(r.error); }
    else setLiveUI(true);
  };
  $('btnStop').onclick = async () => { await window.liveTool.stopLive(); setLiveUI(false); };
  let updateInfo = null;
  function showUpdate(info) {
    updateInfo = info;
    $('updateVersion').textContent = 'v' + info.version;
    $('updateCurrent').textContent = 'v' + info.current;
    $('updateChangelog').textContent = info.changelog || 'No changelog provided for this release.';
    $('updateModal').hidden = false;
  }
  $('btnCheckUpdate').onclick = async () => {
    await window.liveTool.saveSettings({ updateRepo: $('updateRepo').value.trim() });
    $('updateMsg').textContent = 'Checking…';
    const r = await window.liveTool.checkUpdate();
    if (!r.ok) { $('updateMsg').textContent = 'Check failed: ' + r.error; return; }
    $('updateMsg').textContent = r.available ? `New version v${r.version} is available!` : `You are on the latest version (v${r.current}).`;
    if (r.available) showUpdate(r);
  };
  $('btnLaterUpdate').onclick = () => { $('updateModal').hidden = true; };
  $('btnDownloadUpdate').onclick = () => {
    if (updateInfo && updateInfo.downloadUrl) window.liveTool.openLink(updateInfo.downloadUrl);
    $('updateModal').hidden = true;
  };
  window.liveTool.onUpdateAvailable((info) => showUpdate(info));

  $('btnHelp').onclick = () => window.liveTool.openLink('https://studio.youtube.com');
});
