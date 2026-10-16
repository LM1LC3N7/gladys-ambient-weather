// -----------------------------------------------------------------------------
// What an Ambient Weather station measures, and how it lands in Gladys. Pure.
//
// Every field name of the Ambient data ("Device Data Specs" of the official
// ambient-api documentation, the same table aioambient and Home Assistant
// use) lives here. Ambient sends imperial values (°F, inHg, mph, in, W/m²);
// they are converted once, here.
//
// The feature key of a sensor is its Ambient field name (`tempf`,
// `dailyrainin`...): it is part of the external id, so it never changes,
// whatever the unit shown.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CAT,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

/** A finite number, or null: Ambient sometimes sends numbers as strings. */
export const num = (value) =>
  value === null || value === undefined || value === '' || !Number.isFinite(Number(value))
    ? null
    : Number(value);

// --- Kinds: Gladys category, type, unit, bounds and conversion -----------------

const metric = (units) => units !== 'imperial';

const KINDS = {
  temperature: (units, type = TYPES.SENSOR.DECIMAL) => ({
    category: CAT.TEMPERATURE_SENSOR,
    type,
    unit: metric(units) ? UNITS.CELSIUS : UNITS.FAHRENHEIT,
    min: metric(units) ? -60 : -76,
    max: metric(units) ? 70 : 158,
    convert: (f) => (metric(units) ? round(((f - 32) * 5) / 9, 1) : round(f, 1)),
  }),
  // A probe in the ground: kept out of the room temperature average of Gladys.
  soilTemperature: (units) => KINDS.temperature(units, TYPES.TEMPERATURE_SENSOR.PROBE),
  humidity: () => ({
    category: CAT.HUMIDITY_SENSOR,
    type: TYPES.SENSOR.INTEGER,
    unit: UNITS.PERCENT,
    min: 0,
    max: 100,
    convert: (v) => Math.round(v),
  }),
  soilMoisture: () => ({ ...KINDS.humidity(), category: CAT.SOIL_MOISTURE_SENSOR }),
  // Gladys has no inHg unit: the pressure is in hPa in both unit systems.
  pressure: () => ({
    category: CAT.PRESSURE_SENSOR,
    type: TYPES.SENSOR.DECIMAL,
    unit: UNITS.HECTO_PASCAL,
    min: 500,
    max: 1100,
    convert: (inHg) => round(inHg * 33.8639, 1),
  }),
  wind: (units) => ({
    category: CAT.SPEED_SENSOR,
    type: TYPES.SPEED_SENSOR.DECIMAL,
    unit: metric(units) ? UNITS.KILOMETER_PER_HOUR : UNITS.MILE_PER_HOUR,
    min: 0,
    max: metric(units) ? 400 : 250,
    convert: (mph) => (metric(units) ? round(mph * 1.609344, 1) : round(mph, 1)),
  }),
  direction: () => ({
    category: CAT.ANGLE_SENSOR,
    type: TYPES.SENSOR.INTEGER,
    unit: UNITS.DEGREE,
    min: 0,
    max: 360,
    convert: (v) => Math.round(v),
  }),
  // Gladys has no in/h unit: the rain rate is in mm/h in both unit systems.
  rainRate: () => ({
    category: CAT.PRECIPITATION_SENSOR,
    type: TYPES.PRECIPITATION_SENSOR.DECIMAL,
    unit: UNITS.MILLIMETER_PER_HOUR,
    min: 0,
    max: 1000,
    convert: (inches) => round(inches * 25.4, 1),
  }),
  rain: (units) => ({
    category: CAT.PRECIPITATION_SENSOR,
    type: TYPES.PRECIPITATION_SENSOR.DECIMAL,
    unit: metric(units) ? UNITS.MM : UNITS.INCH,
    min: 0,
    max: metric(units) ? 100_000 : 4_000,
    convert: (inches) => (metric(units) ? round(inches * 25.4, 1) : round(inches, 2)),
  }),
  uv: () => ({
    category: CAT.UV_SENSOR,
    type: TYPES.UV_SENSOR.INTEGER,
    unit: UNITS.UV_INDEX,
    min: 0,
    max: 20,
    convert: (v) => Math.round(v),
  }),
  // Gladys has no W/m² unit: the solar radiation is shown in lux, with the
  // usual daylight approximation (1 W/m² ≈ 126.7 lx, the factor Home
  // Assistant's Ambient integration applies).
  solar: () => ({
    category: CAT.LIGHT_SENSOR,
    type: TYPES.SENSOR.INTEGER,
    unit: UNITS.LUX,
    min: 0,
    max: 250_000,
    convert: (wm2) => Math.round(wm2 / 0.0079),
  }),
  // Ambient: 1 = OK, 0 = low. Gladys: 1 = low.
  batteryLow: () => ({
    category: CAT.BATTERY_LOW,
    type: TYPES.BATTERY_LOW.BINARY,
    min: 0,
    max: 1,
    convert: (v) => (v === 0 ? 1 : 0),
  }),
};

