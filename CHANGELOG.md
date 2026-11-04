# Changelog — YouTube Live Loop Tool

## v1.0.0 (2026-11-04) — first release
- Stream-Key mode: paste the RTMP URL + Stream Key from YouTube Studio, no Google verification needed to go live.
- Local Test mode: FFmpeg loops the video from this PC to YouTube Live.
- Cloud mode: stream 24/7 from an Oracle Cloud Always Free VM (server scripts in `server/`), live keeps running when the PC, power or internet goes off.
- Playlist: several videos in one loop. Quality 720p / 1080p. Loop on/off. Auto Restart on drop.
- YouTube Connect (Google OAuth loopback) for the channel card — display only in V1.
- Stream key stored encrypted (OS keychain), never in logs.
- In-app update check with changelog pop-up (GitHub Releases or a version.json URL).
- FREE tool — no licence, no key, no payment.

## How a new version is released (for the owner)
1. Bump `version` in `package.json` AND in `version.json`, add an entry at the top of this file.
2. Commit, tag and push: `git tag v1.1.0 && git push origin v1.1.0` — the GitHub workflow builds the Windows installer automatically.
3. On GitHub, create a Release for the tag and paste the changelog from this file into the release notes. The app reads those notes and shows them in its update pop-up.
4. If the workflow cannot run (Actions disabled on the account), build locally with `build-windows.bat` and attach the `.exe` to the release by hand.
