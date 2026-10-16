// -----------------------------------------------------------------------------
// The pure part: Ambient readings -> sensors, stations, devices and states.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { sensorsOf } from '../src/sensors.js';
import {
  boxAround,
  devicesOf,
  distanceKm,
  isFresh,
  macId,
  nearbyPublic,
  stationsOf,
  statesOf,
} from '../src/stations.js';
import { FIXTURE_NOW, fixture } from './helpers/fakes.js';

const [backyard, cabin] = stationsOf(fixture('devices.json'));
const HOME = { latitude: 40.71, longitude: -74 };

const valueOf = (groups, group, field) =>
  groups.find((g) => g.key === group)?.sensors.find((s) => s.field === field)?.value;

test('a MAC address is the platform id, any spelling', () => {
  assert.equal(macId('00:0E:C6:AA:BB:01'), '000ec6aabb01');
  assert.equal(macId('00-0e-c6-aa-bb-01'), '000ec6aabb01');
  assert.equal(macId('not-a-mac'), null);
  assert.equal(macId(undefined), null);
  // The station without a valid MAC is dropped.
  assert.equal(stationsOf(fixture('devices.json')).length, 2);
  assert.equal(backyard.name, 'Backyard');
  assert.equal(backyard.latitude, 40.71);
});

test('metric conversions of every kind of sensor', () => {
  const groups = sensorsOf(backyard.lastData, { units: 'metric' });
  assert.deepEqual(
    groups.map((g) => g.key),
    ['outdoor', 'indoor', 'ch1', 'soil1'],
  );
  assert.equal(valueOf(groups, 'outdoor', 'tempf'), 18);
  assert.equal(valueOf(groups, 'outdoor', 'humidity'), 58);
  assert.equal(valueOf(groups, 'outdoor', 'baromrelin'), 1016.3);
  assert.equal(valueOf(groups, 'outdoor', 'baromabsin'), 1011.6);
  assert.equal(valueOf(groups, 'outdoor', 'windspeedmph'), 9);
  assert.equal(valueOf(groups, 'outdoor', 'windgustmph'), 13);
  assert.equal(valueOf(groups, 'outdoor', 'maxdailygust'), 24.1);
  assert.equal(valueOf(groups, 'outdoor', 'winddir'), 225);
  assert.equal(valueOf(groups, 'outdoor', 'hourlyrainin'), 3);
  assert.equal(valueOf(groups, 'outdoor', 'dailyrainin'), 7.9);
  assert.equal(valueOf(groups, 'outdoor', 'yearlyrainin'), 624.8);
  assert.equal(valueOf(groups, 'outdoor', 'uv'), 4);
  assert.equal(valueOf(groups, 'outdoor', 'solarradiation'), 52215);
  assert.equal(valueOf(groups, 'outdoor', 'battout'), 0, '1 = OK at Ambient');
  assert.equal(valueOf(groups, 'indoor', 'tempinf'), 21.8);
  assert.equal(valueOf(groups, 'ch1', 'temp1f'), 15);
  assert.equal(valueOf(groups, 'ch1', 'batt1'), 1, '0 = low at Ambient');
  assert.equal(valueOf(groups, 'soil1', 'soiltemp1f'), 13);
  assert.equal(valueOf(groups, 'soil1', 'soilhum1'), 38);
  assert.equal(valueOf(groups, 'soil1', 'battsm1'), 0, 'a numeric string is read');
  // Not measured by this station: no feature.
  assert.equal(valueOf(groups, 'outdoor', 'totalrainin'), undefined);
  assert.equal(valueOf(groups, 'outdoor', '24hourrainin'), undefined);
  // Values Ambient computes itself (feels-like, dew point) are left out.
  assert.equal(valueOf(groups, 'outdoor', 'feelsLike'), undefined);
});

test('imperial only changes the temperatures: wind, rain and pressure keep their unit', () => {
  const groups = sensorsOf(backyard.lastData, { units: 'imperial' });
  const sensor = (field) => groups[0].sensors.find((s) => s.field === field);
  const pair = (field) => [sensor(field).value, sensor(field).unit];
  assert.deepEqual(pair('tempf'), [64.4, 'fahrenheit']);
  assert.deepEqual(pair('windspeedmph'), [9, 'kilometer-per-hour']);
  assert.deepEqual(pair('dailyrainin'), [7.9, 'mm']);
  assert.deepEqual(pair('baromrelin'), [1016.3, 'hPa']);
  assert.deepEqual(pair('hourlyrainin'), [3, 'millimeter-per-hour']);
  assert.equal(groups[2].sensors[0].unit, 'fahrenheit', 'the extra sensors too');
});

test('the rain of the last 24 hours is a daily amount, humidity a decimal', () => {
  const [group] = sensorsOf({ '24hourrainin': 0.5, humidity: 57.6 });
  const [humidity, rain] = group.sensors;
  assert.deepEqual(
    [rain.field, rain.value, rain.unit],
    ['24hourrainin', 12.7, 'millimeter-per-day'],
  );
  assert.deepEqual([humidity.value, humidity.type], [57.6, 'decimal']);
});

