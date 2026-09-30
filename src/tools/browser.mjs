// Drives a browser window (Chrome, Edge or Brave) through the DevTools protocol. It uses its own
// profile folder, so it starts signed out of everything and never touches the person's own browser.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { PATHS } from '../config.mjs';
import { image, isWindows, sleep, text } from '../util.mjs';
import { clickElement, focusField, readPage } from './browser-page.mjs';

const COMMAND_TIMEOUT_MS = 30_000;
const ENTER = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
let session = null;

const ACTIONS = {
  async open(page, { url }) {
    if (!url) throw new Error('open needs a url.');
    const address = /^([a-z][a-z0-9+.-]*:\/\/|about:|data:)/i.test(url) ? url : `https://${url}`;
    await page.send('Page.navigate', { url: address });
    await settle(page);
    return describe(page, 4000);
  },

  read: (page) => describe(page, 50_000),

  async screenshot(page) {
    const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
    return image(shot.data, 'image/jpeg');
  },

  async click(page, { selector, text: wanted }) {
    const clicked = await evaluate(page, clickElement, selector ?? '', wanted ?? '');
    if (!clicked) throw new Error(`Found nothing to click matching "${selector ?? wanted}". Use read to see what is on the page.`);
    await afterAction(page);
    return text(`Clicked "${clicked}".`);
  },

  async type(page, { selector, field, text: typed, submit }) {
    const found = await evaluate(page, focusField, selector ?? '', field ?? '');
    if (!found) throw new Error(`Found no box matching "${selector ?? field}". Use read to see what is on the page.`);
    await page.send('Input.insertText', { text: String(typed ?? '') });
    if (submit) {
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', text: '\r', ...ENTER });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...ENTER });
      await afterAction(page);
    }
    return text(`Typed into "${found}"${submit ? ' and pressed Enter' : ''}.`);
  },

  async back(page) {
    await evaluate(page, () => history.back());
    await afterAction(page);
    return describe(page, 4000);
  },
};

export const browser = {
  name: 'browser',
  description: 'Use a web browser on the computer. It opens a separate browser window (signed out of everything) that the person at the computer can watch. Actions: open a web address, read the page (text plus the buttons and links you can click), screenshot, click something by its text or a CSS selector, type into a box, go back, close.',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['open', 'read', 'screenshot', 'click', 'type', 'back', 'close'] },
      url: { type: 'string', description: 'For open: the web address.' },
      text: { type: 'string', description: 'For click: the visible text of what to click. For type: the text to type.' },
      selector: { type: 'string', description: 'For click or type: a CSS selector, instead of matching by text.' },
      field: { type: 'string', description: 'For type: the label or placeholder of the box to type into. Leave out to type where the cursor is.' },
      submit: { type: 'boolean', description: 'For type: press Enter afterwards.' },
    },
    required: ['action'],
  },
  timeoutMs: () => 120_000,
  summary: (args) => [args.action, args.url ?? args.text ?? args.selector].filter(Boolean).join(' '),
  async run(args) {
    if (args.action === 'close') return closeBrowser();
    const action = Object.hasOwn(ACTIONS, args.action) ? ACTIONS[args.action] : null;
    if (!action) throw new Error(`Unknown browser action "${args.action}".`);
    return action(await connect(), args);
  },
};

function browserPaths() {
  if (isWindows) {
    const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean);
    return roots.flatMap((root) => [
      join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(root, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    ]);
  }
  if (process.platform === 'darwin') {
    return ['Google Chrome', 'Microsoft Edge', 'Brave Browser', 'Chromium'].map((app) => `/Applications/${app}.app/Contents/MacOS/${app}`);
  }
  return ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser']
    .flatMap((name) => [`/usr/bin/${name}`, `/snap/bin/${name}`]);
}

