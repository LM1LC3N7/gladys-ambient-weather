// -----------------------------------------------------------------------------
// The official realtime API of Ambient Weather: a Socket.IO server
// (rt2.ambientweather.net, `?api=1&applicationKey=...`) that pushes every new
// reading of the subscribed API keys, as aioambient's Websocket client reads
// it. A minimal Socket.IO client over the WebSocket built into Node.js 22+,
// so no extra dependency.
//
// Engine.IO v4 (Socket.IO v5, what python-socketio 5 in aioambient speaks):
//   server "0{...}"          open (pingInterval, pingTimeout)   -> client "40"
//   server "40{...}"         namespace joined  -> client 42["subscribe",{apiKeys}]
//   server "2"               ping              -> client "3"
// Engine.IO v3 (Socket.IO v2, what the official ambient-api npm client
// speaks), tried after a few failed v4 handshakes:
//   server "0{...}", then "40" by itself; the CLIENT pings ("2") every
//   pingInterval and the server answers "3".
// Both:
//   server 42["subscribed",{devices:[...]}]    the stations and their last data
//   server 42["data",{macAddress,...}]         a new reading
//
// The keys travel in the URL and the subscribe message only: no log line
// carries them.
// -----------------------------------------------------------------------------

import {
  HANDSHAKE_FAILURES_BEFORE_SWITCH,
  HANDSHAKE_TIMEOUT,
  REALTIME_URL,
  RECONNECT_JITTER,
  RECONNECT_MAX,
  RECONNECT_MIN,
  RECONNECT_STABLE,
} from './constants.js';

const defaultTimers = { setTimeout, clearTimeout };

export class RealtimeClient {
  constructor({
    WebSocketImpl = globalThis.WebSocket,
    timers = defaultTimers,
    random = Math.random,
    logger,
    onSubscribed = () => {},
    onData = () => {},
    onStatus = () => {},
  }) {
    this.WebSocketImpl = WebSocketImpl;
    this.timers = timers;
    this.random = random;
    this.logger = logger;
    this.onSubscribed = onSubscribed;
    this.onData = onData;
    this.onStatus = onStatus;
    this.socket = undefined;
    this.keys = undefined;
    this.eio = 4;
    this.failures = 0;
    this.joined = false;
    this.delay = RECONNECT_MIN;
    this.pingInterval = 25_000;
    this.heartbeat = 45_000;
    this.timer = {};
    this.status = 'stopped';
  }

  start(keys) {
    this.stop();
    this.keys = keys;
    this.delay = RECONNECT_MIN;
    this.failures = 0;
    this.connect();
  }

  stop() {
    this.keys = undefined;
    this.clearTimers();
    const socket = this.socket;
    this.socket = undefined;
    closeQuietly(socket);
    this.setStatus('stopped');
  }

  clearTimers(names = ['retry', 'watchdog', 'handshake', 'ping', 'stable']) {
    for (const name of names) {
      this.timers.clearTimeout(this.timer[name]);
      this.timer[name] = undefined;
    }
  }

  later(name, ms, fn) {
    this.timers.clearTimeout(this.timer[name]);
    this.timer[name] = this.timers.setTimeout(fn, ms);
  }

  setStatus(status, detail) {
    if (status !== this.status) {
      this.status = status;
      this.onStatus(status, detail);
    }
  }

  connect() {
    if (!this.keys || typeof this.WebSocketImpl !== 'function') {
      this.setStatus('down', 'no WebSocket support');
      return;
    }
    const url = new URL(REALTIME_URL);
    url.searchParams.set('api', '1');
    url.searchParams.set('applicationKey', this.keys.applicationKey);
    url.searchParams.set('EIO', String(this.eio));
    url.searchParams.set('transport', 'websocket');
    if (this.status !== 'refused') {
      this.setStatus('connecting');
    }
    this.joined = false;
    let socket;
    try {
      socket = new this.WebSocketImpl(url.href);
    } catch (err) {
      this.retry(err.name ?? 'error');
      return;
    }
    this.socket = socket;
    this.later('handshake', HANDSHAKE_TIMEOUT, () => this.drop('handshake timeout'));
    socket.addEventListener('message', (event) => {
      if (socket === this.socket) {
        this.receive(String(event.data));
      }
    });
    socket.addEventListener('close', (event) => {
      if (socket === this.socket) {
        this.socket = undefined;
        this.retry(`closed (${event?.code ?? '?'})`);
      }
    });
    // An error is followed by a close: the retry happens there.
    socket.addEventListener('error', () => {});
  }

