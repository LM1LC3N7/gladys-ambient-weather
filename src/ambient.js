// -----------------------------------------------------------------------------
// The Ambient Weather client: the stations of the account (official REST
// API) and the public stations of a box (Ambient Weather Network). Endpoints
// and parameters follow the official ambient-api documentation and
// aioambient (MIT, bachya), its Python client.
// -----------------------------------------------------------------------------

import { PUBLIC_LIMIT, PUBLIC_MIN_GAP, PUBLIC_URL, REST_MIN_GAP, REST_URL } from './constants.js';
import { getJson } from './http.js';
import { createPacer } from './pacer.js';

export class AmbientClient {
  constructor({ now, sleep } = {}) {
    // One pacer per host: the account calls share the 1 request/s budget of
    // the API key, the public calls never burst either.
    this.paceRest = createPacer(REST_MIN_GAP, { now, sleep });
    this.pacePublic = createPacer(PUBLIC_MIN_GAP, { now, sleep });
  }

  /** The stations of the account, each with its last reading. */
  devices({ apiKey, applicationKey }) {
    const url = new URL(`${REST_URL}/devices`);
    url.searchParams.set('applicationKey', applicationKey);
    url.searchParams.set('apiKey', apiKey);
    return this.paceRest(() => getJson(url.href));
  }

  /** The public stations within a box `[[west, south], [east, north]]`. */
  async publicDevices(box) {
    const url = new URL(PUBLIC_URL);
    url.searchParams.set('$publicBox[0][0]', String(box[0][0]));
    url.searchParams.set('$publicBox[0][1]', String(box[0][1]));
    url.searchParams.set('$publicBox[1][0]', String(box[1][0]));
    url.searchParams.set('$publicBox[1][1]', String(box[1][1]));
    url.searchParams.set('$limit', String(PUBLIC_LIMIT));
    const body = await this.pacePublic(() => getJson(url.href));
    return Array.isArray(body) ? body : (body?.data ?? []);
  }

  /**
   * One public station by its MAC address (`GET /devices/<mac>`, as
   * aioambient's `get_device_details`): a station the user created keeps its
   * values even when it falls out of the box or the limit. `id` is the
   * 12-hex platform id; undefined when the station is unknown.
   */
  async publicDevice(id) {
    const mac = id.toUpperCase().match(/../g).join(':');
    // Only hex digits and colons: safe in a path as is, like aioambient sends it.
    const url = `${PUBLIC_URL}/${mac}`;
    const body = await this.pacePublic(() => getJson(url));
    const raw = Array.isArray(body) ? body[0] : body?.macAddress ? body : body?.data;
    return Array.isArray(raw) ? raw[0] : raw;
  }
}
