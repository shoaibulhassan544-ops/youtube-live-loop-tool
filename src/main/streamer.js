'use strict';
/**
 * FFmpeg loop streamer.
 * Builds the exact loop command, spawns it, watches it, and restarts it
 * on drop when Auto Restart is on. The stream key is passed only to the
 * child process environment/argv and is NEVER written to the log.
 *
 * Command (single file):
 *   ffmpeg -re -stream_loop -1 -i video.mp4 -vf scale=1280:720
 *          -c:v libx264 -preset veryfast -b:v 2500k -maxrate 2500k -bufsize 5000k
 *          -r 30 -g 60 -c:a aac -b:a 128k -f flv rtmp://a.rtmp.youtube.com/live2/<key>
 * Playlist: same command with `-f concat -safe 0 -stream_loop -1 -i list.txt`.
 */
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const QUALITY = {
  '720p': { scale: '1280:720', videoBitrate: '2500k', bufsize: '5000k' },
  '1080p': { scale: '1920:1080', videoBitrate: '4500k', bufsize: '9000k' },
};

function buildArgs(opts) {
  // opts: { playlist: [{path}], loop, quality, rtmpUrl, streamKey, concatListPath? }
  const q = QUALITY[opts.quality] || QUALITY['720p'];
  const args = ['-hide_banner', '-loglevel', 'info', '-re'];
  let input = null;
  if (opts.playlist.length > 1 || (opts.playlist.length === 1 && opts.loop && opts.useConcat)) {
    args.push('-f', 'concat', '-safe', '0');
    if (opts.loop) args.push('-stream_loop', '-1');
    args.push('-i', opts.concatListPath);
    input = 'concat';
  } else {
    if (opts.loop) args.push('-stream_loop', '-1');
    args.push('-i', opts.playlist[0].path);
    input = 'single';
  }
  args.push(
    '-vf', `scale=${q.scale}:force_original_aspect_ratio=decrease,pad=${q.scale}:(ow-iw)/2:(oh-ih)/2`,
    '-c:v', 'libx264', '-preset', 'veryfast',
    '-b:v', q.videoBitrate, '-maxrate', q.videoBitrate, '-bufsize', q.bufsize,
    '-r', '30', '-g', '60',
    '-c:a', 'aac', '-b:a', '128k',
    '-f', 'flv',
    `${opts.rtmpUrl.replace(/\/$/, '')}/${opts.streamKey}`
  );
  return { args, input, quality: q };
}

/** Mask the stream key in any ffmpeg output line before logging. */
function maskKey(line, streamKey) {
  if (!line) return '';
  if (streamKey && line.includes(streamKey)) return line.split(streamKey).join('••••••••');
  return line;
}

/** ffprobe: duration / resolution / codec for one file. */
function probe(filePath) {
  return new Promise((resolve) => {
    execFile('ffprobe', [
      '-v', 'quiet', '-print_format', 'json',
      '-show_format', '-show_streams', filePath,
    ], { timeout: 30000 }, (err, stdout) => {
      if (err) return resolve({ ok: false, error: err.message });
      try {
        const data = JSON.parse(stdout);
        const v = (data.streams || []).find((s) => s.codec_type === 'video') || {};
        resolve({
          ok: true,
          durationSec: Math.round(parseFloat(data.format?.duration || 0)),
          width: v.width || 0,
          height: v.height || 0,
          codec: v.codec_name || '',
          format: data.format?.format_name || '',
        });
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    });
  });
}

class Streamer {
  constructor(onEvent) {
    this.onEvent = onEvent || (() => {});
    this.proc = null;
    this.running = false;
    this.stoppedByUser = false;
    this.startedAt = null;
    this.reconnects = 0;
    this.restartTimer = null;
    this.concatListPath = null;
  }
  emit(type, message) { this.onEvent({ type, message, at: new Date().toISOString() }); }

  writeConcatList(playlist) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yt-live-loop-'));
    const listPath = path.join(dir, 'playlist.txt');
    const lines = playlist.map((v) => `file '${String(v.path).replace(/'/g, "'\\''")}'`).join('\n');
    fs.writeFileSync(listPath, lines, 'utf8');
    this.concatListPath = listPath;
    return listPath;
  }

  start(opts) {
    if (this.running) return { ok: false, error: 'Already streaming' };
    if (!opts.playlist || opts.playlist.length === 0) return { ok: false, error: 'No video selected' };
    if (!opts.streamKey) return { ok: false, error: 'Stream key is not set. Add it from YouTube Studio first.' };
    this.stoppedByUser = false;
    this.reconnects = 0;
    const concatListPath = opts.playlist.length > 1 ? this.writeConcatList(opts.playlist) : null;
    const built = buildArgs({ ...opts, concatListPath, useConcat: opts.playlist.length > 1 });
    this._spawn(built, opts);
    this.startedAt = Date.now();
    this.running = true;
    this.emit('start', `Live started (${built.input}, ${opts.quality}, loop ${opts.loop ? 'on' : 'off'}).`);
    return { ok: true, commandPreview: `ffmpeg -re ${built.input === 'concat' ? '-f concat -stream_loop -1 -i playlist.txt' : '-stream_loop -1 -i <video>'} -vf scale=${built.quality.scale} -c:v libx264 -c:a aac -f flv <rtmp-url>/<key-hidden>` };
  }

  _spawn(built, opts) {
    const child = spawn('ffmpeg', built.args, { windowsHide: true });
    this.proc = child;
    child.stderr.on('data', (d) => {
      const line = maskKey(d.toString().trim(), opts.streamKey);
      // Keep logs useful, not noisy: only progress lines every ~30s are forwarded
      // by the caller through the 'ffmpeg' event; here we forward errors + status.
      if (/error|failed|denied|invalid|unable/i.test(line)) this.emit('ffmpeg-error', line);
    });
    child.on('error', (err) => {
      this.emit('error', `FFmpeg could not start: ${err.message}. Is FFmpeg installed?`);
      this.running = false;
    });
    child.on('close', (code) => {
      this.proc = null;
      if (this.stoppedByUser) {
        this.running = false;
        this.emit('stop', 'Live stopped.');
        return;
      }
      // FFmpeg exited on its own (network drop / YouTube closed the stream).
      this.emit('drop', `Stream dropped (ffmpeg exited, code ${code}).`);
      if (opts.autoRestart) {
        this.reconnects += 1;
        const delay = (opts.reconnectDelaySec || 5) * 1000;
        this.emit('reconnect', `Auto-restart ${this.reconnects} in ${delay / 1000}s…`);
        this.restartTimer = setTimeout(() => {
          if (this.stoppedByUser) return;
          this._spawn(built, opts);
        }, delay);
      } else {
        this.running = false;
        this.emit('stop', 'Stream ended. Auto Restart is off.');
      }
    });
  }

  stop() {
    this.stoppedByUser = true;
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    if (this.proc) {
      try { this.proc.kill('SIGINT'); } catch (e) { /* already gone */ }
      // Force-kill if it does not exit cleanly within 5s.
      setTimeout(() => { try { this.proc && this.proc.kill('SIGKILL'); } catch (e) { /* gone */ } }, 5000);
    } else {
      this.running = false;
      this.emit('stop', 'Live stopped.');
    }
    return { ok: true };
  }

  status() {
    return {
      running: this.running,
      startedAt: this.startedAt,
      uptimeSec: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
      reconnects: this.reconnects,
    };
  }
}

module.exports = { Streamer, buildArgs, probe, maskKey, QUALITY };
