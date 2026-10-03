# User guide

The dashboard has one tab per job. Counts on each tab show how many items need attention.

## 📅 Compliance Calendar

The main screen. For the selected company it lists every applicable recurring compliance.

- **Summary cards:** Total Compliances, Pending Filings, Due Today, Overdue, Upcoming Deadlines.
- **Filters:** frequency (Monthly / Quarterly / Annual / All), category (SEBI LODR, SEBI PIT, SEBI ICDR, Companies Act …) and period.
- **Columns:** Sr, Compliance & regulation, Timeline, Due Date, Status, Submission Date (from BSE, with a *View filing* link), Source.
- **Board Meeting Date / Earnings Call Date / AGM date:** enter once per period; linked items recalculate and the edited row flashes so you can find it after re-sorting.
- **Statutory latest:** shown when no event date is entered yet, so you always see the legal outer limit.
- **⚠ verify timeline:** the regulation was recently amended — confirm against the latest circular.
- **Submission date:** filled automatically when BSE shows the filing; for items with no BSE footprint (MCA forms, fees, DPT-3 …) type the date you filed — the item is then complete and drops out of reminders.
- **🕑 Snooze** an item for 1, 3 or more days to pause its reminders.
- **⤓ Export CSV** and **🖨 Print** the calendar for board packs or audit files.
- **✔ Mark past items done…** bulk-closes historical items when onboarding.
- **↻ Fetch latest** forces an immediate BSE check instead of waiting for the 2-hourly cycle.

## ⚡ Event Based

Compliances triggered by an event rather than a calendar — e.g. Reg 30 material event, PIT Reg 7(2)(b) insider-trade
disclosure, Reg 39(3) duplicate certificates, Reg 42 record date, Reg 31A promoter re-classification, Reg 57(1) NCD
interest payment. Log the **event date** (with an optional note) and the app derives the due date (working-day rules
included) and adds it to reminders until it is filed.

## 📢 Company Announcements

Everything the company has filed on BSE in the last 12 months, with category, sub-category, submission time and a link
to the PDF. Useful to answer "did we file X, and when exactly?"

## ⊕ Manual Entry

Add a compliance that isn't in the master list — Monthly, Quarterly, Half-Yearly, Annual, Event Base or One-time.
Manual items get reminders exactly like built-in ones.

## ✉ Email Updates

- **Sender account** — the mailbox that sends reminders for this workspace (Gmail, Outlook, Zoho, SMTP with app password).
- **Recipients** — To / CC per company.
- **Send time** (IST) and **days before due** to start reminding.
- **WhatsApp** — free one-tap forwarding (default) or automatic sending via Twilio (see [`references/operations.md`](../references/operations.md) §3).

The daily e-mail lists, per company, items within the reminder window and all overdue items, plus new circulars.

## 🏛 BSE Circulars · 📈 NSE Circulars · ⚖ SEBI Updates

Regulatory feeds refreshed every 2 hours:

- **BSE** — circulars to listed companies (Equity / Debt filter).
- **NSE** — circulars issued to listed companies, equity and debt.
- **SEBI** — circulars, master circulars, regulations, press releases.

Each user has their own **read / unread** state; the NEW badge clears when you open an item. Use **✓ Mark all as read**
after reviewing.

## ⚙ Companies & Settings

- Add / edit / remove companies and their profile flags.
- Enable or disable individual compliance templates for a company.
- **Holidays** — trading / bank holidays (YYYY-MM-DD, one per line) used in working-day calculations. Weekends are excluded automatically.

## 👥 Team & Clients

- **Team:** invite colleagues as **Admin** (manage companies, recipients, settings, mailbox) or **Member** (update filings).
- **Client workspaces** (owner only): create a workspace per client firm with plan, company limit and valid-until date;
  send an invite link to the client admin. Each client sees only its own companies and uses its own sender mailbox.
- **Join link** and optional **public trial sign-up**.
- Use the **workspace switcher** (top right) to move between clients.

## 🧾 Activity

Audit trail of every change — who entered or removed which date, who marked what done, BSE matches, e-mails sent.
Useful for internal audit and for answering "who changed this?".

Next: [How it works](how-it-works.md) · [FAQ](faq.md)
