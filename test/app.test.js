// -----------------------------------------------------------------------------
// The integration against the SDK's fake Gladys, a fake Ambient Weather (REST,
// public map) and a fake realtime server.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { AmbientClient } from '../src/ambient.js';
import { AmbientApp } from '../src/app.js';
import { ACTIONS } from '../src/constants.js';
import { T } from '../src/i18n.js';
import {
  FIXTURE_NOW,
  createFakeTimers,
  createFakeWebSocket,
  fixture,
  flush,
  installFetch,
  json,
  quiet,
} from './helpers/fakes.js';

const KEYS = { api_key: 'API-KEY-1', application_key: 'APP-KEY-1' };
const HOME = { id: 1, name: 'Home', selector: 'home', latitude: 40.7123, longitude: -74.0012 };
const BOAT = { id: 2, name: 'Boat', selector: 'boat', latitude: null, longitude: null };
const STATION = 'ext:ambient-weather:station:000ec6aabb01';

let fake;
afterEach(() => fake?.restore());

async function setup({ config = KEYS, houses = [HOME], start = true } = {}) {
  const answers = {
    devices: () => json(fixture('devices.json')),
    public: () => json(fixture('public.json')),
  };
  fake = installFetch([
    [/^https:\/\/rt\.ambientweather\.net\/v1\/devices\?/, (call) => answers.devices(call)],
    [/^https:\/\/lightning\.ambientweather\.net\/devices\?/, (call) => answers.public(call)],
  ]);
  const gladys = createFakeGladys({ selector: 'ambient-weather', config, houses });
  const timers = createFakeTimers();
  const clock = { now: FIXTURE_NOW };
  const sleeps = [];
  const client = new AmbientClient({
    now: () => clock.now,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock.now += ms;
    },
  });
  const ws = createFakeWebSocket();
  const app = new AmbientApp({
    gladys,
    logger: quiet,
    now: () => clock.now,
    timers,
    client,
    WebSocketImpl: ws.FakeWebSocket,
  });
  gladys.onAction(ACTIONS.TEST, () => app.testConnection());
  gladys.onDeviceCreated(() => app.publish());
  await gladys.connect();
  if (start) {
    await app.start(config);
  }
  return { app, gladys, timers, clock, ws, answers, sleeps };
}

const calls = (pattern) => fake.calls.filter((c) => pattern.test(c.url));
const REST = /rt\.ambientweather\.net/;
const PUBLIC = /lightning\.ambientweather\.net/;

/** The user creates every discovered device (as the Discovery tab does). */
async function createAll(gladys) {
  for (const device of gladys.fake.discoveredDevices) {
    await gladys.fake.deviceCreated(device);
  }
}

test('the stations of the account: one REST read, the devices, the status', async () => {
  const { gladys, timers, ws } = await setup();
  const [call] = calls(REST);
  assert.equal(calls(REST).length, 1);
  assert.equal(call.params.apiKey, 'API-KEY-1');
  assert.equal(call.params.applicationKey, 'APP-KEY-1');
  assert.equal(calls(PUBLIC).length, 0, 'the public stations are off by default');
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => d.name),
    ['Backyard', 'Backyard – indoor', 'Backyard – sensor 1', 'Backyard – soil 1', 'Cabin'],
  );
  // Nothing is created yet: nothing is published.
  assert.equal(gladys.fake.states.length, 0);
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: true,
    message: T.ok({ stations: 2, realtime: false, publicStations: null }),
  });
  // The account read every 5 minutes, the realtime link opened.
  assert.deepEqual(
    timers.intervals().map((t) => t.ms),
    [300_000],
  );
  assert.equal(ws.sockets.length, 1);
});

test('a created device gets its values at once, in the units of the configuration', async () => {
  const { gladys } = await setup();
  await createAll(gladys);
  assert.equal(gladys.fake.lastState(`${STATION}:tempf`), 18);
  assert.equal(gladys.fake.lastState(`${STATION}:baromrelin`), 1016.3);
  assert.equal(gladys.fake.lastState(`${STATION}:windgustmph`), 13);
  assert.equal(gladys.fake.lastState(`${STATION}:dailyrainin`), 7.9);
  assert.equal(gladys.fake.lastState(`${STATION}-indoor:tempinf`), 21.8);
  assert.equal(gladys.fake.lastState(`${STATION}-ch1:batt1`), 1);
  // The Cabin did not upload for 4 hours: its values are not sent as current.
  assert.equal(gladys.fake.lastState('ext:ambient-weather:station:000ec6aabb02:tempf'), undefined);
});

