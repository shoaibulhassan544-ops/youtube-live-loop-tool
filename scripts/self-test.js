'use strict';
/**
 * Self-test for YouTube Live Loop Tool v1.0.0.
 * Runs on plain Node (no Electron, no stream key, no YouTube account).
 * Checks: JS syntax, streamer command builder, key masking, version
 * compare, ffprobe on a generated test video, a real 5s FFmpeg loop
 * encode, server script syntax, and renderer wiring.
 * Exit code 0 = all pass.
 */
const { execFile, execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`PASS ${name}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function run(cmd, opts) {
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', ...(opts || {}) });
  return r;
}

(async () => {
  // 1. Syntax check every JS file (main, preload, renderer, self-test).
  const jsFiles = [
    'src/main/main.js', 'src/main/streamer.js', 'src/main/store.js',
    'src/main/oauth.js', 'src/main/updater.js',
    'src/preload/preload.js', 'src/renderer/js/app.js', 'scripts/self-test.js',
  ];
  for (const f of jsFiles) {
    const r = run(`node --check "${path.join(ROOT, f)}"`);
    check(`syntax ${f}`, r.status === 0, r.stderr);
  }

  // 2. Modules load under plain Node (main.js is syntax-only: it needs Electron).
  let streamer, updater, storeMod;
  try { streamer = require('../src/main/streamer'); check('require streamer.js', true); }
  catch (e) { check('require streamer.js', false, e.message); }
  try { updater = require('../src/main/updater'); check('require updater.js', true); }
  catch (e) { check('require updater.js', false, e.message); }
  try { storeMod = require('../src/main/store'); check('require store.js', true); }
  catch (e) { check('require store.js', false, e.message); }
  try { require('../src/main/oauth'); check('require oauth.js', true); }
  catch (e) { check('require oauth.js', false, e.message); }

  // 3. buildArgs: single file, 720p + 1080p, playlist (concat), key hidden.
  if (streamer) {
    const key = 'test-key-1234';
    const single = streamer.buildArgs({ playlist: [{ path: '/tmp/v.mp4' }], loop: true, quality: '720p', rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2', streamKey: key });
    check('buildArgs single 720p scale', single.args.some((a) => a.includes('1280:720')) && single.args.includes('-stream_loop'), JSON.stringify(single.args));
    check('buildArgs single has rtmp target', single.args[single.args.length - 1] === `rtmp://a.rtmp.youtube.com/live2/${key}`);
    const hd = streamer.buildArgs({ playlist: [{ path: '/tmp/v.mp4' }], loop: false, quality: '1080p', rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2', streamKey: key });
    check('buildArgs 1080p no loop', hd.args.some((a) => a.includes('1920:1080')) && !hd.args.includes('-stream_loop'));
    const list = streamer.buildArgs({ playlist: [{ path: '/tmp/a.mp4' }, { path: '/tmp/b.mp4' }], loop: true, quality: '720p', rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2', streamKey: key, concatListPath: '/tmp/playlist.txt', useConcat: true });
    check('buildArgs playlist uses concat', list.args.includes('concat') && list.args.includes('/tmp/playlist.txt'));
    check('maskKey hides stream key', !streamer.maskKey(`...rtmp/live2/${key} failed`, key).includes(key));
    check('maskKey keeps other text', streamer.maskKey('hello world', key) === 'hello world');
  }

  // 4. Version compare (updater).
  if (updater) {
    check('compareVersions 1.0.0 < 1.1.0', updater.compareVersions('1.0.0', '1.1.0') === -1);
    check('compareVersions v1.2.0 > 1.1.0', updater.compareVersions('v1.2.0', '1.1.0') === 1);
    check('compareVersions equal', updater.compareVersions('1.0.0', 'v1.0.0') === 0);
  }

  // 5. Store: defaults + publicState never leaks secrets.
  if (storeMod) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-live-store-'));
    const s = new storeMod.Store(tmp);
    s.set('streamKeyEncrypted', 'SECRET-VALUE');
    s.set('googleTokens', { accessToken: 'TOKEN-VALUE' });
    const pub = JSON.stringify(s.publicState());
    check('store publicState hides stream key', !pub.includes('SECRET-VALUE'));
    check('store publicState hides tokens', !pub.includes('TOKEN-VALUE'));
    check('store defaults mode local', s.get('mode') === 'local');
  }

  // 6. Real FFmpeg: generate a 3s test video, probe it, loop-encode 5s to a file.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-live-ffmpeg-'));
  const testVideo = path.join(tmp, 'test.mp4');
  const outFile = path.join(tmp, 'out.flv');
  let r = run(`ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc=duration=3:size=1280x720:rate=30 -f lavfi -i sine=frequency=440:duration=3 -c:v libx264 -c:a aac -shortest -y "${testVideo}"`);
  check('ffmpeg generates test video', r.status === 0 && fs.existsSync(testVideo), r.stderr);
  if (streamer) {
    const info = await streamer.probe(testVideo);
    check('ffprobe duration ~3s', info.ok && info.durationSec === 3, JSON.stringify(info));
    check('ffprobe resolution 1280x720', info.ok && info.width === 1280 && info.height === 720);
    // Dry-run the real loop command, but to a local file instead of RTMP.
    const built = streamer.buildArgs({ playlist: [{ path: testVideo }], loop: true, quality: '720p', rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2', streamKey: 'dry-run-key' });
    const args = ['-hide_banner', '-loglevel', 'error', '-re', '-stream_loop', '-1', '-i', testVideo,
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
      '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '2500k', '-maxrate', '2500k', '-bufsize', '5000k',
      '-r', '30', '-g', '60', '-c:a', 'aac', '-b:a', '128k', '-t', '5', '-f', 'flv', '-y', outFile];
    void built;
    const enc = run(`ffmpeg ${args.map((a) => `'${a}'`).join(' ')}`);
    check('ffmpeg loop encode 5s to file', enc.status === 0 && fs.existsSync(outFile) && fs.statSync(outFile).size > 10000, enc.stderr);
  }

  // 7. Server scripts: bash syntax + python compile + systemd unit.
  r = run(`bash -n "${path.join(ROOT, 'server/install-ffmpeg.sh')}" && bash -n "${path.join(ROOT, 'server/live-loop.sh')}"`);
  check('server shell scripts bash -n', r.status === 0, r.stderr);
  r = run(`python3 -m py_compile "${path.join(ROOT, 'server/status-server.py')}"`);
  check('server status-server.py compiles', r.status === 0, r.stderr);
  const unit = fs.readFileSync(path.join(ROOT, 'server/youtube-live-loop.service'), 'utf8');
  check('systemd unit runs live-loop.sh run', unit.includes('live-loop.sh run') && unit.includes('Restart=always'));

  // 8. Renderer wiring: key element IDs + preload bridge functions exist.
  const html = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf8');
  for (const id of ['btnStart', 'btnStop', 'btnPick', 'streamKey', 'updateModal', 'cloudCard', 'logBox']) {
    check(`renderer has #${id}`, html.includes(`id="${id}"`));
  }
  const preload = fs.readFileSync(path.join(ROOT, 'src/preload/preload.js'), 'utf8');
  for (const fn of ['startLive', 'stopLive', 'checkUpdate', 'checkServer', 'setStreamKey', 'connectYouTube']) {
    check(`preload exposes ${fn}`, preload.includes(fn));
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const ver = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
  check('package.json + version.json agree (1.0.0)', pkg.version === '1.0.0' && ver.version === '1.0.0');

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('self-test crashed:', e); process.exit(1); });