  /** Close the current link ourselves and retry. */
  drop(reason) {
    const socket = this.socket;
    this.socket = undefined;
    closeQuietly(socket);
    this.retry(reason);
  }

  send(packet) {
    try {
      this.socket?.send(packet);
    } catch (err) {
      this.logger?.warn(`Realtime send failed: ${err.name}`);
    }
  }

  /** No ping (v4) or pong (v3) in time: the link is dead. */
  armWatchdog() {
    this.later('watchdog', this.heartbeat, () => {
      this.logger?.warn('Realtime: no heartbeat from Ambient, reconnecting');
      this.drop('timeout');
    });
  }

  /** Engine.IO v3: the client pings. */
  schedulePing() {
    this.later('ping', this.pingInterval, () => {
      this.send('2');
      this.schedulePing();
    });
  }

  retry(reason) {
    this.clearTimers(['watchdog', 'handshake', 'ping', 'stable']);
    if (!this.keys) {
      return;
    }
    if (!this.joined) {
      // The handshake failed: after a few, the server may speak the other
      // Engine.IO version.
      this.failures += 1;
      if (this.failures >= HANDSHAKE_FAILURES_BEFORE_SWITCH) {
        this.failures = 0;
        this.eio = this.eio === 4 ? 3 : 4;
        this.logger?.info(`Realtime: trying Engine.IO v${this.eio}`);
      }
    }
    if (this.status === 'refused') {
      // Refused keys stay refused until the user changes them (which
      // restarts the client): only a slow retry.
      this.delay = RECONNECT_MAX;
    } else {
      this.setStatus('down', reason);
    }
    const spread = 1 + (this.random() * 2 - 1) * RECONNECT_JITTER;
    const delay = Math.round(this.delay * spread);
    this.delay = Math.min(RECONNECT_MAX, this.delay * 2);
    this.logger?.info(`Realtime ${reason}: reconnecting in ${Math.round(delay / 1000)} s`);
    this.later('retry', delay, () => this.connect());
  }

  receive(packet) {
    const type = packet[0];
    if (type === '0') {
      // Engine.IO open.
      const open = parse(packet.slice(1)) ?? {};
      this.pingInterval = open.pingInterval ?? 25_000;
      this.heartbeat = this.pingInterval + (open.pingTimeout ?? 20_000);
      this.armWatchdog();
      if (this.eio === 4) {
        this.send('40');
      } else {
        this.schedulePing();
      }
    } else if (type === '2') {
      this.armWatchdog();
      this.send('3');
    } else if (type === '3') {
      this.armWatchdog();
    } else if (type === '1') {
      this.drop('closed by Ambient');
    } else if (type === '4') {
      this.message(packet.slice(1));
    }
  }

  /** A Socket.IO packet (inside an Engine.IO "message"). */
  message(packet) {
    const type = packet[0];
    if (type === '0') {
      this.joined = true;
      this.failures = 0;
      this.clearTimers(['handshake']);
      this.send(`42${JSON.stringify(['subscribe', { apiKeys: [this.keys.apiKey] }])}`);
    } else if (type === '2') {
      const event = parse(packet.slice(1));
      if (!Array.isArray(event)) {
        return;
      }
      const [name, payload] = event;
      if (name === 'subscribed') {
        const devices = Array.isArray(payload?.devices) ? payload.devices : [];
        if (devices.length === 0 && payload?.invalidApiKeys?.length) {
          this.setStatus('refused');
        } else {
          this.setStatus('subscribed');
          // The delay goes back to its minimum only once the link held.
          this.later('stable', RECONNECT_STABLE, () => {
            this.delay = RECONNECT_MIN;
          });
        }
        this.onSubscribed(devices);
      } else if (name === 'data' && payload && typeof payload === 'object') {
        this.onData(payload);
      }
    } else if (type === '4') {
      // connect_error: the namespace refused us (a wrong Application key).
      this.joined = true;
      this.setStatus('refused');
      this.drop('refused');
    } else if (type === '1') {
      this.drop('namespace closed');
    }
  }
}

function closeQuietly(socket) {
  if (socket) {
    try {
      socket.close();
    } catch {
      // Already closed.
    }
  }
}

function parse(text) {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}
