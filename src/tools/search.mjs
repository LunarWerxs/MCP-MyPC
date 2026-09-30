import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { expandPath, formatBytes, localTime, text } from '../util.mjs';

// Folders full of program files nobody means when they ask for "my file", skipped to keep the search quick.
const SKIP = new Set(['node_modules', 'AppData', 'Library', 'Application Data', '$Recycle.Bin', 'System Volume Information',
  'Windows', 'Program Files', 'Program Files (x86)', 'ProgramData', '__pycache__', 'venv', 'site-packages']);
const MAX_VISITED = 200_000;
const MAX_MATCHES = 5000;
const TIME_BUDGET_MS = 20_000;

export const findFiles = {
  name: 'find_files',
  description: 'Find files and folders by name, newest first. Looks through the home folder (Desktop, Documents, Downloads, Pictures and the rest) unless told where. Use it first whenever someone names a file or folder, even partly.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Part of the name, like "tax" or ".pdf". A * matches anything: "invoice*.pdf".' },
      folder: { type: 'string', description: 'Where to look. Defaults to the home folder.' },
      changed_within_days: { type: 'number', description: 'Only things changed in the last this-many days (1 means the last 24 hours).' },
      max_results: { type: 'number', description: 'How many to list. Default 50, most 500.' },
    },
    required: ['name'],
  },
  timeoutMs: () => 60_000,
  summary: (args) => args.name,
  async run(args) {
    const root = expandPath(args.folder);
    const days = Number(args.changed_within_days);
    const limit = Math.min(Math.max(Math.floor(Number(args.max_results) || 50), 1), 500);
    const { found, visited, stoppedEarly } = await walk(root, namePattern(String(args.name ?? '')));
    const newest = await newestFirst(found, days > 0 ? Date.now() - days * 86_400_000 : 0);

    const lines = newest.slice(0, limit)
      .map((f) => `${localTime(f.mtime)}  ${f.folder ? '[folder]' : formatBytes(f.size).padStart(8)}  ${f.path}`);
    const notes = [
      newest.length > limit ? `(Showing the newest ${limit} of ${newest.length}.)` : '',
      stoppedEarly ? `(Stopped after looking at ${visited} items; name a folder to search deeper.)` : '',
    ].filter(Boolean);
    const heading = lines.length ? `Found in ${root}:` : `Nothing named like "${args.name}" in ${root}.`;
    return text([heading, ...lines, ...notes].join('\n'));
  },
};

/** Breadth first from `root`, so nearby folders are covered before the search runs out of time or items. */
async function walk(root, matches) {
  const started = Date.now();
  const found = [];
  const queue = [root];
  let visited = 0;
  while (queue.length) {
    if (visited >= MAX_VISITED || Date.now() - started > TIME_BUDGET_MS || found.length >= MAX_MATCHES) {
      return { found, visited, stoppedEarly: true };
    }
    const dir = queue.shift();
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      visited++;
      const path = join(dir, entry.name);
      if (matches(entry.name)) found.push({ path, folder: entry.isDirectory() });
      if (entry.isDirectory() && !entry.name.startsWith('.') && !SKIP.has(entry.name)) queue.push(path);
    }
  }
  return { found, visited, stoppedEarly: false };
}

/** The matches changed at or after `since`, with their size and time, newest first. */
async function newestFirst(found, since) {
  const described = await Promise.all(found.map(async (f) => {
    const info = await stat(f.path).catch(() => null);
    return info && info.mtimeMs >= since ? { ...f, mtime: info.mtimeMs, size: info.size } : null;
  }));
  return described.filter(Boolean).sort((a, b) => b.mtime - a.mtime);
}

/** "tax" matches any name containing it; "invoice*.pdf" matches the whole name, * standing for anything. Case never matters. */
function namePattern(query) {
  const q = query.trim().toLowerCase();
  if (!q) throw new Error('Say what name to look for.');
  if (!q.includes('*')) return (name) => name.toLowerCase().includes(q);
  const regex = new RegExp(`^${q.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i');
  return (name) => regex.test(name);
}
