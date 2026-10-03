---
name: indian-compliance-calendar
description: Build, deploy, run and extend a company-secretary compliance calendar for Indian companies — listed (NSE/BSE equity and debt), unlisted public, private limited and LLPs — covering SEBI LODR, PIT, SAST, Depositories, ICDR, Companies Act 2013 / MCA and LLP Act deadlines (monthly, quarterly, half-yearly, annual, event-based), with automatic BSE filing verification (exact submission date/time), daily e-mail and WhatsApp reminders until filed, BSE/NSE/SEBI circular feeds with read/unread tracking, and multi-client workspaces with logins. Use this skill whenever someone asks for a compliance calendar, statutory due-date tracker, LODR / ROC / MCA reminder system, "check if the company filed on BSE", board-meeting-driven due dates (Reg 29, Reg 33, Reg 47, earnings call), SEBI/NSE/BSE circular tracking, or wants to set up, share, host, fix or sell such a dashboard — even if they don't use the word "skill" or name the app.
---

# Indian Compliance Calendar

A ready-to-run Node.js web app (in `assets/app/`) plus the know-how to operate it. It gives a company secretary one
dashboard that knows every recurring statutory deadline for each entity, works out due dates from real events
(board meeting, earnings call, AGM), checks BSE to see whether each filing was actually made, and keeps reminding
people by e-mail/WhatsApp until it is.

Read the reference files only when the task needs them:
- `references/compliance-master.md` — every compliance item, frequency, timeline and which BSE source verifies it.
- `references/data-sources.md` — BSE/NSE/SEBI endpoints, required headers, quirks, how to re-discover a broken endpoint.
- `references/operations.md` — accounts & client workspaces, e-mail, WhatsApp (free + Twilio), hosting/sharing, known pitfalls, commercial notes.

## What the app does (so you can explain it)

| Area | Behaviour |
|---|---|
| Compliance master | 61 calendar items + 19 event-based items; applicability from the entity profile (listed equity/debt, unlisted public, private, LLP; monitoring agency, earnings calls, BRSR, Large Corporate, cost audit, CSR, tax & labour) |
| Due dates | IST; results-cycle items follow the board-meeting / earnings-call date, AGM-linked items follow the AGM; working-day rules skip weekends and entered holidays; "statutory latest" shown when no event date yet |
| BSE verification | Every 2 h and before each daily e-mail: announcements, Integrated Filing (Governance/Finance), Shareholding Pattern → submission timestamp + link written against the item; board-meeting and AGM dates auto-detected |
| Reminders | From N days before due (default 5) and every day until filed; e-mail via each workspace's own mailbox; WhatsApp one-tap (free) or Twilio (paid) |
| Circulars | BSE circulars to listed companies, NSE "circulars issued to listed companies" (equity + debt), SEBI circulars/master circulars/regulations; per-user unread badges |
| Multi-client | Owner + client workspaces, invites / join link / trial sign-up, plan limits and expiry, per-workspace sender mailbox |

## Typical tasks and how to do them

### 1. Set up the app for someone
1. Check Node 18+, curl and Chrome or Edge are available (`node -v`, `curl --version`). Windows 10+ has `curl.exe`; the browser is the fallback when BSE blocks non-browser requests.
2. Deploy: `node scripts/deploy_app.mjs "<target folder>" --org "<their firm name>"` (re-running it upgrades code and keeps `data/` and `.env`).
3. Start: `node server.js` in that folder (Windows: `start.bat`). Open `http://localhost:4300`.
4. Have the **user** create the owner account on the first-time setup screen. Don't pick passwords for people.
5. Add companies under *Companies & Settings → Add*: for listed companies type the name/BSE code/NSE symbol/ISIN and pick
   from the lookup (fills codes, suggests BRSR by market-cap rank); for private companies/LLPs fill the form. Saving a listed
   company triggers an immediate BSE check, so the calendar arrives pre-filled with real filing dates.
6. Suggest *Mark past items done…* once, so historical items without a BSE footprint (listing fee, MSME-1, DPT-3…)
   stop showing as overdue and don't flood the first reminder.
7. Sender mailbox: *Email Updates → Sender account* (Gmail app password etc.) — the user types the secret into the app.

### 2. Answer "has X been filed / when is Y due?"
Use the running app's data (calendar, Company Announcements tab, or `data/db.json`) rather than guessing. For a listed company
not in the app, query BSE directly using `references/data-sources.md` and report the exact `News_submission_dt`.
When quoting timelines, cite the regulation from `references/compliance-master.md`, and flag ⚠ items as "confirm against the latest circular".

### 3. Share it with a team or clients
Follow `references/operations.md` §1 and §4: same-Wi-Fi link first (`http://<LAN-IP>:4300`), temporary Cloudflare link for
testing, a named tunnel on the client's own domain for production, `APP_URL` set accordingly. Ask before installing
auto-start or downloading `cloudflared`, and make sure the owner account exists before any public link goes live.

### 4. Fix or extend it
- Add or change a compliance: edit `assets/app/lib/master.js` (template fields are documented at the top of the file),
  then regenerate `references/compliance-master.md` so the docs stay true.
- A source stopped working: `node scripts/check_sources.mjs [scripCode]`, then `references/data-sources.md` §6.
- Before editing UI date/keyboard handling, read the pitfalls table in `references/operations.md` §5 — each row is a bug
  real users hit; keep those fixes intact.
- After any change: `node --check` the edited files, restart the server, and verify in a browser (log in, open the affected tab).
  For risky changes (auth, workspaces, sign-up) test on a throwaway copy with its own `data/` and port instead of the live data.

## Ground rules

- **Secrets:** passwords, app passwords and Twilio tokens are typed by the user into the app or `.env` — never written by
  you, never echoed back. If someone pastes one into chat, advise revoking it.
- **Outward actions need a yes first:** sending e-mails/WhatsApp, publishing links, installing services, downloading tools,
  creating things in third-party accounts (Twilio templates, GitHub repos).
- **Legal content:** due dates are operational aids, not legal advice. Highlight ⚠ "verify timeline" items, and remind anyone
  commercialising the app that redistributing exchange data may need BSE/NSE permission.
- **Data:** keep `data/` and `.env` out of version control and back them up together (`APP_SECRET` decrypts stored secrets).
