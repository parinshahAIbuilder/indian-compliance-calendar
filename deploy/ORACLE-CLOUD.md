# Run it free on Oracle Cloud (always on — no office PC needed)

Oracle's *Always Free* tier gives you a small Linux server that never sleeps. Choose the **India West (Mumbai)**
or **India South (Hyderabad)** region so BSE/NSE see an Indian address. Time needed: ~30 minutes.

## 1. Create the account
1. Go to https://www.oracle.com/cloud/free/ → **Start for free**.
2. Fill in your details. **Home region: India West (Mumbai)** — this cannot be changed later.
3. Add a card for identity verification (Always Free resources are not charged).
4. Wait for the "Your account is ready" e-mail, then sign in at https://cloud.oracle.com.

## 2. Create the server
1. Menu ☰ → **Compute → Instances → Create instance**. Name: `compliance-calendar`.
2. **Image and shape → Edit**
   - Image: **Canonical Ubuntu 22.04** (or 24.04).
   - Shape: **Ampere → VM.Standard.A1.Flex**, 1 OCPU, 6 GB memory (Always Free eligible).
     If it says "out of capacity", try again later or pick **VM.Standard.E2.1.Micro** (also free).
3. **Add SSH keys → Generate a key pair for me → Save private key** (keep this `.key` file safe).
4. Click **Create**. When it is *Running*, copy the **Public IP address**.

## 3. Open the web ports
Instance page → **Primary VNIC → Subnet → Security Lists → Default Security List → Add Ingress Rules**:
- Source CIDR `0.0.0.0/0`, IP protocol **TCP**, destination port **80** → Add
- Repeat with destination port **443**

## 4. Install the app (one command)
Connect from your PC (PowerShell or Terminal):
```bash
ssh -i path\to\ssh-key.key ubuntu@<PUBLIC-IP>
```
Then run:
```bash
curl -fsSL https://raw.githubusercontent.com/parinshahAIbuilder/indian-compliance-calendar/main/deploy/server-setup.sh | sudo bash
```
At the end it prints your address, e.g. `https://152-67-12-34.sslip.io`. Open it and create the owner account
(or migrate your existing data — step 5). To use your own domain instead, point an A-record at the server and run
the same command with `sudo DOMAIN=compliance.yourcompany.com bash`.

## 5. Move an existing installation (optional)
From the machine running the current app:
```bash
bash deploy/migrate-to-server.sh "<current app folder>" ubuntu@<PUBLIC-IP> path/to/ssh-key.key
```
Then stop the old installation so reminders are not sent twice.

## Day-to-day
- Reminders run every day at the configured time, BSE is checked every 2 hours — no PC needs to be on.
- Upgrade to the latest version: re-run the step-4 command (data and settings are kept).
- Logs: `sudo journalctl -u compliance-calendar -f` · Restart: `sudo systemctl restart compliance-calendar`
- Backups: copy `/opt/compliance-calendar/data/db.json` and `/opt/compliance-calendar/.env` somewhere safe regularly.
