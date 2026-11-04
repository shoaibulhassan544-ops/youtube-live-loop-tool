#!/usr/bin/env bash
# install-ffmpeg.sh — run ONCE on the Oracle Cloud Always Free VM (Ubuntu 24.04).
# Installs FFmpeg + tools the live loop needs, and creates the working folder.
set -euo pipefail
sudo apt-get update -y
sudo apt-get install -y ffmpeg curl python3 screen
mkdir -p ~/youtube-live/videos
echo "FFmpeg version:"
ffmpeg -version | head -n 1
echo "Done. Put your video in ~/youtube-live/videos/ and edit ~/youtube-live/stream.conf"
