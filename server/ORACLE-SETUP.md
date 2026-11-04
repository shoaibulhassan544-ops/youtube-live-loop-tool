# Oracle Cloud Always Free — server setup guide

This is the server that keeps the live running 24/7, even when your laptop,
power or internet goes off. It costs **Rs. 0 per month** if you stay inside
the Always Free limits.

## What you get free, forever (Always Free, not a trial)
- **2 OCPU + 12 GB RAM** ARM (Ampere A1) virtual machine — always on
- **200 GB** disk, **10 TB** outbound traffic per month
- One 720p live loop uses roughly 1–1.5 Mbps upload, about 300–500 GB a month — well inside 10 TB.

## What you need
- An email address and a mobile number.
- **A debit card** (user confirmed: available). The card is **only for
  identity verification**. Oracle places a small temporary hold (about
  $1, reversed) and **does not charge you** as long as you only use Always
  Free resources and never upgrade to paid. Prepaid / virtual cards are
  usually refused — use a real bank debit card.

## Step 1 — Create the Oracle account
1. Go to https://cloud.oracle.com and click **Sign Up** / **Start for free**.
2. Fill in name, email, country (Pakistan), mobile number.
3. Enter the debit card for verification. Do NOT choose any paid upgrade.
4. Pick a **home region** — this is permanent for free resources and cannot
   be changed later. Choose a region with good Ampere capacity (e.g.
   Mumbai / Singapore are commonly used from Pakistan; if creation fails
   with “out of capacity”, try another region or try again later).
5. You also get $300 trial credit for 30 days — ignore it, do not spend it
   on paid resources. Always Free resources stay free after the trial ends.

## Step 2 — Create the free VM
1. Console → **Compute → Instances → Create Instance**.
2. Name: `youtube-live` (anything).
3. Image: **Canonical Ubuntu 24.04**.
4. Shape: **VM.Standard.A1.Flex** (Ampere), set **2 OCPU and 12 GB RAM**
   (the Always Free maximum — going higher risks auto-termination).
   (The two small AMD micro VMs are too weak for video — do not use them.)
5. Networking: keep the default VCN, **assign a public IPv4 address**.
6. Add SSH key: generate a new key pair and **download the private key
   immediately** (shown only once). Keep it safe — it is the only login.
7. Create. Wait until the instance shows **Running** and note its **public IP**.

## Step 3 — Open the firewall (status check only)
The stream itself only needs *outbound* internet (already open). For the
app’s Cloud Server status card, open **port 8080** (TCP) for the status
server: VCN → Security List → Ingress Rule, source `0.0.0.0/0`, port `8080`.
Also open it in the VM firewall: `sudo iptables -I INPUT -p tcp --dport 8080 -j ACCEPT`
(or `sudo ufw allow 8080/tcp` if UFW is used).

## Step 4 — Install the live loop on the VM
Copy this `server/` folder to the VM, e.g. from your PC:
```
scp -i <your-key.pem> -r server/ install-ffmpeg.sh ubuntu@<PUBLIC-IP>:~/youtube-live/
```
(Or use WinSCP on Windows.) Then SSH in:
```
ssh -i <your-key.pem> ubuntu@<PUBLIC-IP>
cd ~/youtube-live
chmod +x install-ffmpeg.sh live-loop.sh
./install-ffmpeg.sh
cp stream.conf.example stream.conf
nano stream.conf     # paste your YouTube Stream Key + video path
```
Upload the video:
```
scp -i <your-key.pem> myvideo.mp4 ubuntu@<PUBLIC-IP>:~/youtube-live/videos/
```

## Step 5 — Start the 24/7 live
```
cd ~/youtube-live
./live-loop.sh start
./live-loop.sh status
```
Check YouTube Studio — the stream appears as Live within a minute.
Stop it with `./live-loop.sh stop`. Logs: `tail -f live-loop.log`.

Optional (recommended) — start automatically after a VM reboot:
```
sudo cp youtube-live-loop.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now youtube-live-loop
```
Optional — status server for the app’s Cloud Server card:
```
nohup python3 ~/youtube-live/status-server.py >/dev/null 2>&1 &
```
Then put the VM public IP in the app (Cloud mode → Server IP → Check Server).

## Staying free — the rules that matter
- **Never** create a resource that is not labelled **Always Free** and never
  click “Upgrade to Pay As You Go”.
- Oracle may reclaim an Always Free VM that sits idle (CPU/network/memory
  under ~20%) for 7 days. A running live loop keeps it busy, so this
  normally does not trigger — but keep a backup of your video + stream.conf.
- If the VM ever disappears, repeat Steps 2–5 — the app and the scripts
  do not change.
