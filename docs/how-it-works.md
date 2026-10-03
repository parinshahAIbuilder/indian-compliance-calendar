# How it works

A plain-English walk-through of the logic, for anyone who wants to understand, audit or extend the app.

## Architecture

```mermaid
flowchart TB
    subgraph Browser
      UI[Dashboard<br/>public/app.js]
    end
    subgraph Server["Node.js server (server.js)"]
      API[REST API + auth]
      SCH[Scheduler<br/>2-hourly checks, daily e-mail]
      ENG[Due-date engine<br/>lib/engine.js, lib/dates.js]
      MST[Compliance master<br/>lib/master.js]
      BSE[BSE matcher<br/>lib/bse.js]
      CIR[Circular feeds<br/>lib/circulars.js]
      MAIL[Mailer / WhatsApp<br/>lib/mailer.js, lib/whatsapp.js]
      HTTP[Fetcher<br/>lib/http.js: curl → headless browser]
    end
    DB[(data/db.json)]
    UI <-->|HTTP + live updates (SSE)| API
    API --> ENG --> MST
    SCH --> BSE --> HTTP
    SCH --> CIR --> HTTP
    SCH --> MAIL
    API --> DB
    BSE --> DB
    CIR --> DB
    HTTP -->|public pages| X[BSE / NSE / SEBI]
```

| Component | File | Role |
|---|---|---|
| Compliance master | `lib/master.js` | Every compliance template: id, frequency, category, title, timeline text, due-date rule, applicability flags, BSE matcher |
| Due-date engine | `lib/engine.js`, `lib/dates.js` | Turns templates + company profile + event dates into dated items for the financial year, in IST |
| BSE matcher | `lib/bse.js` | Reads announcements, Integrated Filing and Shareholding Pattern; links filings to items; detects board-meeting / AGM dates |
| Circulars | `lib/circulars.js` | BSE, NSE and SEBI circular feeds with per-user read tracking |
| Fetcher | `lib/http.js` | `curl` with browser headers; NSE cookie session; Chrome/Edge fallback via `puppeteer-core` |
| Mailer | `lib/mailer.js` | Daily digest per company; per-workspace SMTP sender (encrypted credentials) |
| WhatsApp | `lib/whatsapp.js` | `wa.me` one-tap links, or Twilio API |
| Auth & store | `lib/auth.js`, `lib/store.js` | scrypt passwords, sessions, workspaces; JSON file storage |

## 1. Which compliances apply

Each company has a **type** (listed, unlisted public, private limited, LLP) and **flags** (listed equity, listed debt,
monitoring agency, earnings calls, BRSR, Large Corporate, cost audit, CSR, tax & labour). Every template in the master
declares which types / flags it needs; only matching templates become calendar items. You can also disable individual
templates per company.

## 2. How due dates are calculated

All dates are in **Asia/Kolkata (IST)** and on an **April–March financial year**.

| Rule type | Example | How the date is derived |
|---|---|---|
| Fixed days after period end | Shareholding pattern — 21 days after quarter-end | quarter-end + 21 calendar days |
| Fixed calendar date | DPT-3 — 30 June | that date in the FY |
| Working days after an event | Reg 44(3) — 2 working days after AGM | AGM date + 2 working days (weekends + entered holidays skipped) |
| Working days *before* an event | Reg 29 — 2 working days before board meeting (excluding both days) | board-meeting date − 3 working days |
| Same day / next day as event | Investor presentation; Reg 47 newspaper | results-filing / board-meeting date (+1) |
| Event-based | PIT Reg 7(2)(b) — 2 trading days from receipt | logged event date + offset |

Until an event date (board meeting, earnings call, AGM) is known, the item shows the **statutory latest** date — the
outer legal limit — so it is never invisible.

**Input safeguards:** board-meeting dates are accepted only between quarter-end + 1 and + 180 days; AGM dates must fall
in the FY. This prevents a mistyped year (e.g. `0002-11-11`) from silently hiding a row.

## 3. How BSE verification works

Every 2 hours and immediately before the daily e-mail, for each listed company with a BSE scrip code:

1. Fetch the last 12 months of **corporate announcements** and the **Integrated Filing (Governance / Finance)** and
   **Shareholding Pattern** lists.
2. Match each filing to a compliance item by sub-category / headline text and the **period** it relates to
   (e.g. "Quarter ended June 30, 2026" → Q1). Shareholding pattern and Integrated Filing use BSE's quarter id.
3. Write the exact BSE **submission date & time** (`News_submission_dt` / `filing_date_time`) and a link to the filing
   against the item → it becomes **Completed**.
4. Detect the **board-meeting** and **AGM** dates from intimations and outcomes and fill them in if you haven't.

If BSE's bot protection rejects `curl`, the fetcher opens a hidden Chrome / Edge window on bseindia.com and calls the
same API from inside the page. Details and endpoint list: [`references/data-sources.md`](../references/data-sources.md).

## 4. How reminders work

At the workspace's daily send time (default **10:30 IST**):

1. Re-check BSE (so anything filed this morning is excluded).
2. Refresh circulars.
3. For each company, collect items that are **within N days of due** (default 5) or **overdue**, not completed and not snoozed.
4. Send one digest e-mail per company to its To / CC recipients, with a *Forward on WhatsApp* button.
5. Optionally send automatic WhatsApp via Twilio.

An item leaves the reminder list the moment BSE shows the filing or someone enters its submission date.

## 5. Circular feeds

BSE, NSE (equity and debt) and SEBI feeds are refreshed every 2 hours and stored with their first-seen time. Each user
has a read pointer plus explicit read / unread ids, so NEW badges are personal and old circulars are not re-flagged.

## 6. Data model (in `data/db.json`)

| Key | Holds |
|---|---|
| `orgs` | workspaces — settings (reminder days, send time, holidays, auto-send), encrypted sender mailbox, plan, expiry |
| `users`, `sessions` | hashed passwords, roles, workspace membership, login sessions |
| `companies` | type, profile flags, BSE / NSE codes, recipients, disabled templates |
| `events` | board-meeting, earnings-call and AGM dates per period |
| `status` | per-item completion, submission date/time, BSE link, snooze |
| `manual`, `occurrences` | manual compliances and logged event-based items |
| `announcements`, `sync` | cached BSE announcements and last-check times |
| `circulars` | BSE / NSE / SEBI feeds and per-user read state |
| `logs` | activity / audit trail |

Back up `data/db.json` together with `.env` (its `APP_SECRET` decrypts stored secrets).

## 7. Extending

- **Add or change a compliance:** edit `assets/app/lib/master.js` (fields are documented at the top of the file), then
  regenerate `references/compliance-master.md` so the docs stay accurate.
- **A data source broke:** `node scripts/check_sources.mjs [scripCode]`, then follow
  [`references/data-sources.md`](../references/data-sources.md) §6.
- **Before editing date or keyboard handling in the UI,** read the pitfalls table in
  [`references/operations.md`](../references/operations.md) §5 — each row is a real bug that has been fixed.
