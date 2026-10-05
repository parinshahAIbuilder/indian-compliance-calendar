#!/usr/bin/env bash
# One-command install of the Compliance Calendar on an Ubuntu server (Oracle Cloud Always Free, AWS, DigitalOcean …).
#
#   curl -fsSL https://raw.githubusercontent.com/parinshahAIbuilder/indian-compliance-calendar/main/deploy/server-setup.sh | sudo bash
#
# Optional:  ... | sudo DOMAIN=compliance.example.com bash     (your own domain, DNS A-record pointing to this server)
# Re-running the script upgrades the app and keeps data/ and .env.
#
# What it does: installs Node.js 20, a headless Chromium (BSE fallback), Caddy (automatic HTTPS),
# the app as a systemd service that starts on boot and restarts on failure, and opens ports 80/443.
set -euo pipefail

REPO="${REPO:-https://github.com/parinshahAIbuilder/indian-compliance-calendar.git}"
APP_DIR=/opt/compliance-calendar
SRC_DIR=/opt/compliance-calendar-src
SVC_USER=compliance
PORT=4300

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Please run with sudo"; exit 1; }

say "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  say "Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  say "Installing Caddy (HTTPS)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

say "Fetching the app"
id -u "$SVC_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "/home/$SVC_USER" --shell /usr/sbin/nologin "$SVC_USER"
rm -rf "$SRC_DIR" && git clone --depth 1 "$REPO" "$SRC_DIR"
node "$SRC_DIR/scripts/deploy_app.mjs" "$APP_DIR"

say "Installing headless Chromium for the BSE fallback"
npx -y playwright@1.47.2 install-deps chromium >/dev/null
sudo -u "$SVC_USER" -H npx -y playwright@1.47.2 install chromium

PUBIP="$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')"
HOST="${DOMAIN:-${PUBIP//./-}.sslip.io}"

say "Configuring $APP_DIR/.env"
setenv() { if grep -q "^$1=" "$APP_DIR/.env"; then sed -i "s#^$1=.*#$1=$2#" "$APP_DIR/.env"; else echo "$1=$2" >> "$APP_DIR/.env"; fi; }
setenv PORT "$PORT"
setenv APP_URL "https://$HOST"
chown -R "$SVC_USER:$SVC_USER" "$APP_DIR"
chmod 600 "$APP_DIR/.env"

say "Creating the service (auto-start + auto-restart)"
cat > /etc/systemd/system/compliance-calendar.service <<EOF
[Unit]
Description=Compliance Calendar
After=network-online.target
Wants=network-online.target

[Service]
User=$SVC_USER
WorkingDirectory=$APP_DIR
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable compliance-calendar
systemctl restart compliance-calendar

say "Configuring HTTPS for $HOST"
cat > /etc/caddy/Caddyfile <<EOF
$HOST {
  encode gzip
  reverse_proxy 127.0.0.1:$PORT
}
EOF
systemctl restart caddy

say "Opening ports 80 and 443 in the server firewall"
for p in 80 443; do
  iptables -C INPUT -p tcp --dport $p -m state --state NEW -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport $p -m state --state NEW -j ACCEPT
done
netfilter-persistent save >/dev/null 2>&1 || true

sleep 5
if systemctl is-active --quiet compliance-calendar; then STATUS="running"; else STATUS="NOT running – check: journalctl -u compliance-calendar -n 50"; fi
cat <<EOF

=====================================================================
 Compliance Calendar is $STATUS
 Open:  https://$HOST
 (First visit can take ~1 minute while the HTTPS certificate is issued.)

 If the page does not open, make sure ports 80 and 443 are allowed in
 Oracle Cloud: Networking → Virtual Cloud Networks → your VCN → Security
 Lists → Default → Add Ingress Rules (source 0.0.0.0/0, TCP, 80 and 443).

 Useful commands:
   sudo systemctl status compliance-calendar
   sudo journalctl -u compliance-calendar -f
   sudo nano $APP_DIR/.env   (then: sudo systemctl restart compliance-calendar)
=====================================================================
EOF