async function devtoolsPort() {
  const portFile = join(PATHS.browserProfile, 'DevToolsActivePort');
  const readPort = () => Number(readFileSync(portFile, 'utf8').split('\n')[0]);
  if (existsSync(portFile) && (await answers(readPort()))) return readPort();

  const installed = browserPaths().filter((p) => existsSync(p));
  if (!installed.length) throw new Error('No Chrome, Edge or Brave browser was found on this computer. Install Google Chrome, then try again.');
  mkdirSync(PATHS.browserProfile, { recursive: true });
  const args = ['--remote-debugging-port=0', `--user-data-dir=${PATHS.browserProfile}`, '--no-first-run', '--no-default-browser-check'];
  if (process.env.MYPC_BROWSER_HEADLESS) args.push('--headless=new');
  // A browser can quit straight away (Chrome does while an update is waiting), so try the next one.
  for (const exe of installed) {
    rmSync(portFile, { force: true });
    const child = spawn(exe, [...args, 'about:blank'], { detached: true, stdio: 'ignore' });
    let exited = false;
    child.once('exit', () => { exited = true; });
    child.once('error', () => { exited = true; });
    child.unref();
    for (let i = 0; i < 100 && !exited; i++) {
      await sleep(150);
      if (existsSync(portFile) && (await answers(readPort()))) return readPort();
    }
  }
  throw new Error('The browser did not start. Close every browser window and try again.');
}

async function answers(port) {
  if (!port) return false;
  try {
    return (await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) })).ok;
  } catch {
    return false;
  }
}

async function devtoolsJson(port, path, method = 'GET') {
  const r = await fetch(`http://127.0.0.1:${port}${path}`, { method, signal: AbortSignal.timeout(10_000) });
  return r.json();
}

/** A DevTools connection to the browser's first tab, reused between calls. */
async function connect() {
  if (session?.ws.readyState === WebSocket.OPEN) return session;
  const port = await devtoolsPort();
  const tabs = await devtoolsJson(port, '/json/list');
  const tab = tabs.find((t) => t.type === 'page' && !t.url.startsWith('devtools://'))
    ?? (await devtoolsJson(port, '/json/new?about:blank', 'PUT'));
  session = await devtools(tab.webSocketDebuggerUrl);
  await session.send('Page.bringToFront').catch(() => {});
  return session;
}

async function devtools(url) {
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('The browser did not answer.'));
    }, 10_000);
    ws.onopen = () => { clearTimeout(timer); resolve(); };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('Could not connect to the browser.')); };
  });
  const waiting = new Map();
  let seq = 0;
  ws.onmessage = (event) => {
    const m = JSON.parse(event.data);
    const w = waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    clearTimeout(w.timer);
    if (m.error) w.reject(new Error(m.error.message));
    else w.resolve(m.result);
  };
  ws.onclose = () => {
    for (const w of waiting.values()) w.reject(new Error('The browser was closed.'));
    waiting.clear();
    if (session?.ws === ws) session = null;
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error(`The browser did not answer (${method}).`));
    }, COMMAND_TIMEOUT_MS);
    waiting.set(id, { resolve, reject, timer });
    ws.send(JSON.stringify({ id, method, params }));
  });
  return { ws, send };
}

async function closeBrowser() {
  const portFile = join(PATHS.browserProfile, 'DevToolsActivePort');
  const port = existsSync(portFile) ? Number(readFileSync(portFile, 'utf8').split('\n')[0]) : 0;
  if (!(await answers(port))) return text('The browser was not open.');
  const { webSocketDebuggerUrl } = await devtoolsJson(port, '/json/version');
  const root = await devtools(webSocketDebuggerUrl);
  await root.send('Browser.close').catch(() => {});
  session = null;
  return text('Closed the browser.');
}

/** Runs `fn` inside the page with JSON-able arguments and returns its JSON-able result. */
async function evaluate(page, fn, ...args) {
  const expression = `(${fn})(${args.map((a) => JSON.stringify(a)).join(',')})`;
  const r = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

async function settle(page) {
  for (let i = 0; i < 80; i++) {
    const state = await evaluate(page, () => document.readyState).catch(() => 'loading');
    if (state === 'complete') return;
    await sleep(250);
  }
}

/** A click or Enter may start loading a new page: give it a moment, then wait for it. */
async function afterAction(page) {
  await sleep(500);
  await settle(page);
}

async function describe(page, maxChars) {
  const p = await evaluate(page, readPage, maxChars);
  return text(`${p.title}\n${p.url}\n\n${p.text}${p.controls.length ? `\n\nThings you can click or type into:\n${p.controls.join('\n')}` : ''}`);
}
