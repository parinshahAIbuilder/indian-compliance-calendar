#!/usr/bin/env node
// Copies the bundled compliance-calendar app into a target folder and installs its dependencies.
// Usage: node scripts/deploy_app.mjs <target-folder> [--port 4300] [--org "Firm name"]
// Existing data/ and .env in the target are never overwritten, so this is also the upgrade path.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--'));
if (!target) { console.error('Usage: node scripts/deploy_app.mjs <target-folder> [--port 4300] [--org "Firm name"]'); process.exit(1); }
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'app');
const dst = path.resolve(target);
const KEEP = new Set(['data', '.env', 'node_modules', 'cloudflared.exe']);

function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (KEEP.has(e.name)) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    e.isDirectory() ? copy(a, b) : fs.copyFileSync(a, b);
  }
}
const upgrading = fs.existsSync(path.join(dst, 'data', 'db.json'));
copy(src, dst);

const envFile = path.join(dst, '.env');
if (!fs.existsSync(envFile)) {
  let env = fs.readFileSync(path.join(src, '.env.example'), 'utf8');
  if (opt('port')) env = env.replace(/^PORT=.*$/m, `PORT=${opt('port')}`).replace(/^APP_URL=.*$/m, `APP_URL=http://localhost:${opt('port')}`);
  if (opt('org')) env = env.replace(/^ORG_NAME=.*$/m, `ORG_NAME=${opt('org')}`);
  fs.writeFileSync(envFile, env);
}

console.log(`${upgrading ? 'Upgraded' : 'Installed'} app in ${dst} — installing dependencies…`);
execSync('npm install --no-audit --no-fund', { cwd: dst, stdio: 'inherit' });
const port = opt('port') || (/^PORT=(\d+)/m.exec(fs.readFileSync(envFile, 'utf8')) || [])[1] || 4300;
console.log(`\nDone. Start it with:  cd "${dst}" && node server.js   (Windows: double-click start.bat)`);
console.log(`Then open http://localhost:${port} and create the owner account.`);
