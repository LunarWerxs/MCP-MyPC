// Every tool, and the one rule that makes a family work: a tool call with `computer` set to another
// family computer is sent there through the family room instead of running here.
import { appendFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { PATHS } from '../config.mjs';
import { errorResult, text } from '../util.mjs';
import { browser } from './browser.mjs';
import { listFolder, readFileTool, writeFileTool } from './files.mjs';
import { screenshot } from './screen.mjs';
import { findFiles } from './search.mjs';
import { runCommand } from './shell.mjs';
import { computerInfo, openTool, systemName } from './system.mjs';

const remoteActivity = {
  name: 'remote_activity',
  description: 'Show what family computers (and the ChatGPT link, if it is on) recently did on the computer.',
  inputSchema: { type: 'object', properties: { entries: { type: 'number', description: 'How many recent entries. Default 50.' } } },
  summary: () => '',
  async run({ entries }) {
    let log = '';
    try { log = readFileSync(PATHS.activity, 'utf8'); } catch {}
    const lines = log.trim().split('\n').filter(Boolean);
    const count = Math.max(1, Math.floor(Number(entries) || 50));
    return text(lines.length ? lines.slice(-count).join('\n') : 'Nobody else has used this computer through MCP-MyPC.');
  },
};

const LOCAL_TOOLS = [runCommand, findFiles, readFileTool, writeFileTool, listFolder, screenshot, browser, computerInfo, openTool, remoteActivity];
const BY_NAME = new Map(LOCAL_TOOLS.map((t) => [t.name, t]));

// The name an AI app shows for each tool, and MCP's hints about what it may change: apps can let a
// read-only tool run with fewer confirmations. Every tool can act on another computer, so none is closed-world.
const READ_ONLY = { readOnlyHint: true, openWorldHint: true };
const CHANGES = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };
const SHOWS = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
const PRESENTATION = {
  list_computers: ['List family computers', READ_ONLY],
  run_command: ['Run a command', CHANGES],
  find_files: ['Find files by name', READ_ONLY],
  read_file: ['Read a file', READ_ONLY],
  write_file: ['Save a file', CHANGES],
  list_folder: ['List a folder', READ_ONLY],
  screenshot: ['Take a screenshot', READ_ONLY],
  browser: ['Use a browser window', CHANGES],
  computer_info: ['Computer info', READ_ONLY],
  open: ['Open a website, file or folder', SHOWS],
  remote_activity: ['Remote activity', READ_ONLY],
};

const COMPUTER = {
  type: 'string',
  description: "Which computer to use. Leave it out for this computer, or give a family computer's name from list_computers.",
};

const LIST_COMPUTERS = {
  name: 'list_computers',
  description: 'Show this computer and the family computers that are switched on and reachable right now, with their systems. Every other tool takes a `computer` name from this list.',
  inputSchema: { type: 'object', properties: {} },
};

/** Run a tool on this computer. `from` is set when someone else asked (a family computer or the ChatGPT link). */
export async function runLocal(name, args, from) {
  const tool = BY_NAME.get(name);
  if (!tool) return errorResult(`Unknown tool: ${name}`);
  if (from) recordActivity(from, tool, args);
  try {
    return { content: await tool.run(args ?? {}), isError: false };
  } catch (e) {
    return errorResult(e.message);
  }
}

/**
 * The tool list and dispatcher a chat sees. `family()` returns this computer's FamilyLink, or null
 * when it has not joined a family.
 */
