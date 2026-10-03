# Security

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's
[private vulnerability reporting](https://github.com/parinshahAIbuilder/indian-compliance-calendar/security/advisories/new) for this repository, with steps to reproduce.
You'll get an acknowledgement as soon as possible.

## How the app protects data

| Area | Measure |
|---|---|
| Passwords | scrypt-hashed, never stored in plain text |
| Sessions | HttpOnly cookies; login throttled (10 failures / 15 min / IP) |
| Mailbox / Twilio secrets | AES-256-GCM encrypted with `APP_SECRET` (auto-generated in `.env`) |
| Workspaces | each client workspace sees only its own companies, recipients and settings |
| Storage | local `data/db.json` — nothing is sent to third parties except e-mail / WhatsApp you configure |

## Your responsibilities when hosting

- Create the **owner account before** exposing the app through any public link.
- Use HTTPS (e.g. a Cloudflare named tunnel on your own domain) for access outside the office network.
- Keep `.env` and `data/` out of version control and back them up securely, together.
- Use **app passwords** for mailboxes, never the main account password. If a secret is ever pasted into chat or e-mail, revoke it and create a new one.
- Keep Node.js and dependencies updated (`npm update` inside the app folder).
