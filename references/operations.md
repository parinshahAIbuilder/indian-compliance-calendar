# Running, sharing and supporting the app

## Contents
1. Accounts & workspaces
2. E-mail reminders
3. WhatsApp
4. Hosting & sharing links
5. Known pitfalls (and the fixes already in the code)
6. Commercial notes

## 1. Accounts & workspaces

- First visit shows **first-time setup** → creates the *platform owner*. Ask the user to fill it in themselves; never choose a password for them.
- Each client firm is an **organisation (workspace)**: its own companies, calendar, recipients, sender mailbox, Twilio, settings.
  The owner switches workspaces from the top bar. Plan, company limit and `validUntil` (subscription expiry) are set under
  *Team & Clients*; after expiry the client sees a renewal notice (API returns 402).
- People join via (a) a 7-day **invite link** per person, (b) a workspace **join link** (anyone with it becomes a member),
  or (c) public **sign-up** (`/#signup`, creates a trial workspace; off by default, owner toggles it).
- Every invite/join/sign-up link is produced twice: internet (`APP_URL`) and office Wi-Fi (`http://<LAN-IP>:4300`).
- Roles: owner/admin manage companies, recipients, settings, mailbox; member updates filings. Passwords are scrypt-hashed;
  sessions are HttpOnly cookies; login is throttled (10 failures / 15 min / IP).

## 2. E-mail reminders

- Daily at the workspace's send time (IST) the server: re-checks BSE → refreshes circulars → e-mails each company's items
  that are within *N* days of due (default 5) or overdue, until filed. Snoozed items are skipped.
- Sender mailbox per workspace (Email Updates → Sender account): Gmail / Outlook / Zoho / SMTP with an **app password**,
  verified on save and stored AES-256-GCM-encrypted with `APP_SECRET` (auto-generated into `.env`). The default workspace
  may instead use `GMAIL_USER` / `GMAIL_APP_PASSWORD` from `.env`.
- Gmail app passwords need 2-Step Verification: https://myaccount.google.com/apppasswords. If a user pastes a password into
  chat, tell them to revoke it and create a new one, and have them type the new one into the app/.env themselves.
- The e-mail carries a green **"Forward this reminder on WhatsApp"** button (wa.me link with the text prefilled).

## 3. WhatsApp

- **Free mode (default, no account):** buttons in the app and in each e-mail open `https://wa.me/<number>?text=…` with the
  reminder prefilled; the user taps Send. Official click-to-chat, no cost, no ban risk.
- **Automatic via Twilio (optional):** Account SID + Auth Token + sender. Pitfalls seen in practice:
  - The *sender* must be the Twilio sandbox `+14155238886` or a number registered as a WhatsApp sender in Twilio —
    not the user's own mobile. Recipients of the sandbox must first send the join code.
  - Twilio **trial** accounts can answer every free-text send with `ContentSid Required` and cannot create Content
    Templates (error 20003). Automatic WhatsApp therefore needs an upgraded (pay-as-you-go) account, an approved
    utility template (Content SID `HX…`, variables {{1}} company, {{2}} count, {{3}} list, {{4}} link) and, for production,
    a registered business sender.
  - Do not offer unofficial WhatsApp-Web automation libraries; they break WhatsApp's terms and risk the number.

## 4. Hosting & sharing links

- Runs anywhere Node 18+ and curl exist. `start.bat` installs dependencies, creates `.env`, opens the browser.
- `install-autostart.ps1` (run as Administrator) registers a Windows scheduled task at start-up with auto-restart and
  opens port 4300 on Private/Domain networks. Ask before running it — it changes system configuration.
- Same Wi-Fi: `http://<PC-LAN-IP>:4300` (Windows Firewall must allow node). Phones can't use `localhost`.
- Outside the office: `share-online.ps1` downloads `cloudflared` (verify the Authenticode signature is Cloudflare, Inc.)
  and opens a temporary `https://<random>.trycloudflare.com` link; it changes on restart and is often blocked on corporate
  networks. For production use a named Cloudflare tunnel on the client's own domain (`share-online.ps1 -Token …`) and set
  `APP_URL` in `.env` so invite links and e-mails use it.
- **Create the owner account before exposing any public link**, otherwise a stranger could claim the platform.
- Back up `data/db.json` and `.env` together (`APP_SECRET` is needed to decrypt stored mailbox/Twilio secrets).

## 5. Known pitfalls (already handled — keep them handled when editing)

| Symptom | Cause | Fix in code |
|---|---|---|
| Can't type in login/setup fields | `onkeydown = e => e.key==='Enter' && go()` returns `false` → cancels every key | use `addEventListener('keydown', e => { if (e.key==='Enter') go(); })` |
| A row vanishes after entering a board-meeting date | year typed as 2 digits → saved `0002-11-11` → due date before `trackFrom` → filtered out | server + client reject dates outside quarter-end+1 … +180 days (AGM: within FY) |
| A saved date gets erased | emptied `<input type=date>` fired a save with `''` | blank input reverts; removal only via 🗑 with confirm and `clear:true`; every change logged |
| Rows seem to disappear after any date change | list re-sorts by due date | scroll to and flash the edited row |
| "View filing" 404 | BSE moved PDF from AttachLive to AttachHis | resolve both at click time |
| `/api/team/join-link` → "User not found" | Express matched `/api/team/:id` first | route renamed `/api/team-join-link` |
| Old circulars flagged NEW forever / blank SEBI row | firstSeen heuristics; malformed RSS items | per-user read/unread (`upTo` + read ids + forced-unread ids); drop items without title/date |

## 6. Commercial notes (tell anyone planning to sell this)

- Selling a product built on data read from BSE/NSE websites may need the exchanges' permission or a data licence —
  confirm before charging clients.
- Show the "verify timeline" flags and a "not legal advice" note to clients; timelines change through SEBI/MCA circulars.
- Billing is not built in (plans/expiry are tracked manually); Razorpay is the natural next step for Indian clients.
