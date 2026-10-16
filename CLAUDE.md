# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** of type `device`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
(v0.15), its only runtime dependency. It publishes the sensors of
**Ambient Weather** stations: those of the user's account (official REST API
plus the official realtime Socket.IO API, an API key and an Application key)
and, as an option, the public stations of the Ambient Weather Network around
the located houses (the ambientweather.net map endpoint, no account).
Unofficial: not affiliated with Ambient Weather. Reference: the official
ambient-api documentation and aioambient (MIT, bachya), credited, not copied.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/app.test.js              # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npm run audit                             # npm audit --omit=dev
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` and `audit` before every commit.

## Architecture

```
index.js           SDK wiring only (handlers registered before connect())
src/app.js         AmbientApp: account reads, realtime, public stations,
                   discovery, states, status, test button
src/ambient.js     the client: GET /v1/devices, the public box (paced)
src/pacer.js       one call at a time, a minimum gap apart
src/realtime.js    Socket.IO client (Engine.IO v4, v3 fallback) over Node's WebSocket
src/stations.js    answers -> stations, nearby public ones, devices, states (pure)
src/sensors.js     the Ambient fields -> Gladys category/type/unit, conversions (pure)
src/config.js      DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/constants.js   endpoints, pacing, device types, action keys
src/i18n.js        runtime texts (en/fr)
src/http.js        the only HTTP access (fetch, timeout, User-Agent, no URL query in errors)
test/fixtures/     example answers (REST, public), anonymized
test/helpers/      fake fetch, fake timers, fake WebSocket; Gladys is the SDK's fake
```

## What is known of the Ambient data

- **REST** `GET https://rt.ambientweather.net/v1/devices?applicationKey=&apiKey=`:
  `[{ macAddress, lastData, info: { name, coords: { coords: { lat, lon } } } }]`.
  **1 request per second per API key**, 3 per Application key, 429 beyond:
  every REST call goes through the pacer (1.1 s).
- **Realtime** `wss://rt2.ambientweather.net/socket.io/?api=1&applicationKey=&EIO=4&transport=websocket`,
  then `42["subscribe",{"apiKeys":[...]}]`; events `subscribed`
  (`{ devices }`) and `data` (a full reading with `macAddress`). `EIO=3`
  after three failed handshakes (the client then pings); 30 s handshake
  timeout, retry 5 s → 5 min ±20 %, reset after 60 s of stable link.
- **Units in Gladys**: only temperatures follow the unit system; wind km/h,
  rain mm (rate mm/h, 24 h mm per day), pressure hPa, solar radiation lux.
- **Values are imperial**: °F, inHg, mph, inches, W/m²; `dateutc` in ms.
  Batteries: 1 = OK, 0 = low. Numbers sometimes arrive as strings.
- **Public map** `GET https://lightning.ambientweather.net/devices?$publicBox[0][0]=west&[0][1]=south&[1][0]=east&[1][1]=north&$limit=100`:
  `{ data: [...] }`, same station shape plus `info.indoor`; undocumented,
  checked once on 2026-10-16. Stale stations (years old) are listed too.
  A created public station the box misses is read by `GET .../devices/<MAC>`.
- **Gladys budget**: at most 250 states per minute from the app (backlog
  beyond); refused keys read every 30 min; a 429 waits its Retry-After.

## Rules

- **External ids are forever**: `station:<mac>[-indoor|-chN|-soilN]` and
  `public:<mac>`, feature key = the Ambient field name (`tempf`,
  `dailyrainin`). Never a label, never renamed. Same for the manifest keys.
- **Never log or show a key**: the keys travel in query strings, so errors
  carry only the URL path (`src/http.js`), and `AmbientApp.scrub` removes them
  from any message.
- **Be polite**: the pacer for every call, no reading faster than the
  options allow (account ≥ 1 min, public ≥ 5 min), realtime backoff 5 s → 5
  min.
- **States**: only created features, `publishChangedStates` with a 30-minute
  heartbeat, never a reading older than an hour, in the unit the feature was
  created with.
- **Public stations**: off by default (they send the houses' location,
  rounded to 2 decimals), outdoor values only, no battery.
- **The container rootfs is read-only**: write nothing on disk.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag,
  by hand. `test/manifest.test.js` checks they agree.
- **Changelog**: every user-visible change adds a line under
  `## [Unreleased]` in `CHANGELOG.md`. Never write a version heading.
- **Manifest** texts are `{ en, fr }` objects; the catalog description holds
  10 to 100 characters per language; `test/manifest.test.js` ties the
  manifest to the code.
- **User-facing text** is bilingual, `docs/en.md` and `docs/fr.md` kept in
  sync. Comments explain why, in English.
- **Tests never touch the network** (`installFetch`, the fake WebSocket).

## CI and pushes

- Group the commits and push **at most once a day**, unless the maintainer
  explicitly asks otherwise: the GitHub Actions quota is limited.
- If every CI job fails in under 2 seconds, the quota is exhausted: it is not
  a bug in the code.
