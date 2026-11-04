# TEST REPORT — YouTube Live Loop Tool v1.0.0

Date: 2026-11-04. Environment: Linux VM (Ubuntu 24.04), Node v24.22.1,
npm 10.9.4, FFmpeg 8.1.2, Electron 31. Test command: `npm test`
(`node scripts/self-test.js`).

## Results — 45 PASS, 0 FAIL
- **JS syntax** (8 files: main, streamer, store, oauth, updater, preload,
  renderer app.js, self-test): all pass `node --check`.
- **Streamer command builder**: single-file 720p loop, 1080p no-loop,
  multi-file playlist uses FFmpeg concat demuxer; RTMP target is
  `rtmp://a.rtmp.youtube.com/live2/<key>`.
- **Stream-key masking**: the key never appears in any logged line.
- **Updater version compare**: `1.0.0 < 1.1.0`, `v1.2.0 > 1.1.0`, equal case.
- **Store**: `publicState()` never contains the stream key or OAuth tokens.
- **Real FFmpeg dry-run**: generated a 3s 1280×720 test video, ffprobe
  returned duration 3s / 1280×720, and the exact loop encode command ran
  5s to a local file (output >10 KB, valid FLV).
- **Server scripts**: `bash -n` clean for both `.sh` files;
  `status-server.py` compiles; systemd unit uses `live-loop.sh run` +
  `Restart=always`.
- **Renderer wiring**: all key element IDs present; preload exposes
  `startLive / stopLive / checkUpdate / checkServer / setStreamKey /
  connectYouTube`.
- **Version agreement**: `package.json` and `version.json` both `1.0.0`.

## UI smoke test (Linux, xvfb)
- `xvfb-run electron . --no-sandbox` launched, window stayed alive for the
  full 20s test window (killed by timeout, not a crash). After adding the
  Content-Security-Policy meta tag, a second 12s run showed **no renderer
  console errors**. D-Bus/GPU warnings in the log are normal headless-VM
  noise. (Running as root needs `--no-sandbox`; normal Windows installs
  do not.)

## Server script behaviour test (local, no YouTube)
- `./live-loop.sh status` → `NOT RUNNING` (correct, nothing started).
- `./live-loop.sh start` with no `stream.conf` → clear error telling the
  user to copy `stream.conf.example` (correct, does not stream garbage).
- `status-server.py` on port 8080 → `{"streaming": false, "message":
  "Server is up, but no live is running."}` (correct JSON for the app card).

## Bugs found and fixed during testing
1. `live-loop.sh` — the `-vf scale=...pad=...(ow-iw)...` argument was
   unquoted, so bash choked on the parentheses (`bash -n` failed). Fixed by
   quoting the filter argument. The Electron streamer was never affected
   (it passes args as an array, no shell).
2. `live-loop.sh` `start` used a fragile nested `bash -c` string; replaced
   with `nohup "$0" run` (single code path, also used by systemd).
3. systemd unit first used `live-loop.sh start` (backgrounds + exits), which
   would have made systemd restart-loop it; changed to foreground `run` mode.
4. Self-test used exact-match `Array.includes` on the `-vf` string; fixed to
   substring checks (test bug, not app bug).
5. `store.publicState()` initially would have sent OAuth tokens to the
   renderer; tokens are now deleted there, and the stream key never leaves
   the main process except to FFmpeg.

## NOT tested — stated honestly, do not claim these pass
- **Windows installer**: `npm run dist:win` / `build-windows.bat` were NOT
  run here (Linux VM cannot build a Windows NSIS installer and running it
  would prove nothing). The user must run `build-windows.bat` on Windows.
- **Real YouTube live**: no real Stream Key was used, so no actual live
  stream to YouTube was started. First real test needs the user's key +
  video (Local Test mode, a few minutes, then check Studio).
- **Oracle VM**: no Oracle account/VM was created in this task; the
  `server/` scripts were tested for syntax/behaviour locally only.
- **GitHub Actions**: the workflow file is ready but was NOT run — Actions
  is disabled on the ShoaibAzeez account (ticket #4937420, open). No repo
  was created and nothing was pushed.
- **Google OAuth connect**: code-reviewed only; the real consent flow needs
  the user's Google Client ID/Secret and a browser on Windows.
