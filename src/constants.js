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

/**
 * One HTTP call. The test button chains several (the account, each house,
 * the created public stations, 1.1 s apart): its manifest `timeout_seconds`
 * is 60 to leave room for them.
 */
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
export const PUBLIC_LIMIT = 100;

/** Refused keys: the account is read again at most this often. */
export const REFUSED_BACKOFF = 30 * 60_000;

/** A 429 without Retry-After: wait this long before the next read. */
export const LIMITED_BACKOFF = 60_000;

/** The core accepts 300 states per minute: the integration keeps a margin. */
export const STATES_PER_MINUTE = 250;

/** The realtime link counts as durably down after this long. */
export const REALTIME_DOWN_AFTER = 10 * 60_000;

/** A reading older than this is a station offline: never published. */
export const STALE_MAX = 60 * 60_000;

/** An unchanged value is re-sent this often, so Gladys keeps it recent. */
export const HEARTBEAT = 30 * 60_000;

/** Realtime reconnection: 5 s, doubling, up to 5 minutes. */
export const RECONNECT_MIN = 5_000;
export const RECONNECT_MAX = 5 * 60_000;
/** The delay is reset only after a link stable this long. */
export const RECONNECT_STABLE = 60_000;
/** Each retry delay is spread by ±20 %, so many Gladys do not reconnect together. */
export const RECONNECT_JITTER = 0.2;
/** A handshake not finished in this time is a failure. */
export const HANDSHAKE_TIMEOUT = 30_000;
/** After this many failed Engine.IO v4 handshakes, try v3 (and back). */
export const HANDSHAKE_FAILURES_BEFORE_SWITCH = 3;

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
