// -----------------------------------------------------------------------------
// The configuration the user fills (manifest `config_schema`), normalized so
// the rest of the code never deals with strings or `undefined`.
// -----------------------------------------------------------------------------

import { UNIT_SYSTEMS } from './constants.js';

// Defaults: they MUST match the `default` values of the manifest
// (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  units: 'metric',
  poll_interval: 5,
  realtime: true,
  public_stations: false,
  public_radius_km: 10,
  public_max_stations: 3,
  public_poll_interval: 10,
};

const number = (value, fallback, min, max) => {
  const n = Number(value);
  return value !== '' && value !== null && value !== undefined && Number.isFinite(n)
    ? Math.min(max, Math.max(min, Math.round(n)))
    : fallback;
};

const flag = (value, fallback) =>
  value === undefined || value === null || value === ''
    ? fallback
    : value === true || value === 'true';

const key = (value) => String(value ?? '').trim();

export function normalizeConfig(raw = {}) {
  const units = String(raw.units ?? DEFAULT_CONFIG.units).toLowerCase();
  return {
    apiKey: key(raw.api_key),
    applicationKey: key(raw.application_key),
    units: UNIT_SYSTEMS.includes(units) ? units : DEFAULT_CONFIG.units,
    // A station uploads every minute at best: faster reads are useless.
    pollMinutes: number(raw.poll_interval, DEFAULT_CONFIG.poll_interval, 1, 60),
    realtime: flag(raw.realtime, DEFAULT_CONFIG.realtime),
    publicStations: flag(raw.public_stations, DEFAULT_CONFIG.public_stations),
    publicRadiusKm: number(raw.public_radius_km, DEFAULT_CONFIG.public_radius_km, 1, 50),
    publicMaxStations: number(raw.public_max_stations, DEFAULT_CONFIG.public_max_stations, 1, 10),
    publicPollMinutes: number(raw.public_poll_interval, DEFAULT_CONFIG.public_poll_interval, 5, 60),
  };
}

/** Both keys are needed for the stations of the account. */
export const hasAccount = (config) => Boolean(config.apiKey && config.applicationKey);
