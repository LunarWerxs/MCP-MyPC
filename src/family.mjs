// Family computers reach each other through the relay. Everything is encrypted with a key derived
// from the family code, which only the family's computers hold: the relay (and whoever runs it)
// sees only the room id and ciphertext, and cannot read, change or forge a message.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { PATHS, wsUrl } from './config.mjs';
import { RelaySocket } from './relay-socket.mjs';
import { errorResult, sleep } from './util.mjs';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O or U to misread
const CODE_BYTES = 20;
const AAD = Buffer.from('mcp-mypc v1');
const MAX_CLOCK_SKEW_MS = 10 * 60_000;
const ACK_TIMEOUT_MS = 8000;

// Tool calls this computer already ran, kept on disk so a copy re-sent after a restart is still refused.
const ranCalls = new Map();
let ranCallsLoaded = false;

function alreadyRan(mid, ts) {
  if (!ranCallsLoaded) {
    ranCallsLoaded = true;
    try { for (const [id, at] of Object.entries(JSON.parse(readFileSync(PATHS.ranCalls, 'utf8')))) ranCalls.set(id, at); } catch {}
  }
  if (ranCalls.has(mid)) return true;
  for (const [id, at] of ranCalls) if (Date.now() - at > 2 * MAX_CLOCK_SKEW_MS) ranCalls.delete(id);
  ranCalls.set(mid, ts);
  try { writeFileSync(PATHS.ranCalls, JSON.stringify(Object.fromEntries(ranCalls))); } catch {}
  return false;
}

export function newFamilyCode() {
  const chars = [];
  let bits = 0;
  let value = 0;
  for (const byte of randomBytes(CODE_BYTES)) {
    value = ((value << 8) | byte) & 0x1fff;
    bits += 8;
    while (bits >= 5) {
      chars.push(ALPHABET[(value >>> (bits - 5)) & 31]);
      bits -= 5;
    }
  }
  return `MYPC-${chars.join('').match(/.{4}/g).join('-')}`;
}

/** Accepts the code however a person retyped it: any case, spaces or dashes, O for 0, I or L for 1. */
export function parseFamilyCode(input) {
  let body = String(input ?? '').toUpperCase().replace(/[\s-]/g, '');
  if (body.length === 36 && body.startsWith('MYPC')) body = body.slice(4);
  body = body.replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{32}$/.test(body)) {
    throw new Error('That family code does not look right. It is MYPC- followed by 32 letters and numbers.');
  }
  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const ch of body) {
    value = ((value << 5) | ALPHABET.indexOf(ch)) & 0x1fff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function familyKeys(code) {
  const secret = parseFamilyCode(code);
  return {
    key: Buffer.from(hkdfSync('sha256', secret, AAD, 'key', 32)),
    room: Buffer.from(hkdfSync('sha256', secret, AAD, 'room', 32)).toString('hex'),
  };
}

export function seal(key, message) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const body = Buffer.concat([cipher.update(JSON.stringify(message), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

/** Returns the message, or null for anything not sealed with this key (or tampered with). */
export function unseal(key, frame) {
  if (frame.length < 29) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, frame.subarray(0, 12));
    decipher.setAAD(AAD);
    decipher.setAuthTag(frame.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(frame.subarray(28)), decipher.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * This computer's seat in the family room. With `serve` set (the background agent) it answers
 * "who is online" and runs tool calls addressed to this computer; without it (a chat's server)
 * it only asks.
 */
export class FamilyLink {
  #key;
  #socket;
  #seen = new Map();
  #pending = new Map();
  #helloWaiters = new Map();

  constructor({ relay, code, device, serve = null, log = () => {} }) {
    const { key, room } = familyKeys(code);
    this.#key = key;
    this.device = device;
    this.serve = serve;
    this.conn = randomBytes(8).toString('hex');
    this.#socket = new RelaySocket(wsUrl(relay, `/room/${room}`), {
      persistent: Boolean(serve),
      log,
      onMessage: (data) => this.#receive(data),
    });
  }

  get connected() {
    return this.#socket.isOpen;
  }

  close() {
    this.#socket.close();
  }

  /** Every family computer whose agent answers within `waitMs`, this computer's own agent included. */
  async online(waitMs = 1500) {
    await this.#socket.ensure();
    const q = randomBytes(6).toString('hex');
    const found = new Map();
    this.#helloWaiters.set(q, (from) => found.set(from.id, from));
    this.#send({ t: 'hello?', q });
    await sleep(waitMs);
    this.#helloWaiters.delete(q);
    return [...found.values()];
  }

  /** Run a tool on another family computer. It confirms receipt at once, so one that went offline fails fast. */
  async call(deviceId, tool, args, timeoutMs) {
    try { await this.#socket.ensure(); } catch (e) { return errorResult(e.message); }
    const rid = randomBytes(8).toString('hex');
    return new Promise((resolve) => {
      const finish = (result) => {
        clearTimeout(ackTimer);
        clearTimeout(resultTimer);
        this.#pending.delete(rid);
        resolve(result);
      };
      const ackTimer = setTimeout(() => finish(errorResult('That computer did not respond. It may have been switched off or lost its internet connection.')), ACK_TIMEOUT_MS);
      const resultTimer = setTimeout(() => finish(errorResult(`That computer did not finish within ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs);
      this.#pending.set(rid, {
        ack: () => clearTimeout(ackTimer),
        done: (result) => finish(Array.isArray(result?.content) ? result : errorResult('That computer sent back an answer this version cannot read.')),
      });
      this.#send({ t: 'call', to: deviceId, rid, tool, args });
    });
  }

  #send(message) {
    const from = { id: this.device.id, name: this.device.name, os: this.device.os, conn: this.conn };
    return this.#socket.send(seal(this.#key, { ...message, from, mid: randomBytes(8).toString('hex'), ts: Date.now() }));
  }

  async #receive(data) {
    if (typeof data === 'string') return;
    const m = unseal(this.#key, Buffer.from(data));
    if (!m?.from || Math.abs(Date.now() - m.ts) > MAX_CLOCK_SKEW_MS || this.#seen.has(m.mid)) return;
    this.#remember(m.mid);
    switch (m.t) {
      case 'hello?':
        if (this.serve) this.#send({ t: 'hello', to: m.from.conn, re: m.q });
        break;
      case 'hello':
        if (m.to === this.conn) this.#helloWaiters.get(m.re)?.(m.from);
        break;
      case 'call':
        if (this.serve && m.to === this.device.id && !alreadyRan(m.mid, m.ts)) {
          this.#send({ t: 'ack', to: m.from.conn, re: m.rid });
          let result;
          try { result = await this.serve(m.tool, m.args ?? {}, m.from); } catch (e) { result = errorResult(e.message); }
          this.#send({ t: 'result', to: m.from.conn, re: m.rid, result });
        }
        break;
      case 'ack':
        if (m.to === this.conn) this.#pending.get(m.re)?.ack();
        break;
      case 'result':
        if (m.to === this.conn) this.#pending.get(m.re)?.done(m.result);
        break;
    }
  }

  #remember(mid) {
    const now = Date.now();
    this.#seen.set(mid, now);
    if (this.#seen.size > 5000) {
      for (const [id, at] of this.#seen) if (now - at > 2 * MAX_CLOCK_SKEW_MS) this.#seen.delete(id);
    }
  }
}
