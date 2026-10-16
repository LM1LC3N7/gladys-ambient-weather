# TODO

## Before announcing

- [ ] Test on a real Gladys 5.1+ with a real Ambient account: the devices of
      the Discovery tab, their values, the realtime pushes, the test button.
- [ ] Check the CI (Docker build, Node 22 and 24), then run the store
      validator once the image is published.
- [ ] Turn on "Private vulnerability reporting" (SECURITY.md points there).
- [ ] Add the `gladys-assistant-integration` topic to publish in the store.

## To confirm

- [ ] Which Engine.IO version the realtime server speaks: v4 first (as
      python-socketio 5 in aioambient), v3 after three failed handshakes (as
      the official npm client); never tried with a real Application key.
- [ ] The answer of `GET lightning.ambientweather.net/devices/<mac>` (one
      station, `{ data }` or a list?): all three shapes are read; not tried.
- [ ] The answer of the REST API and of the realtime API to refused keys (401
      or 403? an `invalidApiKeys` list in `subscribed`?): handled both ways.
- [ ] The battery fields: 1 = OK, 0 = low for `battout`, `battin`, `battN`,
      `battrain`, `battsmN` per the documentation (Meteobridge reverses it).
- [ ] The public endpoint `lightning.ambientweather.net/devices?$publicBox`:
      checked once on 2026-10-16 (200, `{ data: [...] }`, no account, about
      10 KB per station). Undocumented: watch for changes, and whether it
      accepts `$select` to make the answer lighter.
- [ ] Gladys shows `angle-sensor` (wind direction, absent from the core's
      unit list) and the 24-hour rain in `millimeter-per-day` well.

## Decisions

- **Device type, not weather type**: a station is a set of sensors that
  belong in rooms, history and scenes; the weather providers of Gladys
  (forecasts) are another integration's job.
- **One device per sensor group** (outdoor, indoor, extra channels, soil
  probes), so each can sit in its own room; external ids from the MAC
  address and the Ambient field name, never a label.
- **No runtime dependency**: the realtime client is a small Socket.IO client
  (v5 and v2) over Node's built-in WebSocket rather than socket.io-client.
- **aioambient (MIT) as the reference**, not copied: Python, so the same
  endpoints and protocol are re-implemented in JavaScript and credited.
- **Feels-like and dew point left out**: Ambient computes them, and as
  `temperature-sensor` features they would skew the room temperature of
  Gladys.
- **Rain totals stay in plain `mm`** on `precipitation-sensor` although the
  core lists only mm/h, mm/day and mV for that category: the core's own
  Netatmo integration does the same
  (`buildFeatureRain(..., DEVICE_FEATURE_UNITS.MM)`); coordinator decision,
  2026-10-16.
- **Units (review decision)**: the unit system only changes the
  temperatures (°C or °F). Wind is always in km/h, rain totals in mm, the
  rain rate in mm/h, `24hourrainin` in mm per day (a daily amount), pressure
  in hPa. The reason: the core (`DEVICE_FEATURE_UNITS_BY_CATEGORY` in
  `server/utils/constants.js`) accepts only m/s and km/h for `speed-sensor`
  and only mm/h and mm/day for `precipitation-sensor` (no mph, no inches;
  plain `mm` kept for the totals, see above), and has no inHg; one unit per
  quantity also keeps charts and scene thresholds consistent. Solar
  radiation in lux (no W/m², factor 1/0.0079 ≈ 126.6 as Home Assistant).
  Humidity and soil moisture are decimal sensors.
- **States in the created unit**: a feature keeps the unit it was created
  with; switching the unit system never sends °C into a °F feature.
- **Public stations off by default**: turning them on sends the houses'
  location (rounded to 2 decimals) to Ambient; outdoor values only, no
  battery, never the owner's indoor data.
- **Pacing**: one pacer for the REST host (1.1 s between calls, the 1
  request/s per API key limit), one for the public host. A 429 waits its
  Retry-After (1 minute without it); refused keys are read again every 30
  minutes until the configuration changes (the test button may force one).
- **Public stations**: 100 per box; the created ones the box misses are read
  by MAC (`/devices/<mac>`, aioambient's `get_device_details`), one at a
  time.
- **Realtime robustness**: 30 s handshake timeout, Engine.IO v3 fallback after
  three failed v4 handshakes (v3: the client pings), retry delay ±20 % and
  reset only after 60 s of stable link. The status and the test button say
  when realtime is refused or down for more than 10 minutes.
- **States budget**: at most 250 states per minute from the integration (the
  core takes 300); the rest waits in a backlog, newest value per feature.
- **A reading without a valid `dateutc`** never replaces a known one.

## Ideas

- PM2.5, CO2, leak sensors, lightning detector (`pm25`, `co2_in_aqin`,
  `leakN`, `lightning_day`, `lightning_distance`).
- Scene triggers (rain started, gust above a threshold) and a dashboard
  widget once the devices are proven.
- Backfill a gap after an outage from `GET /v1/devices/<mac>?endDate=`.
