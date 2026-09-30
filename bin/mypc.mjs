#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

if (!globalThis.WebSocket) {
  console.error(`MCP-MyPC needs Node.js 22 or newer (this is ${process.version}). Install the current LTS from https://nodejs.org and run this again.`);
  process.exit(1);
}

const { CLI, HOME, PATHS, ROOT, VERSION, loadConfig, updateConfig } = await import('../src/config.mjs');
const { FamilyLink, newFamilyCode, parseFamilyCode } = await import('../src/family.mjs');
const { agentHealth, device, runAgent } = await import('../src/agent.mjs');
const setup = await import('../src/setup.mjs');

const MYPC = `node "${CLI}"`;
const REPO = 'https://github.com/LunarWerxs/MCP-MyPC';
const [command, ...rest] = process.argv.slice(2);
const flags = parseFlags(rest);

const commands = {
  async install() {
    if (flags.relay && !/^(https:\/\/[^\s/]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$))/.test(flags.relay)) {
      throw new Error('--relay must start with https:// (or be http://localhost for a relay you are testing on this computer).');
    }
    const config = updateConfig({ name: flags.name ?? loadConfig().name, ...(flags.relay && { relay: flags.relay }) });
    console.log(`Installing MCP-MyPC ${VERSION} on "${config.name}"...`);
    if (!flags['no-apps']) for (const line of setup.registerApps()) console.log(`  ${line}`);
    if (!flags['no-autostart']) console.log(`  ${await setup.installAutostart()}`);
    console.log(`\n${guide(config)}`);
  },

  async stdio() {
    const { createMcpServer, serveStdio } = await import('../src/mcp.mjs');
    const { createToolbox } = await import('../src/tools/index.mjs');
    const { instructions } = await import('../src/instructions.mjs');
    const config = loadConfig();
    let link = null;
    const family = () => {
      if (!link && config.familyCode) link = new FamilyLink({ relay: config.relay, code: config.familyCode, device: device(config) });
      return link;
    };
    serveStdio(createMcpServer({ ...createToolbox({ config, family }), instructions: () => instructions(config) }));
  },

  agent: runAgent,

  async family() {
    const [action, code] = flags._;
    const config = loadConfig();
    if (action === 'create') {
      if (config.familyCode) return console.log(`"${config.name}" is already in a family. Show its code with: ${MYPC} family code`);
      const fresh = newFamilyCode();
      updateConfig({ familyCode: fresh });
      console.log(`Created a family. Its code is:\n\n    ${fresh}\n\nSend it to the other person (a text message is fine). On their computer, run:\n    mypc family join ${fresh}\n(or tell their AI: "join my MCP-MyPC family with code ${fresh}").\n\nKeep the code private: anyone who has it can use every computer in the family.`);
      return;
    }
    if (action === 'join') {
      parseFamilyCode(code);
      updateConfig({ familyCode: code.trim().toUpperCase() });
      console.log(`"${config.name}" joined the family. Looking for the others...`);
      return showFamily(loadConfig());
    }
    if (action === 'code') return console.log(config.familyCode ?? 'This computer is not in a family.');
    if (action === 'leave') {
      updateConfig({ familyCode: null });
      return console.log(`"${config.name}" left the family. The others can no longer reach it.`);
    }
    console.log(`Usage: ${MYPC} family create | join <code> | code | leave`);
  },

  async chatgpt() {
    const [action] = flags._;
    let config = loadConfig();
    if (action === 'off') {
      updateConfig({ chatgptToken: null });
      return console.log('ChatGPT link is off. The old link no longer works.');
    }
    if (action !== 'on') return console.log(`Usage: ${MYPC} chatgpt on | off`);
    if (!config.chatgptToken) config = updateConfig({ chatgptToken: randomBytes(32).toString('base64url') });
    console.log(chatgptGuide(config));
  },

  async rename() {
    const name = flags._.join(' ').trim();
    if (!name) return console.log(`Usage: ${MYPC} rename "Mom's PC"`);
    updateConfig({ name });
    console.log(`This computer is now called "${name}".`);
  },

  async status() {
    const config = loadConfig();
    const health = await agentHealth();
    console.log([
      `MCP-MyPC ${VERSION} on "${config.name}"`,
      `Background helper: ${health ? `running${health.version !== VERSION ? ` (old version ${health.version}; run "${MYPC} update")` : ''}` : 'NOT running'}`,
      `Family: ${config.familyCode ? (health?.familyConnected ? 'joined, connected' : 'joined') : 'not joined'}`,
      `ChatGPT link: ${config.chatgptToken ? (health?.chatgptConnected ? 'on, connected' : 'on') : 'off'}`,
      `Settings folder: ${HOME}`,
    ].join('\n'));
    if (config.familyCode) await showFamily(config);
  },

  async update() {
    if (existsSync(join(ROOT, '.git'))) {
      const r = spawnSync('git', ['-C', ROOT, 'pull', '--ff-only'], { stdio: 'inherit', windowsHide: true });
      if (r.status !== 0) throw new Error('Could not update with git.');
    } else {
      const work = mkdtempSync(join(tmpdir(), 'mypc-update-'));
      try {
        const archive = join(work, 'main.tar.gz');
        const r = await fetch(`${REPO}/archive/refs/heads/main.tar.gz`);
        if (!r.ok) throw new Error(`Could not download the update (${r.status}).`);
        writeFileSync(archive, Buffer.from(await r.arrayBuffer()));
        // tar ships with Windows 10+, macOS and Linux.
        if (spawnSync('tar', ['-xzf', archive, '-C', work], { windowsHide: true }).status !== 0) throw new Error('Could not unpack the update.');
        swapIn(join(work, 'MCP-MyPC-main'));
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    }
    await setup.restartAgent();
    console.log('Updated. Restart your AI app to pick up the new version.');
  },

  async uninstall() {
    setup.unregisterApps();
    await setup.removeAutostart();
    if (flags.purge) rmSync(HOME, { recursive: true, force: true });
    console.log(`MCP-MyPC is removed from your AI apps and no longer starts by itself.${flags.purge ? '' : ` Its settings are still in ${HOME} (add --purge to delete them).`} You can delete ${ROOT} now.`);
  },

  async help() {
    console.log(`MCP-MyPC ${VERSION}: let your AI use this computer, and your family's.

  ${MYPC} install [--name "Mom's PC"]    set up this computer
  ${MYPC} status                         how it is doing, and which family computers are online
  ${MYPC} family create                  start a family and print its code
  ${MYPC} family join <code>             join a family with the code from another computer
  ${MYPC} family leave                   stop sharing this computer with the family
  ${MYPC} chatgpt on | off               a private link for adding this computer to ChatGPT
  ${MYPC} rename "<name>"                change the name family computers see
  ${MYPC} update                         get the newest version
  ${MYPC} uninstall [--purge]            remove it

Remote activity on this computer is logged in ${PATHS.activity}.
More: ${REPO}`);
  },
};

