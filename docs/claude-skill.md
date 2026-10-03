# Using the Claude skill

A **skill** is a folder of instructions, reference material, scripts and assets that Claude loads when a task needs it.
This repository *is* such a folder: `SKILL.md` tells Claude what the app does and how to deploy, operate, troubleshoot and
extend it; `references/` holds the compliance master, data-source notes and operations runbook; `scripts/` and
`assets/app/` are the tools Claude runs.

## What Claude can do with it

| Ask Claude… | What happens |
|---|---|
| "Set up a compliance calendar for our listed company, BSE code 544513" | Checks prerequisites, deploys the app, starts it, walks you through creating the owner account and adding the company |
| "Has the September shareholding pattern been filed?" | Looks it up in the running app or directly on BSE and reports the exact submission time |
| "When is our Reg 24A report due and what's the regulation?" | Answers from the compliance master and flags ⚠ items to verify |
| "Add CSR-1 / a new SEBI circular requirement to the calendar" | Edits `lib/master.js`, regenerates the docs, restarts and verifies |
| "BSE verification stopped working" | Runs the source health check and repairs the endpoint using `references/data-sources.md` |
| "Let my team use it on the office Wi-Fi / from outside" | Follows the hosting runbook, asks before installing services or opening links |

## Installing

### Claude apps (claude.ai, desktop)

1. Download **`indian-compliance-calendar.skill`** from the repository's **Releases** page
   (or build it yourself — see below). It is a zip containing the `indian-compliance-calendar/` folder with `SKILL.md` inside.
2. In Claude, open **Settings → Capabilities → Skills** (named *Customize → Skills* in some versions) and **upload** the file.
3. Make sure code execution / file creation is enabled so Claude can run the scripts.
4. Start a new chat and ask for a compliance calendar.

### Claude Code (CLI)

```bash
git clone https://github.com/parinshahAIbuilder/indian-compliance-calendar.git \
  ~/.claude/skills/indian-compliance-calendar
```

For a single project instead, clone into `<project>/.claude/skills/indian-compliance-calendar`. Claude Code discovers
skills automatically on the next session.

### Building the `.skill` file yourself

```bash
# from the folder that contains indian-compliance-calendar/
zip -r indian-compliance-calendar.skill indian-compliance-calendar \
  -x "*/.git/*" "*/node_modules/*" "*/data/*" "*.env"
```

## Guard-rails built into the skill

- Claude **never chooses or echoes passwords**, app passwords or tokens — you type them into the app or `.env` yourself.
- Claude **asks before outward actions**: sending e-mail / WhatsApp, publishing a link, installing auto-start, downloading
  `cloudflared`, or creating anything in a third-party account.
- Timelines are quoted with their regulation and ⚠ items are flagged as "confirm against the latest circular".
- `data/` and `.env` are kept out of version control.

## Updating the skill

Pull the latest version (`git pull`) or upload the newer `.skill` file from Releases. If you have deployed the app,
ask Claude to "upgrade the compliance calendar" — it re-runs `scripts/deploy_app.mjs`, which keeps your data.
