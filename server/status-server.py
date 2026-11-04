#!/usr/bin/env python3
"""status-server.py — tiny status server for the Cloud Server card in the app.
Runs on the VM (port 8080) and answers GET /status with JSON:
  {"streaming": true/false, "message": "..."}
Only Python standard library — no pip install needed.
Run:  nohup python3 ~/youtube-live/status-server.py >/dev/null 2>&1 &
Or enable it with the systemd service (see youtube-live-loop.service).
"""
import json
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 8080

def is_streaming():
    r = subprocess.run(["pgrep", "-f", "ffmpeg.*rtmp://a.rtmp.youtube.com"],
                       capture_output=True, text=True)
    return bool(r.stdout.strip())

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/status":
            self.send_response(404); self.end_headers(); return
        streaming = is_streaming()
        body = json.dumps({
            "streaming": streaming,
            "message": "Live is running on the server." if streaming else "Server is up, but no live is running.",
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass  # keep the log quiet

if __name__ == "__main__":
    print(f"Status server on port {PORT} ...")
    HTTPServer(("0.0.0.0", PORT), H).serve_forever()
