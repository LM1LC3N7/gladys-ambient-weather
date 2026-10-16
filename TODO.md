# TODO

## Before announcing

- [ ] Test on a real Gladys 5.1+ with a real Ambient account: the devices of
      the Discovery tab, their values, the realtime pushes, the test button.
- [ ] Check the CI (Docker build, Node 22 and 24), then run the store
      validator once the image is published.
- [ ] Turn on "Private vulnerability reporting" (SECURITY.md points there).
- [ ] Add the `gladys-assistant-integration` topic to publish in the store.

## To confirm

- [ ] The realtime server speaks Engine.IO v4 (`EIO=4`, as python-socketio 5
      in aioambient does): never tried with a real Application key. If it
      only speaks v3, the client must ping itself.
- [ ] The answer of the REST API and of the realtime API to refused keys (401
      or 403? an `invalidApiKeys` list in `subscribed`?): handled both ways.
- [ ] The battery fields: 1 = OK, 0 = low for `battout`, `battin`, `battN`,
      `battrain`, `battsmN` per the documentation (Meteobridge reverses it).
- [ ] The public endpoint `lightning.ambientweather.net/devices?$publicBox`:
      checked once on 2026-10-16 (200, `{ data: [...] }`, no account, about
      10 KB per station). Undocumented: watch for changes, and whether it
      accepts `$select` to make the answer lighter.
- [ ] Gladys shows `angle-sensor` (wind direction) and the precipitation
      totals in `mm`/`inch` well on the dashboard.

## Decisions

- **Device type, not weather type**: a station is a set of sensors that
  belong in rooms, history and scenes; the weather providers of Gladys
  (forecasts) are another integration's job.
- **One device per sensor group** (outdoor, indoor, extra channels, soil
  probes), so each can sit in its own room; external ids from the MAC
  address and the Ambient field name, never a label.
- **No runtime dependency**: the realtime client is a small Socket.IO v5
  client over Node's built-in WebSocket rather than socket.io-client.
- **aioambient (MIT) as the reference**, not copied: Python, so the same
  endpoints and protocol are re-implemented in JavaScript and credited.
- **Feels-like and dew point left out**: Ambient computes them, and as
  `temperature-sensor` features they would skew the room temperature of
  Gladys.
- **Units Gladys lacks**: pressure always in hPa (no inHg), rain rate always
  in mm/h (no in/h), solar radiation in lux (no W/m², factor 1/0.0079 as Home
  Assistant).
- **States in the created unit**: a feature keeps the unit it was created
  with; switching the unit system never sends °C into a °F feature.
- **Public stations off by default**: turning them on sends the houses'
  location (rounded to 2 decimals) to Ambient; outdoor values only, no
  battery, never the owner's indoor data.
- **Pacing**: one pacer for the REST host (1.1 s between calls, the 1
  request/s per API key limit), one for the public host; 429 surfaces as a
  status and the next read retries.

## Ideas

- PM2.5, CO2, leak sensors, lightning detector (`pm25`, `co2_in_aqin`,
  `leakN`, `lightning_day`, `lightning_distance`).
- Scene triggers (rain started, gust above a threshold) and a dashboard
  widget once the devices are proven.
- Backfill a gap after an outage from `GET /v1/devices/<mac>?endDate=`.