test('the next reads only send what changed, and a realtime push updates at once', async () => {
  const { gladys, timers, ws, answers, clock } = await setup();
  await createAll(gladys);
  const before = gladys.fake.states.length;
  await timers.runIntervals();
  assert.equal(calls(REST).length, 2);
  assert.equal(gladys.fake.states.length, before, 'same reading: nothing sent again');

  const socket = ws.last();
  socket.handshake();
  socket.event('subscribed', { devices: fixture('devices.json') });
  await flush();
  assert.equal(
    gladys.fake.connectionStatus.message.en,
    T.ok({ stations: 2, realtime: true, publicStations: null }).en,
  );

  const reading = { ...fixture('devices.json')[0].lastData, dateutc: FIXTURE_NOW + 60_000 };
  socket.event('data', { ...reading, tempf: 68, macAddress: '00:0E:C6:AA:BB:01', apiKey: 'x' });
  await flush();
  assert.equal(gladys.fake.lastState(`${STATION}:tempf`), 20);
  // An older REST answer never overwrites a newer realtime reading.
  clock.now += 60_000;
  await timers.runIntervals();
  assert.equal(gladys.fake.lastState(`${STATION}:tempf`), 20);
  // A push of an unknown station is ignored.
  socket.event('data', { macAddress: '11:22:33:44:55:66', tempf: 1, dateutc: FIXTURE_NOW });
  await flush();
  void answers;
});

test('a feature created in °F keeps getting °F after a switch to metric', async () => {
  const { gladys, app } = await setup({ config: { ...KEYS, units: 'imperial' } });
  await createAll(gladys);
  assert.equal(gladys.fake.lastState(`${STATION}:tempf`), 64.4);
  await app.start({ ...KEYS, units: 'metric' });
  assert.equal(
    gladys.fake.discoveredDevices[0].features.find((f) => f.external_id.endsWith(':tempf')).unit,
    'celsius',
  );
  gladys.forgetPublishedStates();
  await app.publish();
  assert.equal(gladys.fake.lastState(`${STATION}:tempf`), 64.4);
});

test('refused keys: a clear status, and no key in any message', async () => {
  const { gladys, answers, app } = await setup({ start: false });
  answers.devices = () => json({ error: 'apiKey-invalid' }, 401);
  await app.start(KEYS);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: false, message: T.keysRefused });
  const ack = await gladys.fake.action(ACTIONS.TEST);
  assert.ok(ack.data.message.en.startsWith(T.keysRefused.en));
  const everything = JSON.stringify([gladys.fake.connectionStatuses, ack]);
  assert.ok(!everything.includes('API-KEY-1') && !everything.includes('APP-KEY-1'));
});

test('a 429 says to slow down, a network failure names no URL', async () => {
  const { gladys, answers, timers } = await setup({ start: true });
  answers.devices = () => json({ error: 'above-user-rate-limit' }, 429);
  await timers.runIntervals();
  assert.deepEqual(gladys.fake.connectionStatus, { connected: false, message: T.rateLimited });
  answers.devices = () => {
    throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
  };
  await timers.runIntervals();
  const message = gladys.fake.connectionStatus.message.en;
  assert.match(message, /network ENOTFOUND on rt\.ambientweather\.net/);
  assert.ok(!message.includes('KEY'));
});

test('every REST call waits its turn: 1 request per second per key', async () => {
  const { app, sleeps } = await setup();
  await Promise.all([app.pollAccount(), app.testConnection(), app.pollAccount()]);
  assert.equal(calls(REST).length, 4);
  assert.deepEqual(sleeps, [1_100, 1_100, 1_100]);
});

test('nothing configured: a status that says what to do, no network call', async () => {
  const { gladys } = await setup({ config: {} });
  assert.equal(fake.calls.length, 0);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: false, message: T.notConfigured });
  const ack = await gladys.fake.action(ACTIONS.TEST);
  assert.deepEqual(ack.data.message, T.notConfigured);
});

test('a single key: both are needed', async () => {
  const { gladys } = await setup({ config: { api_key: 'API-KEY-1' } });
  assert.equal(fake.calls.length, 0);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: false, message: T.oneKeyMissing });
});