test('a public station only shows its outdoor weather, never batteries nor indoor values', () => {
  const [pier] = stationsOf(fixture('public.json').data, { isPublic: true });
  const groups = sensorsOf(pier.lastData, { isPublic: true });
  assert.deepEqual(
    groups.map((g) => g.key),
    ['outdoor'],
  );
  const fields = groups[0].sensors.map((s) => s.field);
  assert.ok(fields.includes('tempf'));
  assert.ok(!fields.includes('battout'));
  assert.ok(!fields.includes('tempinf'));
});

test('freshness: a reading older than an hour is a station offline', () => {
  assert.equal(isFresh(backyard.lastData, FIXTURE_NOW), true);
  assert.equal(isFresh(cabin.lastData, FIXTURE_NOW), false);
  assert.equal(isFresh({}, FIXTURE_NOW), false);
});

test('the box around a house: longitude first, the house rounded to 2 decimals', () => {
  const box = boxAround(40.71234, -74.00567, 10);
  assert.deepEqual(box, [
    [-74.129, 40.62],
    [-73.891, 40.8],
  ]);
  assert.ok(Math.abs(distanceKm(40.71, -74, 40.8, -74) - 10) < 0.1);
});

test('the public stations nearby: fresh, outdoor, within the radius, nearest first', () => {
  const stations = stationsOf(fixture('public.json').data, { isPublic: true });
  const list = nearbyPublic(stations, {
    ...HOME,
    radiusKm: 10,
    now: FIXTURE_NOW,
    exclude: new Set([backyard.id]),
  });
  assert.deepEqual(
    list.map((s) => s.name),
    ['Hudson Pier', 'Brooklyn Roof', 'Queens Garden'],
  );
  assert.deepEqual(
    list.map((s) => s.distanceKm),
    [1.4, 2.8, 4.8],
  );
});

test('the devices: one per sensor group, stable external ids, accepted by Gladys', async () => {
  const gladys = createFakeGladys({ selector: 'ambient-weather' });
  await gladys.connect();
  const devices = devicesOf(gladys, backyard, { units: 'metric' });
  assert.deepEqual(
    devices.map((d) => [d.name, d.external_id]),
    [
      ['Backyard', 'ext:ambient-weather:station:000ec6aabb01'],
      ['Backyard – indoor', 'ext:ambient-weather:station:000ec6aabb01-indoor'],
      ['Backyard – sensor 1', 'ext:ambient-weather:station:000ec6aabb01-ch1'],
      ['Backyard – soil 1', 'ext:ambient-weather:station:000ec6aabb01-soil1'],
    ],
  );
  const temperature = devices[0].features.find((f) => f.external_id.endsWith(':tempf'));
  assert.equal(temperature.external_id, 'ext:ambient-weather:station:000ec6aabb01:tempf');
  assert.equal(temperature.unit, 'celsius');
  assert.equal(temperature.read_only, true);
  const battery = devices[2].features.find((f) => f.external_id.endsWith(':batt1'));
  assert.equal(battery.category, 'battery-low');
  assert.equal(battery.unit, undefined);
  const soil = devices[3].features.find((f) => f.external_id.endsWith(':soiltemp1f'));
  assert.equal(soil.type, 'probe', 'kept out of the room temperature average');
  // The fake Gladys refuses an unknown category, type or unit like the core.
  await gladys.publishDiscoveredDevices([
    ...devices,
    ...devicesOf(gladys, backyard, { units: 'imperial' }).map((d) => ({
      ...d,
      external_id: `${d.external_id}-imperial`,
    })),
  ]);
});

test('the states follow the unit each feature was created with', async () => {
  const gladys = createFakeGladys({ selector: 'ambient-weather' });
  await gladys.connect();
  const id = (field, suffix = '') => `ext:ambient-weather:station:000ec6aabb01${suffix}:${field}`;
  const created = new Map([
    [id('tempf'), 'fahrenheit'],
    [id('windspeedmph'), 'kilometer-per-hour'],
    [id('battout'), null],
    [id('temp1f', '-ch1'), 'celsius'],
  ]);
  const states = statesOf(gladys, backyard, {
    units: 'metric',
    unitOf: (featureId) => (created.has(featureId) ? created.get(featureId) : undefined),
  });
  assert.deepEqual(states, [
    { device_feature_external_id: id('tempf'), state: 64.4 },
    { device_feature_external_id: id('windspeedmph'), state: 9 },
    { device_feature_external_id: id('battout'), state: 0 },
    { device_feature_external_id: id('temp1f', '-ch1'), state: 15 },
  ]);
  // Without a filter, every sensor of the reading.
  assert.equal(statesOf(gladys, backyard, { units: 'metric' }).length, 28);
});
