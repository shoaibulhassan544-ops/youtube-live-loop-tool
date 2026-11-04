# YouTube Live Loop Tool — v1.0.0 (FREE)

**Free tool. No licence, no key, no payment.**

Stream a video (or a playlist) on loop to **YouTube Live**. Give it a video,
a title and hashtags, and it keeps the live running. Two modes:

| Mode | How it works | Stops when… |
|---|---|---|
| **Local Test** | FFmpeg on this PC pushes RTMP to YouTube | this PC / power / internet stops — good for testing |
| **Cloud (24/7)** | An Oracle Cloud Always Free VM streams day and night | (almost) never — the live keeps running even if your laptop, power or internet goes off |

Design: light sky-blue + white, as approved from the preview image
(`media-generation-youtube-live-tool-preview-*.webp`).

## Quick start — Local Test (5 minutes, no server, no money)
1. Install on Windows: run `build-windows.bat`, then install the `.exe` from `dist/`.
   Or run from source: `npm install` then `npm start` (needs Node.js 20+).
2. **Get your Stream Key** — YouTube Studio → **Create → Go Live → Stream** →
   copy **Stream key** (and keep the RTMP URL `rtmp://a.rtmp.youtube.com/live2`).
   Title, description and hashtags are set on that same Studio page.
3. Open the app → paste the **Stream Key** → **Save Key** (stored encrypted).
4. **Choose Video(s)** → pick an MP4 (several files = playlist loop).
5. Set Quality (720p/1080p), Loop, Auto Restart → **▶ Start Live**.
6. Check YouTube Studio — the stream appears as Live within a minute.
   **■ Stop** ends it.

> Honest note: a pre-recorded video shown as “live” must not mislead
> viewers. Put words like **Replay / Loop / 24/7** in the title, and do not
> claim you are live on camera when you are not. Looping the same video
> 24/7 can be treated as spam by YouTube — a playlist of several videos is
> safer than one video on repeat.

## Cloud mode (24/7) — Oracle Cloud Always Free
Full step-by-step: [`server/ORACLE-SETUP.md`](server/ORACLE-SETUP.md).
Short version:
1. Create an Oracle Cloud account (card = **verification only**; user has a
   debit card). Free limits: **2 OCPU / 12 GB RAM, 200 GB disk, 10 TB/month**.
   Stay inside them and you pay nothing. Never upgrade to paid.
2. Create the free VM (Ubuntu 24.04, Ampere `VM.Standard.A1.Flex`, 2 OCPU / 12 GB).
3. Copy `server/` to the VM, run `./install-ffmpeg.sh`, copy
   `stream.conf.example` → `stream.conf`, paste the Stream Key, upload the video.
4. `./live-loop.sh start` — the live runs even after you close SSH and turn
   your PC off. `./live-loop.sh status` / `stop` to check / stop.
5. (Optional) Enable the systemd service for auto-start after a VM reboot,
   and the status server so the app’s **Cloud Server Online** card works.
6. In the app, switch to **Cloud Server** mode, enter the VM public IP,
   press **Check Server**.

Uploading a video to the server: `scp -i key.pem video.mp4 ubuntu@<IP>:~/youtube-live/videos/`
(or WinSCP on Windows). If you change the video, restart the loop
(`./live-loop.sh restart`).

## Connect YouTube (optional, display only in V1)
The **＋ Connect YouTube** button signs in with Google in your browser
(OAuth loopback — your password is never asked for or stored) and shows
your channel name / subscribers in the Connected Channel card.
You need a Google Cloud **Client ID + Secret** in Settings for this.
**Streaming itself does not need it** — Stream-Key mode works without any
Google verification. Applying the title/description to YouTube from inside
the app would need the extra YouTube live scope + Google verification, so
V1 deliberately does not do that — set the text in Studio.

## Updates — in-app notification with changelog
- On startup the app silently checks for a newer release (only if a repo
  is set in Settings → Updates). If one exists, a pop-up shows the new
  version and **what changed in this update** (the release notes), with a
  Download button. Nothing is downloaded or installed automatically.
- Update source: a GitHub repo (`owner/repo`, public Releases API) or a
  custom `version.json` URL. See [`CHANGELOG.md`](CHANGELOG.md) for how a
  new version is released (bump `version` in `package.json` + `version.json`,
  tag `vX.Y.Z`, create a Release and paste the changelog).

## GitHub + EXE build
- **Local build (Windows, works today):** double-click `build-windows.bat`
  → installer lands in `dist/YouTubeLiveLoopTool-Setup.exe`.
- **GitHub workflow:** `.github/workflows/build-windows.yml` builds the
  installer automatically on every version tag (`v*`) or manual run, and
  uploads the `.exe` as an artifact. No code change is needed for it.
- **⚠️ KNOWN BLOCKER:** GitHub Actions is **disabled** on the `ShoaibAzeez`
  account (support ticket **#4937420**, still open, no reply yet). So the
  workflow file is ready, but **no repo has been pushed and no Actions run
  has been attempted or claimed**. Fallback: create the repo on a different
  account (account name to be confirmed by the user) and push there.
  **Do not push anything until the user confirms the account name.**

## Project layout
```
package.json / electron-builder.yml / build-windows.bat
src/main/      main.js, streamer.js (FFmpeg loop), oauth.js, store.js, updater.js
src/preload/   preload.js (the only main↔renderer bridge)
src/renderer/  index.html, css/styles.css, js/app.js (sky-blue UI from the preview)
server/        Oracle VM scripts + ORACLE-SETUP.md
.github/workflows/build-windows.yml
version.json / CHANGELOG.md
```

## Troubleshooting
- **“FFmpeg could not start”** — install FFmpeg and make sure `ffmpeg` is on
  PATH (Windows: `winget install Gyan.FFmpeg` or the ffmpeg.org build).
- **Live shows “No data / reconnecting” in Studio** — wrong Stream Key is
  the usual cause. Re-copy it from Studio (it changes if you reset it).
- **Stream drops and restarts** — normal on a weak connection; Auto Restart
  brings it back in a few seconds. Check `live-loop.log` on the server.
- **Server shows Offline in the app** — VM stopped, or port 8080 closed,
  or `status-server.py` not running. See `server/ORACLE-SETUP.md` Step 3.