test('public stations without an account: the nearest ones around each house', async () => {
  const { gladys, timers, ws } = await setup({
    config: { public_stations: true },
    houses: [HOME, BOAT],
  });
  assert.equal(calls(REST).length, 0);
  const [call] = calls(PUBLIC);
  assert.equal(calls(PUBLIC).length, 1, 'one read for the one located house');
  assert.deepEqual(
    [
      call.params['$publicBox[0][0]'],
      call.params['$publicBox[0][1]'],
      call.params['$publicBox[1][0]'],
      call.params['$publicBox[1][1]'],
      call.params.$limit,
    ],
    ['-74.119', '40.62', '-73.881', '40.8', '50'],
  );
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((d) => [d.name, d.external_id]),
    // Without an account, the "Backyard" station is just a public one.
    [
      ['Backyard (Ambient Weather Network)', 'ext:ambient-weather:public:000ec6aabb01'],
      ['Hudson Pier (Ambient Weather Network)', 'ext:ambient-weather:public:aa0000000001'],
      ['Brooklyn Roof (Ambient Weather Network)', 'ext:ambient-weather:public:aa0000000002'],
    ],
  );
  const features = gladys.fake.discoveredDevices[0].features.map((f) => f.external_id);
  assert.ok(!features.some((id) => /:(battout|tempinf|humidityin)$/.test(id)));
  assert.equal(ws.sockets.length, 0, 'no account, no realtime');
  assert.deepEqual(
    timers.intervals().map((t) => t.ms),
    [600_000],
  );
  assert.deepEqual(gladys.fake.connectionStatus, {
    connected: true,
    message: T.ok({ stations: null, realtime: false, publicStations: 3 }),
  });
  await createAll(gladys);
  assert.equal(gladys.fake.lastState('ext:ambient-weather:public:aa0000000001:tempf'), 17.5);
});

test('public stations next to the account: the own station is not offered twice', async () => {
  const { gladys } = await setup({
    config: { ...KEYS, public_stations: true, public_max_stations: 1 },
  });
  const names = gladys.fake.discoveredDevices.map((d) => d.name);
  assert.ok(names.includes('Hudson Pier (Ambient Weather Network)'));
  assert.ok(!names.includes('Backyard (Ambient Weather Network)'));
  assert.equal(names.filter((n) => n.includes('Network')).length, 1);
});

test('public stations: no located house, or the map down', async () => {
  const { gladys, answers, app, timers } = await setup({
    config: { public_stations: true },
    houses: [BOAT],
  });
  assert.equal(calls(PUBLIC).length, 0);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: false, message: T.noLocatedHouse });

  gladys.fake.houses = [HOME];
  answers.public = () => json({ message: 'oops' }, 503);
  await app.start({ public_stations: true });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /Network does not answer \(HTTP 503/);

  // Back again.
  answers.public = () => json(fixture('public.json'));
  await timers.runIntervals();
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('the test button: each station and its last reading, in both languages', async () => {
  const { gladys } = await setup({ config: { ...KEYS, public_stations: true } });
  const ack = await gladys.fake.action(ACTIONS.TEST);
  assert.equal(ack.success, true);
  const { en, fr } = ack.data.message;
  assert.match(en, /^Account: 2 station\(s\)\./);
  assert.match(en, /- Backyard: 18 °C, read 1 min ago/);
  assert.match(en, /- Cabin: 10.1 °C, read 4 h ago/);
  assert.match(en, /Realtime: not connected yet\./);
  assert.match(en, /- Hudson Pier \(1.1 km\): 17.5 °C, read 1 min ago/);
  assert.match(fr, /- Backyard : 18 °C, mesure d'il y a 1 min/);
  assert.match(fr, /- Cabin : 10,1 °C, mesure d'il y a 4 h/);
  assert.match(fr, /Stations publiques à proximité : 3\./);
});

test('a configuration change restarts cleanly', async () => {
  const { app, timers, ws } = await setup();
  await app.start({ ...KEYS, realtime: false, poll_interval: 2 });
  assert.deepEqual(
    timers.intervals().map((t) => t.ms),
    [120_000],
  );
  assert.equal(ws.sockets[0].closed, true);
  assert.equal(ws.sockets.length, 1, 'realtime off: no new link');
  app.stop();
  assert.equal(timers.intervals().length, 0);
});