export function createToolbox({ config, family, caller }) {
  const listTools = () => [LIST_COMPUTERS, ...LOCAL_TOOLS].map(({ name, description, inputSchema }) => ({
    name,
    title: PRESENTATION[name][0],
    description,
    inputSchema: name === 'list_computers' ? inputSchema : { ...inputSchema, properties: { ...inputSchema.properties, computer: COMPUTER } },
    annotations: { title: PRESENTATION[name][0], ...PRESENTATION[name][1] },
  }));

  // Who answered the last roll call, so a run of calls to one computer does not wait for a new one each time.
  let rollCall = { at: 0, online: [] };
  async function whoIsOnline(link, fresh = false) {
    if (fresh || Date.now() - rollCall.at > 60_000) rollCall = { at: Date.now(), online: await link.online() };
    return rollCall.online;
  }
  const othersIn = (online) => online.filter((d) => d.id !== config.deviceId);

  async function listComputers() {
    const here = `This computer: ${config.name} (${systemName()})`;
    const link = family();
    if (!link) return { content: text(`${here}\n\nNo family computers: this computer has not joined a family. Run "mypc family create" on one computer and "mypc family join <code>" on the others.`) };
    let online;
    try { online = await whoIsOnline(link, true); } catch (e) { return { content: text(`${here}\n\n${e.message}`) }; }
    const others = othersIn(online);
    const agentHere = Boolean(link.serve) || online.length > others.length;
    return {
      content: text([
        here,
        agentHere ? '' : '(Its background helper is not running, so family computers cannot reach it right now.)',
        others.length ? 'Family computers online:' : 'No other family computer is online right now. They show up while they are switched on and signed in.',
        ...others.map((d) => `- ${d.name} (${d.os})`),
      ].filter(Boolean).join('\n')),
    };
  }

  async function callTool(name, args) {
    if (name === 'list_computers') return listComputers();
    const { computer, ...rest } = args ?? {};
    const target = String(computer ?? '').trim();
    if (!target || isThisComputer(target)) return runLocal(name, rest, caller);
    if (!BY_NAME.has(name)) return errorResult(`Unknown tool: ${name}`);

    const link = family();
    if (!link) return errorResult('This computer has not joined a family, so it cannot reach other computers.');
    try {
      return await callFamily(link, name, rest, target);
    } catch (e) {
      return errorResult(e.message);
    }
  }

  async function callFamily(link, name, args, target) {
    // This computer takes part in the match, so "mom" on Mom's PC never quietly lands on "Mom's laptop".
    const self = { id: config.deviceId, name: config.name };
    const choose = (online) => pick([self, ...othersIn(online)], target);
    let found = choose(await whoIsOnline(link));
    if (!found.match) found = choose(await whoIsOnline(link, true));
    if (found.match === self) return runLocal(name, args, caller);
    if (found.match) return link.call(found.match.id, name, args, BY_NAME.get(name).timeoutMs?.(args) ?? 90_000);
    const online = othersIn(rollCall.online).map((d) => d.name).join(', ') || 'none';
    return errorResult(found.ambiguous
      ? `More than one family computer matches "${target}". Use the full name. Online now: ${online}.`
      : `No family computer called "${target}" is online. Online now: ${online}.`);
  }

  function isThisComputer(target) {
    const t = target.toLowerCase();
    return t === config.name.toLowerCase() || t === config.deviceId || ['this', 'this computer', 'local', 'here'].includes(t);
  }

  return { listTools, callTool };
}

/** Exact name or id first, then the one computer whose name contains the text ("mom" finds "Mom's PC"). Never a guess. */
function pick(devices, target) {
  const t = target.toLowerCase();
  const exact = devices.filter((d) => d.name.toLowerCase() === t || d.id === t);
  const candidates = exact.length ? exact : devices.filter((d) => d.name.toLowerCase().includes(t));
  return candidates.length === 1 ? { match: candidates[0] } : { ambiguous: candidates.length > 1 };
}

const ACTIVITY_LOG_MAX = 512 * 1024;

function recordActivity(from, tool, args) {
  try {
    const oneLine = (value, max) => String(value ?? '').replace(/\s+/g, ' ').slice(0, max);
    const detail = oneLine(tool.summary?.(args), 200);
    if (statSync(PATHS.activity, { throwIfNoEntry: false })?.size > ACTIVITY_LOG_MAX) {
      const kept = readFileSync(PATHS.activity, 'utf8').slice(-ACTIVITY_LOG_MAX / 2);
      writeFileSync(PATHS.activity, kept.slice(kept.indexOf('\n') + 1));
    }
    appendFileSync(PATHS.activity, `${new Date().toISOString()}  ${oneLine(from.name, 60)}  ${tool.name}${detail ? `  ${detail}` : ''}\n`);
  } catch {}
}
