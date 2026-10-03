// JSON-file persistence with change notifications (used for real-time push to open dashboards).
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');

export const bus = new EventEmitter();
bus.setMaxListeners(100);

const SEED = {
  companies: [],
  events: {},
  status: {},
  manual: {},
  occurrences: {},
  settings: {
    reminderDays: 5,
    sendTime: '10:30',
    autoSend: true,
    includeCirculars: true,
    bseSyncHours: 2,
    holidays: []
  },
  sync: {},
  announcements: {},
  orgs: [],
  users: [],
  sessions: {},
  circulars: {},
  logs: [],
  lastDaily: {}
};

let state;

export function load() {
  if (state) return state;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const k of Object.keys(SEED)) if (state[k] === undefined) state[k] = structuredClone(SEED[k]);
    state.settings = { ...SEED.settings, ...state.settings };
  } else {
    state = structuredClone(SEED);
  }
  migrate();
  save('init');
  return state;
}

export const DEFAULT_SETTINGS = { reminderDays: 5, sendTime: '10:30', autoSend: true, includeCirculars: true, holidays: [] };

// Multi-workspace layout: every company belongs to an organisation (your team or a client firm).
function migrate() {
  if (!state.orgs.length) {
    state.orgs.push({
      id: 'org-main', name: process.env.ORG_NAME || 'My Firm', isDefault: true, plan: 'internal',
      createdAt: new Date().toISOString(), settings: { ...DEFAULT_SETTINGS, ...(state.settings || {}) },
      mail: null, lastDaily: state.lastDaily && state.lastDaily.date ? state.lastDaily : null
    });
  }
  const def = state.orgs.find(o => o.isDefault) || state.orgs[0];
  for (const c of state.companies) c.orgId ||= def.id;
  for (const l of state.logs) if (!l.orgId && !/^Circulars/.test(l.message)) l.orgId = def.id;
}

export const getOrg = id => load().orgs.find(o => o.id === id);
export const viewFor = org => ({ ...load(), settings: org.settings });

export function save(reason = 'update') {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
  fs.renameSync(tmp, FILE);
  bus.emit('change', { reason, at: new Date().toISOString() });
}

export function log(type, message, orgId = null) {
  state.logs.unshift({ at: new Date().toISOString(), type, message, orgId });
  state.logs = state.logs.slice(0, 400);
}

export const getCompany = id => load().companies.find(c => c.id === id);

export const statusOf = (cid, key) => ((load().status[cid] ||= {})[key] ||= {});

export const eventsOf = (cid, fy) => (((load().events[cid] ||= {})[fy] ||= {}));
