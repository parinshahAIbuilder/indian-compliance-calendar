# FAQ & troubleshooting

## General

**Is it free?**
Yes. The code is MIT-licensed — use it for your own company or your clients, modify it, even sell services around it.
If you sell it as a product, check whether BSE / NSE require permission for redistributing their data.

**Is this legal advice?**
No. Timelines are an operational aid compiled from SEBI, MCA and exchange texts. Items marked ⚠ were recently amended;
always confirm against the latest circular.

**Does my data leave my computer?**
No. Everything is stored in `data/db.json` on the machine running the app. The app only *reads* public BSE / NSE / SEBI
pages and sends e-mail through the mailbox you configure.

**Which companies can I track?**
Listed (equity and/or debt), unlisted public, private limited and LLPs. Filing verification is automatic for BSE-listed
companies; others are ticked by entering the submission date.

**Can it check NSE filings or the MCA portal?**
Not yet. NSE is used for circulars only, and MCA has no public filing feed — MCA items are marked done manually.

**How many companies / users?**
No hard limit. The JSON store comfortably handles dozens of companies and users; plan/company limits per client workspace are optional.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `node` is not recognised | Node.js not installed or terminal opened before install | Install Node 18+ LTS, close and reopen the terminal |
| Page doesn't open at `localhost:4300` | App not running, or port in use | Keep the `node server.js` window open; set another `PORT` in `.env` |
| Colleagues can't open the link | Using `localhost`, or firewall | Share `http://<PC-IP>:4300`; allow Node through Windows Firewall |
| BSE items never tick | BSE blocking requests / no Chrome or Edge | Run `node scripts/check_sources.mjs`; install Chrome or set `BROWSER_PATH` in `.env` |
| "Access Denied" from BSE in logs | Akamai bot protection | Handled automatically by the browser fallback — ensure Chrome/Edge is installed |
| NSE circulars empty | NSE session cookie / HTTP/2 hang | Usually transient; check again after the next 2-hour cycle or run the health check |
| E-mail not sent / login failed | Normal password used instead of app password | Create an app password (Gmail needs 2-Step Verification) and re-enter it |
| Reminder lists very old items | History not cleaned on onboarding | Use **✔ Mark past items done…** once |
| A row disappeared after entering a date | Typo in year → date outside allowed window (now rejected), or row re-sorted | Look for the flashing row; re-enter a valid date |
| "View filing" opens 404 | BSE moved the PDF from AttachLive to AttachHis | Handled automatically — refresh and click again |
| Stored mailbox stops working after moving PC | `.env` (APP_SECRET) not copied | Copy `.env` with `data/db.json`, or re-enter the mailbox password |
| Twilio says "ContentSid Required" | Trial account / no approved template | Upgrade Twilio and add an approved utility template, or use free one-tap WhatsApp |

## Still stuck?

Open an [issue](https://github.com/parinshahAIbuilder/indian-compliance-calendar/issues) with the symptom, what you tried, and the output of `node scripts/check_sources.mjs`
(remove any personal data first). Never post `.env` contents or passwords.