// --- The sensors, by device ----------------------------------------------------

/**
 * One Gladys device per physical sensor group, so each can sit in its own
 * room: the outdoor array, the indoor console, the extra temperature and
 * humidity sensors (channels 1 to 10), the soil probes (1 to 10).
 */
const OUTDOOR = [
  ['tempf', 'temperature', 'Temperature'],
  ['humidity', 'humidity', 'Humidity'],
  ['baromrelin', 'pressure', 'Pressure (relative)'],
  ['baromabsin', 'pressure', 'Pressure (absolute)'],
  ['windspeedmph', 'wind', 'Wind speed'],
  ['windgustmph', 'wind', 'Wind gust'],
  ['maxdailygust', 'wind', 'Max gust today'],
  ['windspdmph_avg10m', 'wind', 'Wind speed (10 min average)'],
  ['winddir', 'direction', 'Wind direction'],
  ['winddir_avg10m', 'direction', 'Wind direction (10 min average)'],
  ['hourlyrainin', 'rainRate', 'Rain rate'],
  ['eventrainin', 'rain', 'Rain (event)'],
  ['dailyrainin', 'rain', 'Rain today'],
  ['24hourrainin', 'rain', 'Rain (24 h)'],
  ['weeklyrainin', 'rain', 'Rain this week'],
  ['monthlyrainin', 'rain', 'Rain this month'],
  ['yearlyrainin', 'rain', 'Rain this year'],
  ['totalrainin', 'rain', 'Rain (total)'],
  ['uv', 'uv', 'UV index'],
  ['solarradiation', 'solar', 'Solar radiation'],
  ['battout', 'batteryLow', 'Battery low (outdoor sensor)'],
  ['battrain', 'batteryLow', 'Battery low (rain gauge)'],
];

const INDOOR = [
  ['tempinf', 'temperature', 'Temperature'],
  ['humidityin', 'humidity', 'Humidity'],
  ['battin', 'batteryLow', 'Battery low'],
];

const CHANNELS = Array.from({ length: 10 }, (_, i) => i + 1);

export const GROUPS = [
  { key: 'outdoor', suffix: '', label: '', sensors: OUTDOOR },
  { key: 'indoor', suffix: 'indoor', label: 'indoor', sensors: INDOOR },
  ...CHANNELS.map((n) => ({
    key: `ch${n}`,
    suffix: `ch${n}`,
    label: `sensor ${n}`,
    sensors: [
      [`temp${n}f`, 'temperature', 'Temperature'],
      [`humidity${n}`, 'humidity', 'Humidity'],
      [`batt${n}`, 'batteryLow', 'Battery low'],
    ],
  })),
  ...CHANNELS.map((n) => ({
    key: `soil${n}`,
    suffix: `soil${n}`,
    label: `soil ${n}`,
    sensors: [
      [`soiltemp${n}f`, 'soilTemperature', 'Soil temperature'],
      [`soilhum${n}`, 'soilMoisture', 'Soil moisture'],
      [`battsm${n}`, 'batteryLow', 'Battery low'],
    ],
  })),
];

/**
 * The groups and sensors a reading holds, ready to publish: a sensor absent
 * from the reading (not wired, not sold with the station) is left out.
 * A public station of someone else only shows its outdoor weather: never
 * its indoor values nor its batteries.
 */
export function sensorsOf(lastData, { units = 'metric', isPublic = false } = {}) {
  const groups = [];
  for (const group of GROUPS) {
    if (isPublic && group.key !== 'outdoor') {
      continue;
    }
    const sensors = [];
    for (const [field, kindName, name] of group.sensors) {
      if (isPublic && kindName === 'batteryLow') {
        continue;
      }
      const raw = num(lastData?.[field]);
      if (raw === null) {
        continue;
      }
      const kind = KINDS[kindName](units);
      sensors.push({ field, name, kind: kindName, ...kind, value: kind.convert(raw) });
    }
    if (sensors.length > 0) {
      groups.push({ ...group, sensors });
    }
  }
  return groups;
}
