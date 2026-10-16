// -----------------------------------------------------------------------------
// The official realtime API of Ambient Weather: a Socket.IO server
// (rt2.ambientweather.net, `?api=1&applicationKey=...`) that pushes every new
// reading of the subscribed API keys, as aioambient's Websocket client reads
// it. A minimal Socket.IO v5 / Engine.IO v4 client over the WebSocket built
// into Node.js 22+, so no extra dependency:
//
//   server "0{...}"          open (pingInterval, pingTimeout)   -> client "40"
//   server "40{...}"         namespace joined  -> client 42["subscribe",{apiKeys}]
//   server "2"               ping              -> client "3"
//   server 42["subscribed",{devices:[...]}]    the stations and their last data
//   server 42["data",{macAddress,...}]         a new reading
//
// The keys travel in the URL and the subscribe message only: no log line
// carries them.
// -----------------------------------------------------------------------------

import { REALTIME_URL, RECONNECT_MAX, RECONNECT_MIN } from './constants.js';

const defaultTimers = { setTimeout, clearTimeout };

export class RealtimeClient {
  constructor({
    WebSocketImpl = globalThis.WebSocket,
    timers = defaultTimers,
    logger,
    onSubscribed = () => {},
    onData = () => {},
    onStatus = () => {},
  }) {
    this.WebSocketImpl = WebSocketImpl;
    this.timers = timers;
    this.logger = logger;
    this.onSubscribed = onSubscribed;
    this.onData = onData;
    this.onStatus = onStatus;
    this.socket = undefined;
    this.keys = undefined;
    this.delay = RECONNECT_MIN;
    this.retryTimer = undefined;
    this.watchdog = undefined;
    this.heartbeat = 45_000;
    this.status = 'stopped';
  }

  start(keys) {
    this.stop();
    this.keys = keys;
    this.delay = RECONNECT_MIN;
    this.connect();
  }

  stop() {
    this.keys = undefined;
    this.timers.clearTimeout(this.retryTimer);
    this.timers.clearTimeout(this.watchdog);
    this.retryTimer = undefined;
    this.watchdog = undefined;
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      try {
        socket.close();
      } catch {
        // Already closed.
      }
    }
    this.setStatus('stopped');
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
    url.searchParams.set('EIO', '4');
    url.searchParams.set('transport', 'websocket');
    this.setStatus('connecting');
    let socket;
    try {
      socket = new this.WebSocketImpl(url.href);
    } catch (err) {
      this.retry(err.name ?? 'error');
      return;
    }
    this.socket = socket;
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

  send(packet) {
    try {
      this.socket?.send(packet);
    } catch (err) {
      this.logger?.warn(`Realtime send failed: ${err.name}`);
    }
  }

  /** No ping within the delay the server announced: the link is dead. */
  armWatchdog() {
    this.timers.clearTimeout(this.watchdog);
    this.watchdog = this.timers.setTimeout(() => {
      this.logger?.warn('Realtime: no ping from Ambient, reconnecting');
      const socket = this.socket;
      this.socket = undefined;
      try {
        socket?.close();
      } catch {
        // Already closed.
      }
      this.retry('timeout');
    }, this.heartbeat);
  }

  retry(reason) {
    this.timers.clearTimeout(this.watchdog);
    if (!this.keys) {
      return;
    }
    if (this.status === 'refused') {
      // Refused keys stay refused until the user changes them (which
      // restarts the client): only a slow retry.
      this.delay = RECONNECT_MAX;
    } else {
      this.setStatus('down', reason);
    }
    this.timers.clearTimeout(this.retryTimer);
    const delay = this.delay;
    this.delay = Math.min(RECONNECT_MAX, this.delay * 2);
    this.logger?.info(`Realtime ${reason}: reconnecting in ${Math.round(delay / 1000)} s`);
    this.retryTimer = this.timers.setTimeout(() => this.connect(), delay);
  }

  receive(packet) {
    const type = packet[0];
    if (type === '0') {
      // Engine.IO open.
      const open = parse(packet.slice(1)) ?? {};
      this.heartbeat = (open.pingInterval ?? 25_000) + (open.pingTimeout ?? 20_000);
      this.armWatchdog();
      this.send('40');
    } else if (type === '2') {
      this.armWatchdog();
      this.send('3');
    } else if (type === '1') {
      this.socket?.close();
    } else if (type === '4') {
      this.message(packet.slice(1));
    }
  }

  /** A Socket.IO packet (inside an Engine.IO "message"). */
  message(packet) {
    const type = packet[0];
    if (type === '0') {
      this.send(`42${JSON.stringify(['subscribe', { apiKeys: [this.keys.apiKey] }])}`);
    } else if (type === '2') {
      const event = parse(packet.slice(1));
      if (!Array.isArray(event)) {
        return;
      }
      const [name, payload] = event;
      if (name === 'subscribed') {
        this.delay = RECONNECT_MIN;
        const devices = Array.isArray(payload?.devices) ? payload.devices : [];
        if (devices.length === 0 && payload?.invalidApiKeys?.length) {
          this.setStatus('refused');
        } else {
          this.setStatus('subscribed');
        }
        this.onSubscribed(devices);
      } else if (name === 'data' && payload && typeof payload === 'object') {
        this.onData(payload);
      }
    } else if (type === '4') {
      // connect_error: the namespace refused us (a wrong Application key).
      this.setStatus('refused');
      this.socket?.close();
    } else if (type === '1') {
      this.socket?.close();
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
