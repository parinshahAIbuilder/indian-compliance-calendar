# Contributing

Thank you for helping keep Indian compliance timelines accurate and the app useful.

## Ways to help

- **Timeline updates** — SEBI / MCA / exchanges amend timelines often. Open an issue or PR with the item ID from
  [`references/compliance-master.md`](references/compliance-master.md), the new timeline, and a **link to the circular or notification**.
- **New compliances** — describe the regulation, frequency, trigger, timeline, who it applies to, and how it shows up on BSE (if at all).
- **Broken data source** — include the output of `node scripts/check_sources.mjs` and the date you noticed it.
- **Bugs / UI improvements** — steps to reproduce, expected vs actual behaviour, browser and OS.

## Making a change

1. Fork the repository and create a branch.
2. Compliance logic lives in `assets/app/lib/master.js` (template fields are documented at the top).
   After changing it, regenerate `references/compliance-master.md` so docs and code agree.
3. Run `node --check` on edited files and start the app (`node server.js` in a deployed copy) to verify in the browser.
   Test risky changes (auth, workspaces, sign-up) on a throwaway copy with its own `data/` folder and port.
4. Read the pitfalls table in [`references/operations.md`](references/operations.md) §5 before touching date or keyboard handling.
5. Open a pull request describing **what changed and why**, with the regulatory source for any timeline change.

## Ground rules

- Never commit `.env`, `data/`, real client data, passwords or tokens.
- Keep the app dependency-light (Express, Nodemailer, puppeteer-core) and database-free.
- Plain language in the UI — the users are company secretaries, not developers.

By contributing you agree that your contribution is licensed under the [MIT Licence](LICENSE).
