# server/ — 24/7 cloud streaming scripts

These scripts run on the Oracle Cloud Always Free VM (Ubuntu 24.04).
They are the “Cloud mode” half of the tool. The desktop app never touches
your server directly except for the status check.

| File | What it does |
|---|---|
| `ORACLE-SETUP.md` | Full guide: Oracle account (debit card = verification only), free VM, firewall, install, start |
| `install-ffmpeg.sh` | One-time install of FFmpeg + tools on the VM |
| `live-loop.sh` | `start` / `stop` / `restart` / `status` / `run` — the 24/7 loop with auto-restart on drop |
| `stream.conf.example` | Copy to `stream.conf`, paste your Stream Key + video path. **Never commit the real one.** |
| `status-server.py` | Tiny status server (port 8080) so the app can show Cloud Server Online/Offline |
| `youtube-live-loop.service` | systemd unit — auto-start the loop after a VM reboot |

Quick start on the VM:
```
chmod +x install-ffmpeg.sh live-loop.sh
./install-ffmpeg.sh
cp stream.conf.example stream.conf   # then edit it
./live-loop.sh start
./live-loop.sh status
```
