# Getting started

This guide assumes no programming background. Allow about 10–15 minutes.

## 1. Install the prerequisites

| Software | Why | How to check |
|---|---|---|
| **Node.js 18 or newer** | runs the app | open a terminal and type `node -v` → should print `v18…` or higher |
| **curl** | reads BSE / NSE / SEBI | `curl --version` (built into Windows 10+, macOS, most Linux) |
| **Google Chrome or Microsoft Edge** | fallback when BSE blocks ordinary requests | already installed on most PCs |

Download Node.js (choose the **LTS** version) from https://nodejs.org and install with default options.

> **Where is the terminal?** Windows: press `Win`, type **PowerShell**, Enter. macOS: press `Cmd + Space`, type **Terminal**.

## 2. Download this repository

**Option A — with Git**

```bash
git clone https://github.com/parinshahAIbuilder/indian-compliance-calendar.git
cd indian-compliance-calendar
```

**Option B — without Git:** on the GitHub page click **Code → Download ZIP**, extract it, and open a terminal in the
extracted folder.

## 3. Install the app into a folder

```bash
node scripts/deploy_app.mjs ./compliance-calendar --org "Your Firm Name"
```

This copies the app into `compliance-calendar/`, installs its dependencies and creates a `.env` settings file.
Re-running the same command later **upgrades** the code and never touches your data (`data/`) or settings (`.env`).

## 4. Start it

```bash
cd compliance-calendar
node server.js
```

Windows users can instead double-click **`start.bat`** in the `compliance-calendar` folder.

Leave the window open — the app only checks BSE and sends reminders while it is running. Open
**http://localhost:4300** in your browser.

## 5. First-time setup

1. The first screen asks you to create the **platform owner** account (name, e-mail, password). This is the master login — keep it safe.
2. You land in your default workspace (named after `--org`).

## 6. Add your first company

1. Open **⚙ Companies & Settings → Add**.
2. **Listed company:** type part of the name, the BSE code (e.g. `544513`), NSE symbol or ISIN and pick it from the
   suggestions. Codes are filled in and BRSR is suggested based on market-cap rank.
3. **Private company / LLP:** choose the entity type and fill in the form.
4. Tick the profile flags that apply — listed debt, monitoring agency, earnings calls, BRSR, Large Corporate, cost audit,
   CSR, tax & labour. Only applicable compliances will appear.
5. Add **To / CC recipients** for reminders.
6. Save. For a listed company the app checks BSE straight away, so filed items arrive already ticked with their exact
   submission time.

## 7. Clean up history (once)

Click **✔ Mark past items done…** on the calendar and pick a cut-off date. Items before that date with no BSE footprint
(listing fee, MSME-1, DPT-3 …) are marked done, so the first reminder e-mail isn't flooded with old items.

## 8. Connect the e-mail sender

1. Go to **✉ Email Updates → Sender account**.
2. Choose Gmail / Outlook / Zoho / custom SMTP and enter the address and an **app password**
   (for Gmail: turn on 2-Step Verification, then create one at https://myaccount.google.com/apppasswords).
3. The app verifies the login when you save and stores the secret encrypted.
4. Set the **daily send time** (default 10:30 IST) and **days before due** to start reminding (default 5).

## 9. Enter event dates as they are fixed

On the calendar, enter the **Board Meeting date** (and **Earnings Call date**, if applicable) for each quarter, and the
**AGM date** for the year. All linked items (Reg 29, outcome, results, newspaper, investor presentation, earnings-call
items, AOC-4, MGT-7, ADT-1 …) recalculate immediately. For listed companies these dates are usually detected from BSE
automatically.

## 10. Share with your team (optional)

- **Same office Wi-Fi:** colleagues open `http://<your-PC-IP>:4300` (find the IP with `ipconfig` on Windows). Allow Node
  through Windows Firewall when prompted.
- **Invite people:** **👥 Team & Clients → Invite** — they receive a link and set their own password.
- **Run automatically at start-up (Windows):** run `install-autostart.ps1` as Administrator.
- **Access from outside the office:** see [`references/operations.md`](../references/operations.md) §4 (Cloudflare tunnel).
  Create the owner account **before** exposing any public link.

## Upgrading

```bash
cd indian-compliance-calendar
git pull
node scripts/deploy_app.mjs ./compliance-calendar
```

Restart the app. Your data and settings are kept.

## Backing up

Copy **`data/db.json`** and **`.env`** together to a safe place regularly. `.env` contains `APP_SECRET`, which is needed
to decrypt stored mailbox passwords.

Next: [User guide](user-guide.md) · [FAQ & troubleshooting](faq.md)
