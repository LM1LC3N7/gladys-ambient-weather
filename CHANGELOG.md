# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- The stations of your Ambient Weather account in Gladys, with an API key and
  an Application key: temperature, humidity, relative and absolute pressure,
  wind speed, gust, max daily gust, wind direction (and 10-minute averages),
  rain rate, rain event, daily, 24-hour, weekly, monthly, yearly and total
  rain, UV index, solar radiation (in lux), and the low batteries. One device
  per sensor group: outdoor, indoor console, extra sensors 1 to 10, soil
  probes 1 to 10. Only the sensors a station reports are created.
- Realtime updates through the official realtime API (on by default), on top
  of a periodic read (every 5 minutes by default), with a fallback to the
  older protocol version and a reconnection that never hammers the server.
- Temperatures in °C or °F; wind always in km/h, rain in mm (mm/h for the
  rate, mm per day for the last 24 hours), pressure in hPa. A device keeps
  the unit it was created with.
- The public stations of the Ambient Weather Network around the located
  houses, without account (off by default): the nearest ones within a radius
  are offered in the Discovery tab, outdoor values only; the created ones
  keep updating even when the search no longer returns them.
- Never more than 1 request per second to Ambient Weather, refused keys read
  again only every 30 minutes, the Retry-After of a 429 respected; only the
  changed values sent to Gladys, at most 250 per minute, no reading older
  than an hour.
- A connection status that also tells when realtime is refused or down, and
  when the public stations are unavailable.
- "Test Ambient Weather" button: the stations of the account, the realtime
  link and the public stations nearby, with their last reading.

[Unreleased]: https://github.com/LM1LC3N7/gladys-ambient-weather/commits/main
