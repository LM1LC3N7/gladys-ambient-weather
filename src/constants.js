// -----------------------------------------------------------------------------
// Endpoints, pacing and the keys users store (manifest keys, device types):
// the keys are forever, never rename them.
// -----------------------------------------------------------------------------

/** The official REST API (ambient-api docs): `GET /v1/devices`. */
export const REST_URL = 'https://rt.ambientweather.net/v1';

/** The official realtime API: Socket.IO, `?api=1&applicationKey=...`. */
export const REALTIME_URL = 'wss://rt2.ambientweather.net/socket.io/';

/**
 * The public stations of the Ambient Weather Network, as the ambientweather.net
 * map reads them (no account). Undocumented: the same endpoint aioambient's
 * OpenAPI and Home Assistant's "Ambient Weather Network" integration use.
 */
export const PUBLIC_URL = 'https://lightning.ambientweather.net/devices';

export const USER_AGENT =
  'gladys-ambient-weather (+https://github.com/LM1LC3N7/gladys-ambient-weather)';

/** One HTTP call, well under the 15 s Gladys waits for an action. */
export const HTTP_TIMEOUT = 10_000;

/**
 * Ambient caps the API at 1 request per second per API key (3 per second per
 * Application key) and answers 429 beyond: every REST call waits its turn,
 * with a margin for the clock of their side.
 */
export const REST_MIN_GAP = 1_100;

/** The public endpoint gets the same pace, out of politeness. */
export const PUBLIC_MIN_GAP = 1_100;

/** At most this many public stations are read around a house. */
export const PUBLIC_LIMIT = 50;

/** A reading older than this is a station offline: never published. */
export const STALE_MAX = 60 * 60_000;

/** An unchanged value is re-sent this often, so Gladys keeps it recent. */
export const HEARTBEAT = 30 * 60_000;

/** Realtime reconnection: 5 s, doubling, up to 5 minutes. */
export const RECONNECT_MIN = 5_000;
export const RECONNECT_MAX = 5 * 60_000;

/** Device types of the external ids (`ext:<selector>:<type>:<id>`). */
export const DEVICE_TYPES = {
  STATION: 'station',
  PUBLIC: 'public',
};

/** Manifest `actions` keys. */
export const ACTIONS = {
  TEST: 'test_connection',
};

export const UNIT_SYSTEMS = ['metric', 'imperial'];
