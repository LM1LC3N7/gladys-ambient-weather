// -----------------------------------------------------------------------------
// The pacer (1 request per second per key) and the realtime client, against a
// fake clock and a fake Ambient Socket.IO server.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPacer } from '../src/pacer.js';
import { RealtimeClient } from '../src/realtime.js';
import { createFakeTimers, createFakeWebSocket, quiet } from './helpers/fakes.js';

const KEYS = { apiKey: 'API-KEY-1', applicationKey: 'APP-KEY-1' };

test('the pacer runs one call at a time, at least the gap apart', async () => {
  const clock = { now: 10_000 };
  const sleeps = [];
  const pace = createPacer(1_100, {
    now: () => clock.now,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock.now += ms;
    },
  });
  const starts = [];
  const task = (fail) => async () => {
    starts.push(clock.now);
    clock.now += 200;
    if (fail) {
      throw new Error('boom');
    }
    return 'ok';
  };
  const results = await Promise.allSettled([pace(task()), pace(task(true)), pace(task())]);
  assert.deepEqual(
    results.map((r) => r.status),
    ['fulfilled', 'rejected', 'fulfilled'],
  );
  // Each call starts 1.1 s after the end of the previous one, failed or not.
  assert.deepEqual(starts, [10_000, 11_300, 12_600]);
  assert.deepEqual(sleeps, [1_100, 1_100]);
});

function setup({ random = () => 0.5 } = {}) {
  const timers = createFakeTimers();
  const ws = createFakeWebSocket();
  const seen = { subscribed: [], data: [], status: [] };
  const client = new RealtimeClient({
    WebSocketImpl: ws.FakeWebSocket,
    timers,
    // 0.5: no jitter, so the delays read plainly.
    random,
    logger: quiet,
    onSubscribed: (devices) => seen.subscribed.push(devices),
    onData: (reading) => seen.data.push(reading),
    onStatus: (status) => seen.status.push(status),
  });
  return { timers, ws, seen, client };
}

test('realtime: the Socket.IO handshake, the subscription, the pushes', () => {
  const { ws, seen, client } = setup();
  client.start(KEYS);
  const socket = ws.last();
  const url = new URL(socket.url);
  assert.equal(url.origin + url.pathname, 'wss://rt2.ambientweather.net/socket.io/');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('applicationKey'), 'APP-KEY-1');
  assert.equal(url.searchParams.get('EIO'), '4');
  assert.equal(url.searchParams.get('apiKey'), null, 'the API key is never in the URL');

  socket.handshake();
  assert.deepEqual(socket.sent, ['40', '42["subscribe",{"apiKeys":["API-KEY-1"]}]']);

  socket.receive('2');
  assert.equal(socket.sent.at(-1), '3', 'a ping is answered');

  socket.event('subscribed', { method: 'subscribe', devices: [{ macAddress: 'x' }] });
  assert.deepEqual(seen.subscribed, [[{ macAddress: 'x' }]]);
  assert.equal(client.status, 'subscribed');

  socket.event('data', { macAddress: '00:0E:C6:AA:BB:01', tempf: 70 });
  assert.deepEqual(seen.data, [{ macAddress: '00:0E:C6:AA:BB:01', tempf: 70 }]);

  // Garbage is ignored.
  socket.receive('42not json');
  socket.receive('');
  assert.equal(seen.data.length, 1);
  client.stop();
  assert.equal(client.status, 'stopped');
});

test('realtime: a lost link reconnects with a growing delay', async () => {
  const { ws, timers, client, seen } = setup();
  client.start(KEYS);
  ws.last().close(1006);
  assert.equal(client.status, 'down');
  assert.deepEqual(
    timers.timeouts().map((t) => t.ms),
    [5_000],
  );
  await timers.runTimeouts();
  assert.equal(ws.sockets.length, 2);
  ws.last().close(1006);
  assert.deepEqual(
    timers.timeouts().map((t) => t.ms),
    [10_000],
  );
  await timers.runTimeouts();
  // A subscription that does not hold keeps the delay growing.
  ws.last().handshake();
  ws.last().event('subscribed', { devices: [] });
  ws.last().close(1006);
  assert.deepEqual(
    timers.timeouts().map((t) => t.ms),
    [20_000],
  );
  await timers.runTimeouts();
  // One that holds for a minute resets it.
  ws.last().handshake();
  ws.last().event('subscribed', { devices: [] });
  const stable = timers.timeouts().find((t) => t.ms === 60_000);
  timers.pending.delete(stable.id);
  stable.fn();
  ws.last().close(1006);
  assert.deepEqual(
    timers.timeouts().map((t) => t.ms),
    [5_000],
  );
  assert.ok(seen.status.includes('subscribed'));
  client.stop();
  assert.equal(timers.timeouts().length, 0, 'stop cancels the retry');
});

