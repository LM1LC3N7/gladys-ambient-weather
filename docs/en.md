# Ambient Weather

**Unofficial connector, not affiliated with Ambient Weather.** It brings the
sensors of your [Ambient Weather](https://ambientweather.net) stations into
Gladys, read through the official Ambient Weather API (REST and realtime).
Optionally, it also offers the **public stations of the Ambient Weather
Network** around your houses, without any account.

## What you get

| Device in Gladys          | Sensors                                                                                                                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Station** (outdoor)     | temperature, humidity, relative and absolute pressure, wind speed, gust, max gust today, wind direction (and their 10-minute averages), rain rate, rain event / today / 24 h / week / month / year / total, UV index, solar radiation, low battery of the outdoor sensor and of the rain gauge |
| **Station – indoor**      | indoor temperature and humidity, low battery of the console                                                                                                                                                                                                                                    |
| **Station – sensor 1…10** | temperature and humidity of each extra sensor, low battery                                                                                                                                                                                                                                     |
| **Station – soil 1…10**   | soil moisture and soil temperature of each soil probe, low battery                                                                                                                                                                                                                             |
| **Public station**        | the outdoor weather of a public station nearby (no battery, no indoor value)                                                                                                                                                                                                                   |

A station only gets the sensors it reports: nothing is created for a sensor
you do not own. Each group is its own device, so the indoor console and the
outdoor array can sit in different rooms. The solar radiation is shown in
lux (W/m² ÷ 0.0079, the usual daylight approximation): Gladys has no W/m²
unit. Device and sensor names are in English; rename them at creation if
you like.

## Setup

1. On [ambientweather.net](https://ambientweather.net/account/keys), open
   **Account → API Keys** and create:
   - an **API key** (the key of your account),
   - an **Application key** (the developer key; a short description such as
     "Gladys" is enough).
2. Install the integration from the Gladys catalog (Gladys 5.1 or newer) and
   accept the access to the **location of your houses** (only used for the
   public stations, and only when you turn them on).
3. In the **Configuration** screen, paste both keys and save.
4. Click **Test Ambient Weather**: the message lists your stations and their
   last reading.
5. Open the **Discovery** tab and add the devices you want. Their values
   arrive as soon as they are created.

Public stations only? Leave both keys empty and turn on **Public stations
nearby**.

## Configuration

- **API key**, **Application key**: both needed for the stations of your
  account. They are stored as secrets and never written in the logs.
- **Units** (metric by default): metric is °C, km/h, mm; imperial is °F, mph,
  inches. The pressure is always in hPa and the rain rate in mm/h: Gladys has
  no inHg nor in/h unit. A device keeps the units it was created with: after
  a switch, its values are still sent in those units; delete and re-create it
  to change them.
- **Account read interval** (5 minutes by default, 1 to 60): one request to
  the API each time.
- **Realtime updates** (on by default): a connection to the realtime API of
  Ambient Weather, so every new reading arrives as soon as the station
  uploads it, between two reads.
- **Public stations nearby** (off by default), **search radius** (10 km),
  **public stations offered per house** (3) and their **read interval**
  (10 minutes, 5 at least).

## How often Ambient Weather is called

- The API allows **1 request per second per API key** (and 3 per second per
  Application key), and answers "429" beyond. The integration never sends
  two requests less than 1.1 s apart, whatever triggers them (the periodic
  read, the Discovery tab, the test button).
- The account: one request every "account read interval", plus one at
  startup and at each test.
- The realtime link: one connection, kept open, reconnected after 5 s, then
  10 s, 20 s… up to 5 minutes.
- The public stations: one request per located house every "read interval".

Only the values that changed are sent to Gladys (plus every unchanged value
every 30 minutes), far below the 300 states per minute Gladys accepts. A
reading more than an hour old (a station offline) is not sent.

## Public stations

The public stations are those the owners chose to share on the Ambient
Weather Network map. They are searched in a square around each located
house (Settings → Houses), then filtered: within the radius, outdoor, a
reading of less than an hour, a temperature, not one of your own stations.
The nearest ones are offered in the Discovery tab; those you create keep
their values as long as they stay within the radius.

The public map service is **not a documented API**: Ambient Weather may
change it without notice. It is the one the ambientweather.net map uses, and
the one aioambient and Home Assistant's "Ambient Weather Network"
integration read.

## Troubleshooting

- **"Ambient Weather refused the keys"**: check both keys on the API Keys
  page (an Application key is not an API key).
- **"Ambient Weather asks to slow down (429)"**: another tool uses the same
  API key at the same time; the next read retries by itself.
- **A device shows no value**: the station did not upload for more than an
  hour, or the sensor is not reported by the API.
- **No public station**: the house needs a location in Gladys, and the
  network is sparse outside North America: try a larger radius.
- Logs: the log level is set with the `LOG_LEVEL` variable.

## Privacy

With the public stations off (the default), no location leaves Gladys. On,
the coordinates of each house, rounded to 2 decimals (about 1 km), are sent
to Ambient Weather as a search box. The keys travel only to Ambient Weather,
over HTTPS.

## Credits

Built after the official
[Ambient Weather API documentation](https://ambientweather.docs.apiary.io/)
and [aioambient](https://github.com/bachya/aioambient) (MIT, Aaron Bach), the
Python client Home Assistant uses: endpoints, field names, rate limits,
realtime protocol, public stations. Ambient Weather is a trademark of its
owner; this connector is free and unofficial.
