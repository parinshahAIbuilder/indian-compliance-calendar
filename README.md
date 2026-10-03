# Indian Compliance Calendar

A compliance calendar and reminder system for company secretaries in India — for **listed companies (NSE/BSE, equity & debt)**,
**unlisted public companies**, **private limited companies** and **LLPs**.

- **61 recurring + 19 event-based compliances** — SEBI LODR, PIT, SAST, Depositories, ICDR, Companies Act 2013 / MCA, LLP Act
  (and optional tax & labour), grouped monthly / quarterly / half-yearly / annual / event-based.
- **Due dates from real events** — board meeting, earnings call and AGM dates drive Reg 29, Reg 33 / integrated filing,
  Reg 47 newspaper, investor presentation, earnings-call intimation/audio/transcript, AOC-4, MGT-7, ADT-1 and more.
- **Automatic BSE verification** — checks corporate announcements, Integrated Filing (Governance & Finance) and Shareholding
  Pattern, and records the exact BSE submission date & time with a link to the filing.
- **Reminders until filed** — daily e-mail from N days before the due date (default 5), plus WhatsApp (free one-tap, or automatic via Twilio).
- **Regulatory circulars** — BSE circulars to listed companies, NSE circulars to listed companies (equity & debt), SEBI
  circulars / master circulars / regulations, with per-user unread tracking.
- **Team & clients** — logins, separate client workspaces, invite / join links, trial sign-up, plan limits and expiry.

## Two ways to use this repository

### 1. As a Claude skill
This folder is a [Claude skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview): `SKILL.md` +
`references/` + `scripts/` + `assets/app/`. Install it in Claude (upload the `.skill` file from Releases, or copy this folder
into your skills directory) and ask things like *"set up a compliance calendar for our listed company"*, *"has the shareholding
pattern for September been filed on BSE?"* or *"add a new LODR compliance to the calendar"*.

### 2. Just run the app
Requirements: Node.js 18+ and `curl` (built into Windows 10+, macOS and most Linux).

```bash
node scripts/deploy_app.mjs ./compliance-calendar --org "Your Firm"
cd compliance-calendar
node server.js
```
Open http://localhost:4300, create the owner account, then add your companies (search by name, BSE code, NSE symbol or ISIN).
On Windows you can double-click `start.bat` inside the app folder instead. See `assets/app/README.md` and
`references/operations.md` for e-mail, WhatsApp, team access, hosting and sharing.

Check that the exchange data sources are reachable at any time:
```bash
node scripts/check_sources.mjs
```

## Repository layout
```
SKILL.md                      skill instructions (for Claude)
references/
  compliance-master.md        every compliance, frequency, timeline, BSE source
  data-sources.md             BSE / NSE / SEBI endpoints, headers, quirks
  operations.md               accounts, e-mail, WhatsApp, hosting, known pitfalls
scripts/
  deploy_app.mjs              install / upgrade the app into any folder
  check_sources.mjs           health check of all data sources
assets/app/                   the web app (Node.js + Express, no database server needed)
```

## Important
- Due dates are an operational aid, **not legal advice**. Items marked ⚠ have recently-amended timelines — confirm
  against the latest SEBI / MCA circulars.
- Exchange data is read from public BSE / NSE pages. If you plan to offer this commercially, check whether the exchanges
  require permission or a data licence.
- Never commit `.env` or `data/` — they hold passwords (hashed), encrypted mailbox secrets and your clients' data.
