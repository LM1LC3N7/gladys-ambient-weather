# gladys-ambient-weather

[Gladys Assistant](https://gladysassistant.com) external integration for
[Ambient Weather](https://ambientweather.net) stations: the sensors of the
stations of your account (official REST API, realtime pushes) and, as an
option, the public stations of the Ambient Weather Network around your
houses. **Unofficial, not affiliated with Ambient Weather.**

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

## How it works

```
Gladys ⇄ SDK ⇄ src/app.js (AmbientApp)
                 ├─ src/ambient.js   REST GET /v1/devices, public map box (paced)
                 ├─ src/pacer.js     one call at a time, 1.1 s apart (1 req/s per key)
                 ├─ src/realtime.js  Socket.IO, Engine.IO v4 (v3 fallback), Node's WebSocket
                 ├─ src/stations.js  answers -> stations, devices, states (pure)
                 └─ src/sensors.js   the Ambient fields, units and conversions (pure)
```

- **Account**: `GET https://rt.ambientweather.net/v1/devices?applicationKey&apiKey`
  every few minutes (option), plus the realtime link
  (`wss://rt2.ambientweather.net/socket.io/?api=1&applicationKey`, then
  `subscribe {apiKeys}`): every `data` event updates its station at once.
- **Devices**: one per sensor group a station reports (outdoor, indoor,
  extra sensors 1–10, soil probes 1–10), external ids
  `station:<mac>[-indoor|-chN|-soilN]:<ambient field>`; public stations are
  `public:<mac>:<field>`, outdoor values only.
- **States**: only for created features, only what changed (heartbeat 30
  min), never a reading older than an hour, in the unit each feature was
  created with.
- **Public stations**: `GET https://lightning.ambientweather.net/devices?$publicBox…`
  (the ambientweather.net map, undocumented, no account), a box around each
  located house rounded to 2 decimals.

No runtime dependency besides the Gladys SDK: the realtime client uses the
WebSocket built into Node.js 22+.

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npm run audit                                   # npm audit --omit=dev
npx github:GladysAssistant/integration-store .  # store admission checks
```

The fixtures in `test/fixtures/` are example answers shaped after the
official documentation and one real answer of the public endpoint
(2026-10-16), anonymized.

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags,
builds the multi-arch image to GHCR and publishes the GitHub Release.

## Credits

- [Ambient Weather API documentation](https://ambientweather.docs.apiary.io/)
  (official): endpoints, device data fields, rate limits.
- [aioambient](https://github.com/bachya/aioambient) (MIT, Aaron Bach): the
  Python client of Home Assistant's Ambient integrations, followed for the
  realtime protocol and the public stations (its `OpenAPI`). No code is
  copied: this is a JavaScript port of the same approach.

## License

Apache-2.0. Ambient Weather is a trademark of its owner.
