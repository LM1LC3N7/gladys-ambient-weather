// -----------------------------------------------------------------------------
// Fakes for the tests: fetch (routes requests to handlers, records every call,
// fails loudly on an unexpected URL), timers (nothing fires by itself) and
// WebSocket (the test plays the Ambient realtime server). No test touches the
// network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { setFetch } from '../../src/http.js';

setFetch(async (url) => {
  throw new Error(`Network call without a fake fetch in a test: ${url}`);
});

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The instant the fixtures describe: 2026-10-16 18:10 UTC. */
export const FIXTURE_NOW = Date.parse('2026-10-16T18:10:00Z');

/** Install a fake fetch; `routes` is a list of [RegExp, handler({ url, params })]. */
export function installFetch(routes) {
  const calls = [];
  const previous = setFetch(async (url, init = {}) => {
    const call = { url, params: Object.fromEntries(new URL(url).searchParams), init };
    calls.push(call);
    const route = routes.find(([pattern]) => pattern.test(url));
    if (!route) {
      throw new Error(`Unexpected network call in a test: ${url}`);
    }
    return route[1](call);
  });
  return { calls, restore: () => setFetch(previous) };
}

export function createFakeTimers() {
  let nextId = 1;
  const pending = new Map();
  const add = (kind, fn, ms) => {
    const id = nextId++;
    pending.set(id, { id, kind, fn, ms });
    return id;
  };
  return {
    pending,
    setTimeout: (fn, ms) => add('timeout', fn, ms),
    setInterval: (fn, ms) => add('interval', fn, ms),
    clearTimeout: (id) => pending.delete(id),
    clearInterval: (id) => pending.delete(id),
    timeouts: () => [...pending.values()].filter((t) => t.kind === 'timeout'),
    intervals: () => [...pending.values()].filter((t) => t.kind === 'interval'),
    /** Run (and remove) every pending timeout once. */
    async runTimeouts() {
      for (const t of [...pending.values()].filter((t) => t.kind === 'timeout')) {
        pending.delete(t.id);
        await t.fn();
      }
    },
    async runIntervals() {
      for (const t of [...pending.values()].filter((t) => t.kind === 'interval')) {
        await t.fn();
      }
    },
  };
}

/** A WebSocket the test drives: `receive()` plays the server. */
export function createFakeWebSocket() {
  const sockets = [];
  class FakeWebSocket {
    constructor(url) {
      this.url = url;
      this.sent = [];
      this.listeners = {};
      this.closed = false;
      sockets.push(this);
    }
    addEventListener(type, fn) {
      (this.listeners[type] ??= []).push(fn);
    }
    send(data) {
      this.sent.push(data);
    }
    close(code = 1000) {
      if (!this.closed) {
        this.closed = true;
        this.emit('close', { code });
      }
    }
    emit(type, event) {
      for (const fn of this.listeners[type] ?? []) {
        fn(event);
      }
    }
    receive(data) {
      this.emit('message', { data });
    }
    /** The Engine.IO / Socket.IO handshake of the Ambient server. */
    handshake() {
      this.receive('0{"sid":"abc","upgrades":[],"pingInterval":25000,"pingTimeout":20000}');
      this.receive('40{"sid":"def"}');
    }
    event(name, payload) {
      this.receive(`42${JSON.stringify([name, payload])}`);
    }
  }
  return { FakeWebSocket, sockets, last: () => sockets[sockets.length - 1] };
}

/** Let the promises started by a callback settle. */
export const flush = () => new Promise((resolve) => setImmediate(resolve));

export const quiet = {
  info() {},
  warn: (...a) => process.env.DEBUG_TEST && console.error(...a),
  error() {},
  debug() {},
};