test('realtime: the retry delay is spread by ±20 %', () => {
  for (const [random, expected] of [
    [0, 4_000],
    [1, 6_000],
  ]) {
    const { ws, timers, client } = setup({ random: () => random });
    client.start(KEYS);
    ws.last().close(1006);
    assert.deepEqual(
      timers.timeouts().map((t) => t.ms),
      [expected],
    );
    client.stop();
  }
});

test('realtime: a handshake that does not finish in 30 s is a failure', async () => {
  const { ws, timers, client } = setup();
  client.start(KEYS);
  const [handshake] = timers.timeouts();
  assert.equal(handshake.ms, 30_000);
  await timers.runTimeouts();
  assert.equal(ws.sockets[0].closed, true);
  assert.equal(client.status, 'down');
  assert.equal(client.failures, 1);
  client.stop();
});

test('realtime: after three failed v4 handshakes, Engine.IO v3 (the client pings)', async () => {
  const { ws, timers, client, seen } = setup();
  client.start(KEYS);
  for (let i = 0; i < 3; i += 1) {
    assert.equal(new URL(ws.last().url).searchParams.get('EIO'), '4');
    ws.last().close(1006);
    await timers.runTimeouts();
  }
  const socket = ws.last();
  assert.equal(new URL(socket.url).searchParams.get('EIO'), '3');
  socket.receive('0{"sid":"abc","upgrades":[],"pingInterval":25000,"pingTimeout":60000}');
  assert.deepEqual(socket.sent, [], 'v3: the server joins the namespace by itself');
  // The server joins the namespace, the client subscribes.
  socket.receive('40');
  assert.deepEqual(socket.sent, ['42["subscribe",{"apiKeys":["API-KEY-1"]}]']);
  // The client pings every pingInterval; the pong keeps the link alive.
  const ping = timers.timeouts().find((t) => t.ms === 25_000);
  timers.pending.delete(ping.id);
  ping.fn();
  assert.equal(socket.sent.at(-1), '2');
  socket.receive('3');
  assert.equal(timers.timeouts().find((t) => t.ms === 85_000) !== undefined, true);
  socket.event('subscribed', { devices: [{ macAddress: 'x' }] });
  assert.equal(client.status, 'subscribed');
  assert.equal(seen.subscribed.length, 1);
  client.stop();
});

test('realtime: no ping in time closes and reconnects', async () => {
  const { ws, timers, client } = setup();
  client.start(KEYS);
  ws.last().handshake();
  const [watchdog] = timers.timeouts();
  assert.equal(watchdog.ms, 45_000, 'pingInterval + pingTimeout');
  await timers.runTimeouts();
  assert.equal(ws.sockets[0].closed, true);
  assert.equal(client.status, 'down');
  client.stop();
});

test('realtime: refused keys are only retried slowly', () => {
  const { ws, timers, client } = setup();
  client.start(KEYS);
  ws.last().receive('0{"pingInterval":25000,"pingTimeout":20000}');
  ws.last().receive('44{"message":"invalid applicationKey"}');
  assert.equal(client.status, 'refused');
  assert.equal(ws.last().closed, true);
  const delays = timers.timeouts().map((t) => t.ms);
  assert.deepEqual(delays, [300_000]);
  client.stop();
});

test('realtime: a subscription with only invalid API keys is a refusal', () => {
  const { ws, client } = setup();
  client.start(KEYS);
  ws.last().handshake();
  ws.last().event('subscribed', { devices: [], invalidApiKeys: ['API-KEY-1'] });
  assert.equal(client.status, 'refused');
  client.stop();
});

test('realtime: without WebSocket support, nothing breaks', () => {
  const client = new RealtimeClient({ WebSocketImpl: undefined, logger: quiet });
  client.WebSocketImpl = undefined;
  client.start(KEYS);
  assert.equal(client.status, 'down');
  client.stop();
});
