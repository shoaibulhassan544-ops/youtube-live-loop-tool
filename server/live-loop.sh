#!/usr/bin/env bash
# live-loop.sh — start / stop / status the 24/7 YouTube live loop ON the server.
# Usage (on the VM, inside ~/youtube-live):
#   ./live-loop.sh start     # start streaming (reads stream.conf)
#   ./live-loop.sh stop      # stop streaming
#   ./live-loop.sh status    # is it running? uptime?
#   ./live-loop.sh restart   # stop + start
#
# stream.conf format (one line each, no quotes):
#   RTMP_URL=rtmp://a.rtmp.youtube.com/live2
#   STREAM_KEY=xxxx-xxxx-xxxx-xxxx-xxxx
#   VIDEO=/home/ubuntu/youtube-live/videos/myvideo.mp4
#   QUALITY=720p   (720p or 1080p)
#   LOOP=1         (1 = loop forever, 0 = play once then stop)
set -euo pipefail
cd "$(dirname "$0")"
CONF="$PWD/stream.conf"
PIDFILE="$PWD/live-loop.pid"
LOG="$PWD/live-loop.log"

need_conf() {
  if [ ! -f "$CONF" ]; then
    echo "ERROR: stream.conf not found. Copy stream.conf.example to stream.conf and fill in your Stream Key."
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$CONF"
  if [ -z "${STREAM_KEY:-}" ] || [ -z "${VIDEO:-}" ]; then
    echo "ERROR: STREAM_KEY and VIDEO must be set in stream.conf."
    exit 1
  fi
}

quality_args() {
  if [ "${QUALITY:-720p}" = "1080p" ]; then
    echo "1920:1080 4500k 9000k"
  else
    echo "1280:720 2500k 5000k"
  fi
}

do_run() {
  # Foreground mode for systemd: runs the restart loop in this process.
  need_conf
  read -r SCALE BITRATE BUFSIZE <<< "$(quality_args)"
  LOOP_ARGS=""
  if [ "${LOOP:-1}" = "1" ]; then LOOP_ARGS="-stream_loop -1"; fi
  while true; do
    ffmpeg -hide_banner -loglevel info -re $LOOP_ARGS -i "$VIDEO" \
      -vf "scale=${SCALE}:force_original_aspect_ratio=decrease,pad=${SCALE}:(ow-iw)/2:(oh-ih)/2" \
      -c:v libx264 -preset veryfast -b:v $BITRATE -maxrate $BITRATE -bufsize $BUFSIZE \
      -r 30 -g 60 -c:a aac -b:a 128k -f flv "$RTMP_URL/$STREAM_KEY" >>"$LOG" 2>&1 || true
    echo "$(date): ffmpeg exited, restarting in 5s..." >>"$LOG"
    sleep 5
  done
}

do_start() {
  need_conf
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "Already running (PID $(cat "$PIDFILE")). Use ./live-loop.sh stop first."
    exit 0
  fi
  # Run the foreground loop detached, so it survives your SSH logout —
  # and your PC being off. (`run` mode restarts ffmpeg on drop by itself.)
  nohup "$0" run >>"$LOG" 2>&1 &
  echo $! > "$PIDFILE"
  echo "Live loop started (PID $(cat "$PIDFILE")). Log: $LOG"
  echo "Check YouTube Studio — the stream should appear as Live within a minute."
}

do_stop() {
  if [ -f "$PIDFILE" ]; then
    PID="$(cat "$PIDFILE")"
    kill "$PID" 2>/dev/null || true
    pkill -P "$PID" ffmpeg 2>/dev/null || true
    pkill -f "ffmpeg.*rtmp://a.rtmp.youtube.com" 2>/dev/null || true
    rm -f "$PIDFILE"
    echo "Live loop stopped."
  else
    pkill -f "ffmpeg.*rtmp://a.rtmp.youtube.com" 2>/dev/null || true
    echo "No PID file — stopped any running ffmpeg stream (if there was one)."
  fi
}

do_status() {
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "RUNNING (PID $(cat "$PIDFILE"))"
    ps -o pid,etime,cmd -p "$(cat "$PIDFILE")" 2>/dev/null || true
    tail -n 5 "$LOG" 2>/dev/null || true
  else
    echo "NOT RUNNING"
  fi
}

case "${1:-status}" in
  start) do_start ;;
  run) do_run ;;
  stop) do_stop ;;
  restart) do_stop; sleep 2; do_start ;;
  status) do_status ;;
  *) echo "Usage: $0 {start|run|stop|restart|status}"; exit 1 ;;
esac
