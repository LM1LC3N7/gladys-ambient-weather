// -----------------------------------------------------------------------------
// The only place that talks HTTP: `fetch` with a timeout and a User-Agent that
// names the integration. The tests replace it with `setFetch()`.
//
// The Ambient keys travel in the query string (that is how the API wants
// them): an error message only ever carries the PATH of the URL, never the
// query, so no key reaches a log or the configuration screen.
// -----------------------------------------------------------------------------

import { HTTP_TIMEOUT, USER_AGENT } from './constants.js';

let fetchImpl = (...args) => globalThis.fetch(...args);

/** Replace the fetch implementation (tests only). Returns the previous one. */
export function setFetch(impl) {
  const previous = fetchImpl;
  fetchImpl = impl;
  return previous;
}

export class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} on ${new URL(url).pathname}${body ? `: ${body}` : ''}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

/** The network failed (DNS, timeout...): the message without the URL. */
export class NetworkError extends Error {
  constructor(url, cause) {
    const reason = cause?.name === 'TimeoutError' ? 'timeout' : (cause?.cause?.code ?? 'failed');
    super(`network ${reason} on ${new URL(url).host}`);
    this.name = 'NetworkError';
  }
}

/** GET a JSON document; throws an HttpError on a non-2xx status. */
export async function getJson(url, { timeout = HTTP_TIMEOUT } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(Math.max(1, timeout)),
    });
  } catch (err) {
    throw new NetworkError(url, err);
  }
  const text = await response.text().catch(() => '');
  if (!response.ok) {
    throw new HttpError(response.status, url, text.trim().slice(0, 200));
  }
  return text ? JSON.parse(text) : undefined;
}
