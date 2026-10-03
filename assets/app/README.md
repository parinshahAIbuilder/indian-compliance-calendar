# Compliance Calendar – Listed Companies, Private Companies & LLPs

Dashboard for the Company Secretary covering SEBI LODR (equity & debt), SEBI PIT / SAST / DP / ICDR,
Companies Act 2013 / MCA, LLP Act and (optionally) tax & labour deadlines — monthly, quarterly,
half-yearly, annual and event-based.

## What it does
| Feature | How |
|---|---|
| Compliance master per entity | Listed (equity and/or debt), unlisted public, private limited, LLP. Profile flags (monitoring agency, earnings calls, BRSR, Large Corporate, cost audit, CSR, tax) switch items on/off. |
| Due dates | Calculated in IST. Results-cycle items (Reg 29, outcome, newspaper, investor presentation, earnings call) follow the **board meeting / earnings call date** — entered by you or auto-detected from BSE. AGM-linked items (AOC-4, MGT-7, ADT-1, MGT-15, Reg 44(3)) follow the AGM date. |
| BSE auto-verification | Every 2 hours (and before each daily e-mail) the app reads BSE **Corporate Announcements**, **Integrated Filing – Finance / Governance** and **Shareholding Pattern** for the scrip, and writes the exact BSE submission date & time against the matching compliance, with a link to the filing. |
| Daily e-mail reminders | From *N* days (default 5) before the due date, every day at 10:30 IST, until the item is filed (on BSE or marked in the app). Overdue items keep reminding. Snooze per item. To + CC participants per company. |
| Circulars | BSE circulars to listed companies, NSE Listing / Debt / Compliance circulars, SEBI circulars & regulations — refreshed every 2 hours, with NEW badges and Equity/Debt filter. New ones are added to the daily e-mail. |
| Manual & event entries | Add any custom compliance (any frequency) or log an event (resolution, allotment, director change, record date, insider-trade disclosure…) and the due date is derived. |
| Real-time | All open dashboards refresh automatically when anything changes (BSE match, another user's update, new circulars). |

## Run
1. Copy `.env.example` → `.env` and paste the Gmail **App Password** into `GMAIL_APP_PASSWORD`.
2. Double-click `start.bat` (or `npm start`). Dashboard: http://localhost:4300
3. The app must be running for scheduled checks and e-mails. To share with the team, run it on an always-on
   office PC/server and set `APP_URL` to that machine's address.

Data is stored in `data/db.json` (back this file up).

## Notes
* Items tagged **⚠ verify timeline** were recently amended or vary by circular — confirm against the latest SEBI / MCA text.
* Working-day timelines exclude weekends; add exchange holidays under *Companies & Settings*.
* Items without a BSE footprint (MCA forms, listing fees, MBP-1, DPT-3 etc.) are marked done manually.

## Accounts, clients & sharing
* **First run:** the app asks you to create the *platform owner* account. Your own team works in the default workspace.
* **Team:** *Team & Clients* → invite colleagues as Admin or Member. They receive a link and set their own password.
* **Clients:** *Team & Clients* → *New client workspace* (plan, company limit, valid-until date, client admin e-mail) → send the invite link.
  Each client sees only its own companies, connects its **own sender mailbox** (Email Updates → Sender account) and gets its own daily reminders.
  Use the workspace switcher (top right) to open any client's workspace.
* **Run on the office PC:** run `install-autostart.ps1` as Administrator (starts with Windows, restarts on failure, opens port 4300 on the office network).
* **Public link for outside clients:** `share-online.ps1` (temporary trycloudflare link) or `share-online.ps1 -Token …` for a permanent
  address such as https://compliance.yourcompany.com. Set `APP_URL` in `.env` to that address so e-mails and invite links use it.
* Back up `data/db.json` and `.env` regularly (`APP_SECRET` in `.env` is needed to read stored mailbox passwords).