/**
 * Replace this install with the unpacked `fresh` version. The old version is moved aside first (a
 * rename inside ROOT, so the same disk) and put back if anything fails, so a failed update never
 * leaves a half-installed copy. Files the new version no longer has go away with the old version.
 * That is safe because the install folder only ever holds shipped files: there are no dependencies,
 * everything MCP-MyPC keeps (settings, family code, logs) lives in HOME, and a git install updates
 * with `git pull` instead of coming here.
 */
function swapIn(fresh) {
  const aside = join(ROOT, '.update-old');
  // Left by an earlier update that could not put everything back: finish putting it back first.
  if (existsSync(aside)) putBack(aside, readdirSync(aside).filter((e) => !existsSync(join(ROOT, e))));
  rmSync(aside, { recursive: true, force: true });
  mkdirSync(aside);
  const moved = [];
  const copied = [];
  try {
    for (const entry of readdirSync(ROOT).filter((e) => e !== '.update-old')) {
      renameSync(join(ROOT, entry), join(aside, entry));
      moved.push(entry);
    }
    for (const entry of readdirSync(fresh)) {
      copied.push(entry);
      cpSync(join(fresh, entry), join(ROOT, entry), { recursive: true });
    }
  } catch (e) {
    for (const entry of copied) try { rmSync(join(ROOT, entry), { recursive: true, force: true }); } catch {}
    putBack(aside, moved, `The update failed (${e.message})`);
    rmSync(aside, { recursive: true, force: true });
    throw new Error(`The update failed, so the old version was put back: ${e.message}`);
  }
  rmSync(aside, { recursive: true, force: true });
}

/** Move each entry back from `aside`, one at a time. Throws, keeping `aside`, if any could not be moved. */
function putBack(aside, entries, why = 'An earlier update did not finish') {
  const stuck = entries.filter((entry) => {
    try { renameSync(join(aside, entry), join(ROOT, entry)); return false; } catch { return true; }
  });
  if (stuck.length) {
    throw new Error(`${why}, and ${stuck.join(', ')} could not be put back. The old copies are in ${aside}: close anything using this folder and run update again.`);
  }
}

async function showFamily(config) {
  const link = new FamilyLink({ relay: config.relay, code: config.familyCode, device: device(config) });
  try {
    const others = (await link.online(2500)).filter((d) => d.id !== config.deviceId);
    console.log(others.length
      ? `Family computers online: ${others.map((d) => `${d.name} (${d.os})`).join(', ')}`
      : 'No other family computer is online right now. They show up while they are switched on and signed in.');
  } catch (e) {
    console.log(e.message);
  } finally {
    link.close();
  }
}

function guide(config) {
  return `Done. MCP-MyPC is set up on "${config.name}".

Claude desktop app: quit Claude completely (Windows: right-click the Claude icon next to the clock > Quit; Mac: Claude menu > Quit Claude), then open it again. Ask it: "Take a screenshot of my computer".
Claude Code: works in new chats.
ChatGPT (Plus or Pro plan): run  ${MYPC} chatgpt on  and follow the three steps it prints.

Family: on ONE computer run  ${MYPC} family create  and send the code to the other person. They run  ${MYPC} family join <code>.
Keep the code private: anyone who has it can use every computer in the family.`;
}

function chatgptGuide(config) {
  return `ChatGPT link for "${config.name}" is on. Your link (keep it private: it works like a password):

    ${config.relay}/link/${config.chatgptToken}/mcp

In ChatGPT on the web (needs a Plus or Pro plan):
1. Open Settings and turn on Developer mode (under Apps & Connectors > Advanced, or under Security in newer versions).
2. Add a new app or connector with the Create or + button. Name it MyPC, paste the link above, choose "No authentication", confirm you trust it, and save.
3. In a new chat, turn on MyPC from the + menu and ask: "Take a screenshot of my computer".

This computer has to be switched on and signed in for ChatGPT to reach it. Turn the link off any time with:  ${MYPC} chatgpt off`;
}

function parseFlags(args) {
  const out = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) out._.push(a);
    else if (['--name', '--relay'].includes(a)) out[a.slice(2)] = args[++i];
    else out[a.slice(2)] = true;
  }
  return out;
}

const run = commands[command ?? 'help'];
if (!run) {
  console.error(`Unknown command "${command}". Run: ${MYPC} help`);
  process.exit(1);
}
try {
  await run();
  if (!['stdio', 'agent'].includes(command)) process.exit(0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
