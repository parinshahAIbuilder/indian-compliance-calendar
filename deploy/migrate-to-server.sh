#!/usr/bin/env bash
# Copies an existing installation's data (calendar, users, settings, encrypted mailbox secrets) to the server.
# Run on the machine that has the current app:
#   bash deploy/migrate-to-server.sh <path-to-local-app> ubuntu@<server-ip> <path-to-ssh-private-key>
# The server keeps its own PORT and APP_URL; everything else (incl. APP_SECRET, needed to decrypt
# stored passwords) comes from the local .env.
set -euo pipefail
LOCAL="${1:?local app folder}"; TARGET="${2:?user@server}"; KEY="${3:?ssh key}"
APP_DIR=/opt/compliance-calendar
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new"

[ -f "$LOCAL/data/db.json" ] || { echo "No data/db.json in $LOCAL"; exit 1; }
echo "==> Uploading data"
scp -i "$KEY" -o StrictHostKeyChecking=accept-new "$LOCAL/data/db.json" "$TARGET:/tmp/cc-db.json"
scp -i "$KEY" "$LOCAL/.env" "$TARGET:/tmp/cc-env"

echo "==> Installing data on the server"
$SSH "$TARGET" "sudo bash -s" <<EOF
set -e
systemctl stop compliance-calendar
cp $APP_DIR/data/db.json $APP_DIR/data/db.before-migration.json 2>/dev/null || true
keep_port=\$(grep '^PORT=' $APP_DIR/.env | cut -d= -f2-)
keep_url=\$(grep '^APP_URL=' $APP_DIR/.env | cut -d= -f2-)
grep -vE '^(PORT|APP_URL)=' /tmp/cc-env > $APP_DIR/.env
echo "PORT=\$keep_port" >> $APP_DIR/.env
echo "APP_URL=\$keep_url" >> $APP_DIR/.env
mkdir -p $APP_DIR/data && mv /tmp/cc-db.json $APP_DIR/data/db.json && rm -f /tmp/cc-env
chown -R compliance:compliance $APP_DIR && chmod 600 $APP_DIR/.env
systemctl start compliance-calendar
sleep 4; systemctl is-active compliance-calendar && echo "Migrated. App URL: \$keep_url"
EOF
echo "==> Done. Stop the old installation so reminders are not sent twice."
