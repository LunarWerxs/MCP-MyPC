// One WebSocket to the relay, kept alive with pings. A persistent socket (the background agent)
// reconnects forever with backoff; an on-demand one (a chat's server) connects when first needed.

const PING_EVERY_MS = 20_000;
const DEAD_AFTER_MS = 50_000;

export class RelaySocket {
  #ws = null;
  #connecting = null;
  #opening = null;
  #closed = false;
  #backoff = 1000;
  #pinger = null;
  #retry = null;
  #lastPong = 0;

  constructor(url, { onMessage, persistent = false, log = () => {} }) {
    this.url = url;
    this.onMessage = onMessage;
    this.persistent = persistent;
    this.log = log;
    if (persistent) this.ensure().catch(() => {});
  }

  get isOpen() {
    return this.#ws?.readyState === WebSocket.OPEN;
  }

  ensure(timeoutMs = 10_000) {
    if (this.#closed) return Promise.reject(new Error('This relay connection was closed.'));
    if (this.isOpen) return Promise.resolve();
    if (this.#opening) return this.#opening;
    this.#opening = new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      const settle = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.#opening = null;
        this.#connecting = null;
        if (error) {
          reject(error);
          this.#scheduleRetry();
        } else resolve();
      };
      let ws;
      try {
        ws = new WebSocket(this.url);
      } catch (e) {
        // Settle after this promise is stored in #opening, so settling clears it rather than being overwritten.
        queueMicrotask(() => settle(new Error(`The relay address is not valid: ${e.message}`)));
        return;
      }
      this.#connecting = ws;
      ws.binaryType = 'arraybuffer';
      timer = setTimeout(() => {
        settle(new Error('Could not reach the MPC-MyPC relay. Check the internet connection.'));
        try { ws.close(); } catch {}
      }, timeoutMs);
      ws.onopen = () => {
        if (this.#closed) {
          ws.close();
          settle(new Error('This relay connection was closed.'));
          return;
        }
        this.#ws = ws;
        this.#backoff = 1000;
        this.#lastPong = Date.now();
        this.#startPing();
        this.log('connected to the relay');
        settle();
      };
      ws.onmessage = (event) => {
        if (event.data === 'pong') this.#lastPong = Date.now();
        else this.onMessage(event.data);
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        settle(new Error('The relay closed the connection.'));
        if (this.#ws === ws) {
          this.#drop();
          this.log('lost the relay connection');
          this.#scheduleRetry();
        }
      };
    });
    return this.#opening;
  }

  send(data) {
    if (!this.isOpen) return false;
    this.#ws.send(data);
    return true;
  }

  close() {
    this.#closed = true;
    clearTimeout(this.#retry);
    for (const ws of [this.#ws, this.#connecting]) try { ws?.close(); } catch {}
    this.#drop();
  }

  /** Forget the current socket without waiting for it to finish closing (a dead link can take minutes). */
  #drop() {
    clearInterval(this.#pinger);
    const ws = this.#ws;
    this.#ws = null;
    try { ws?.close(); } catch {}
  }

  #scheduleRetry() {
    if (!this.persistent || this.#closed || this.#retry) return;
    const wait = this.#backoff;
    this.#backoff = Math.min(this.#backoff * 2, 60_000);
    this.#retry = setTimeout(() => {
      this.#retry = null;
      this.ensure().catch(() => {});
    }, wait);
  }

  #startPing() {
    clearInterval(this.#pinger);
    this.#pinger = setInterval(() => {
      if (!this.isOpen) return;
      if (Date.now() - this.#lastPong > DEAD_AFTER_MS) {
        this.log('the relay stopped answering; reconnecting');
        this.#drop();
        this.#scheduleRetry();
        return;
      }
      this.#ws.send('ping');
    }, PING_EVERY_MS);
    this.#pinger.unref?.();
  }
}
