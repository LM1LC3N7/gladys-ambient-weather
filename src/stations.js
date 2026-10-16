// -----------------------------------------------------------------------------
// Ambient answers -> plain station objects, and the Gladys devices and states
// built from them. Pure: `now` is a parameter.
//
//   REST    GET /v1/devices           [{ macAddress, lastData, info }]
//   socket  "subscribed"              { devices: [{ macAddress, lastData, info }] }
//   socket  "data"                    { macAddress, dateutc, tempf, ... }
//   public  GET lightning.../devices  { data: [{ macAddress, lastData, info }] }
// -----------------------------------------------------------------------------

import { DEVICE_TYPES, STALE_MAX } from './constants.js';
import { num, sensorsOf } from './sensors.js';

/** "F8:B3:B7:83:6A:37" -> "f8b3b7836a37": the platform id of a station. */
export function macId(mac) {
  const id = String(mac ?? '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
  return id.length === 12 ? id : null;
}

/** Great-circle distance in km. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * The box around a point the public endpoint takes: `[[west, south], [east,
 * north]]`, longitude first. The point is rounded to 2 decimals (about 1 km)
 * before it leaves Gladys.
 */
export function boxAround(latitude, longitude, radiusKm) {
  const lat = Math.round(latitude * 100) / 100;
  const lon = Math.round(longitude * 100) / 100;
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  const r = (v) => Math.round(v * 1000) / 1000;
  return [
    [r(lon - dLon), r(Math.max(-90, lat - dLat))],
    [r(lon + dLon), r(Math.min(90, lat + dLat))],
  ];
}

/** One station of any answer; undefined without a valid MAC address. */
export function stationOf(raw, { isPublic = false } = {}) {
  const id = macId(raw?.macAddress);
  if (!id) {
    return undefined;
  }
  const coords = raw.info?.coords?.coords ?? {};
  const name = String(raw.info?.name ?? '').trim();
  return {
    id,
    name: name || `Ambient Weather ${id.slice(-6).toUpperCase()}`,
    latitude: num(coords.lat),
    longitude: num(coords.lon),
    indoor: raw.info?.indoor === true,
    isPublic,
    lastData: raw.lastData ?? {},
  };
}

/** The stations of a REST or "subscribed" answer. */
export const stationsOf = (list, options) =>
  (Array.isArray(list) ? list : []).map((raw) => stationOf(raw, options)).filter(Boolean);

/** The time of a reading (ms), or NaN. */
export const readingTime = (lastData) => num(lastData?.dateutc) ?? NaN;

/** A reading recent enough to be published. */
export const isFresh = (lastData, now) => {
  const t = readingTime(lastData);
  return Number.isFinite(t) && now - t <= STALE_MAX;
};

/**
 * The public stations around a house, nearest first: outdoor stations with a
 * fresh reading and a temperature, within the radius (the box is a square),
 * none of the account's own.
 */
export function nearbyPublic(
  stations,
  { latitude, longitude, radiusKm, now, exclude = new Set() },
) {
  return stations
    .filter(
      (s) =>
        !s.indoor &&
        !exclude.has(s.id) &&
        s.latitude !== null &&
        s.longitude !== null &&
        num(s.lastData.tempf) !== null &&
        isFresh(s.lastData, now),
    )
    .map((s) => ({
      ...s,
      distanceKm: Math.round(distanceKm(latitude, longitude, s.latitude, s.longitude) * 10) / 10,
    }))
    .filter((s) => s.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
}

// --- Gladys devices and states ---------------------------------------------------

const idsOf = (gladys, station, group) =>
  gladys.externalIds(
    station.isPublic ? DEVICE_TYPES.PUBLIC : DEVICE_TYPES.STATION,
    group.suffix ? `${station.id}-${group.suffix}` : station.id,
  );

const deviceName = (station, group) => {
  const base = station.isPublic ? `${station.name} (Ambient Weather Network)` : station.name;
  return group.label ? `${base} – ${group.label}` : base;
};

/** The Gladys devices of a station: one per sensor group it reports. */
export function devicesOf(gladys, station, { units }) {
  return sensorsOf(station.lastData, { units, isPublic: station.isPublic }).map((group) => {
    const ids = idsOf(gladys, station, group);
    return {
      name: deviceName(station, group),
      external_id: ids.device,
      // The integration reads Ambient at its own pace (and gets the realtime
      // pushes): Gladys has nothing to poll.
      should_poll: false,
      features: group.sensors.map((sensor) => ({
        name: sensor.name,
        external_id: ids.feature(sensor.field),
        category: sensor.category,
        type: sensor.type,
        ...(sensor.unit ? { unit: sensor.unit } : {}),
        min: sensor.min,
        max: sensor.max,
        read_only: true,
        has_feedback: false,
        keep_history: true,
      })),
    };
  });
}

const sensorMap = (gladys, station, units) =>
  new Map(
    sensorsOf(station.lastData, { units, isPublic: station.isPublic }).flatMap((group) => {
      const ids = idsOf(gladys, station, group);
      return group.sensors.map((sensor) => [ids.feature(sensor.field), sensor]);
    }),
  );

/**
 * The states of a reading, for the publishStates format.
 *
 * `unitOf(featureExternalId)` tells the unit of the feature as Gladys created
 * it (`undefined`: not created, skipped; omitted: every feature). A feature
 * keeps the unit it was created with, even after the user switched the unit
 * system: its value is sent in that unit, never in the other one.
 */
export function statesOf(gladys, station, { units, unitOf }) {
  const preferred = sensorMap(gladys, station, units);
  const other = sensorMap(gladys, station, units === 'imperial' ? 'metric' : 'imperial');
  const states = [];
  for (const [id, sensor] of preferred) {
    const unit = unitOf ? unitOf(id) : (sensor.unit ?? null);
    if (unit === undefined) {
      continue;
    }
    const chosen =
      unit !== null && unit !== sensor.unit && other.get(id)?.unit === unit
        ? other.get(id)
        : sensor;
    states.push({ device_feature_external_id: id, state: chosen.value });
  }
  return states;
}
