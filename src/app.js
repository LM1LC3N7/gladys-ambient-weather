// -----------------------------------------------------------------------------
// The integration itself: the stations of the account (REST every few
// minutes, realtime pushes in between), the public stations around the
// houses (optional), the Gladys devices and states built from them, the
// connection status and the test button. index.js only wires the SDK
// handlers to it.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { AmbientClient } from './ambient.js';
import { hasAccount, normalizeConfig } from './config.js';
import { HEARTBEAT } from './constants.js';
import { HttpError } from './http.js';
import { T } from './i18n.js';
import { RealtimeClient } from './realtime.js';
import {
  boxAround,
  devicesOf,
  isFresh,
  macId,
  nearbyPublic,
  readingTime,
  stationsOf,
  statesOf,
} from './stations.js';
import { num } from './sensors.js';

const defaultTimers = { setInterval, clearInterval, setTimeout, clearTimeout };

const coordinate = (value) => (value === null || value === undefined ? NaN : Number(value));

export class AmbientApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'ambient-weather' }),
    now = Date.now,
    timers = defaultTimers,
    client,
    WebSocketImpl,
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.config = normalizeConfig();
    this.client = client ?? new AmbientClient({ now });
    this.realtime = new RealtimeClient({
      WebSocketImpl,
      timers,
      logger,
      onSubscribed: (devices) => this.onRealtimeStations(devices),
      onData: (reading) => this.onRealtimeData(reading),
      onStatus: (status) => this.onRealtimeStatus(status),
    });
    this.realtimeStatus = 'stopped';
    /** id -> station of the account */
    this.own = new Map();
    /** id -> public station within the radius of a house (states) */
    this.publicAll = new Map();
    /** The nearest public stations, offered in the Discovery tab. */
    this.nearby = [];
    this.houses = [];
    this.health = { account: 'off', public: 'off' };
    this.intervals = [];
    this.lastDiscovered = undefined;
    this.lastStatus = undefined;
    this.generation = 0;
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(raw = {}) {
    this.stop();
    const generation = ++this.generation;
    this.config = normalizeConfig(raw);
    const config = this.config;
    this.own.clear();
    this.publicAll.clear();
    this.nearby = [];
    this.lastDiscovered = undefined;
    this.lastStatus = undefined;
    this.health = { account: 'off', public: 'off' };
    await this.pollAccount();
    await this.pollPublic();
    if (generation !== this.generation) {
      return;
    }
    if (hasAccount(config)) {
      this.every(config.pollMinutes, () => this.pollAccount());
      if (config.realtime) {
        this.realtime.start({ apiKey: config.apiKey, applicationKey: config.applicationKey });
      }
    }
    if (config.publicStations) {
      this.every(config.publicPollMinutes, () => this.pollPublic());
    }
    await this.refreshStatus();
  }

  stop() {
    this.generation += 1;
    for (const id of this.intervals) {
      this.timers.clearInterval(id);
    }
    this.intervals = [];
    this.realtime.stop();
  }

  every(minutes, task) {
    this.intervals.push(
      this.timers.setInterval(
        () => task().catch((err) => this.logger.warn(`Refresh failed: ${this.scrub(err)}`)),
        minutes * 60_000,
      ),
    );
  }

  /** An error message without the keys, should Ambient ever echo them. */
  scrub(err) {
    let message = String(err?.message ?? err);
    for (const secret of [this.config.apiKey, this.config.applicationKey]) {
      if (secret) {
        message = message.split(secret).join('***');
      }
    }
    return message;
  }

  classify(err) {
    if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
      return 'refused';
    }
    if (err instanceof HttpError && err.status === 429) {
      return 'limited';
    }
    return this.scrub(err);
  }

  // --- Status ------------------------------------------------------------------

  async setStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => this.logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  async refreshStatus() {
    const { config } = this;
    const { account, public: pub } = this.health;
    const oneKey = !hasAccount(config) && Boolean(config.apiKey || config.applicationKey);
    if (oneKey) {
      return this.setStatus(false, T.oneKeyMissing);
    }
    if (!hasAccount(config) && !config.publicStations) {
      return this.setStatus(false, T.notConfigured);
    }
    if (account === 'refused') {
      return this.setStatus(false, T.keysRefused);
    }
    if (account === 'limited') {
      return this.setStatus(false, T.rateLimited);
    }
    if (account !== 'ok' && account !== 'off') {
      return this.setStatus(false, T.accountDown(account));
    }
    // Without an account, the public stations are the whole integration.
    if (account === 'off' && pub === 'no-house') {
      return this.setStatus(false, T.noLocatedHouse);
    }
    if (account === 'off' && pub !== 'ok') {
      return this.setStatus(false, T.publicDown(pub));
    }
    return this.setStatus(
      true,
      T.ok({
        stations: hasAccount(config) ? this.own.size : null,
        realtime: this.realtimeStatus === 'subscribed',
        publicStations: config.publicStations ? this.nearby.length : null,
      }),
    );
  }

  // --- The stations of the account ---------------------------------------------

  /** Merge stations, keeping the newest reading of each (REST vs realtime). */
  mergeOwn(stations, { replace = false } = {}) {
    const next = replace ? new Map() : new Map(this.own);
    for (const station of stations) {
      const known = this.own.get(station.id);
      const keep =
        known && readingTime(known.lastData) > readingTime(station.lastData)
          ? known.lastData
          : station.lastData;
      next.set(station.id, { ...station, lastData: keep });
    }
    this.own = next;
  }

  async pollAccount() {
    const { config } = this;
    if (!hasAccount(config)) {
      return;
    }
    const generation = this.generation;
    try {
      const list = await this.client.devices(config);
      if (generation !== this.generation) {
        return;
      }
      this.mergeOwn(stationsOf(list), { replace: true });
      this.health.account = 'ok';
    } catch (err) {
      if (generation !== this.generation) {
        return;
      }
      this.health.account = this.classify(err);
      this.logger.warn(`Ambient Weather account read failed: ${this.scrub(err)}`);
    }
    await this.publish();
    await this.refreshStatus();
  }

  async onRealtimeStations(devices) {
    this.mergeOwn(stationsOf(devices));
    this.health.account = 'ok';
    await this.publish();
    await this.refreshStatus();
  }

  async onRealtimeData(reading) {
    const station = this.own.get(macId(reading.macAddress));
    if (!station) {
      // A station added to the account since the last read: the next REST
      // read brings its name and its devices.
      return;
    }
    if (!(readingTime(reading) >= readingTime(station.lastData))) {
      return;
    }
    const lastData = { ...reading };
    delete lastData.macAddress;
    delete lastData.apiKey;
    station.lastData = lastData;
    await this.publishStates([station]);
  }

  async onRealtimeStatus(status) {
    this.realtimeStatus = status;
    if (status === 'subscribed' || status === 'refused' || status === 'down') {
      await this.refreshStatus();
    }
  }

  // --- The public stations ------------------------------------------------------

  /** The located houses; a house without coordinates is skipped. */
  async loadHouses() {
    let houses = [];
    try {
      houses = (await this.gladys.getHouses()) ?? [];
    } catch (err) {
      this.logger.warn(`Houses unavailable (location not granted?): ${err.message}`);
    }
    this.houses = houses
      .map((h) => ({
        name: String(h.name ?? h.selector ?? '?'),
        latitude: coordinate(h.latitude),
        longitude: coordinate(h.longitude),
      }))
      .filter((h) => Number.isFinite(h.latitude) && Number.isFinite(h.longitude));
  }

  async pollPublic() {
    const { config } = this;
    if (!config.publicStations) {
      return;
    }
    const generation = this.generation;
    await this.loadHouses();
    if (this.houses.length === 0) {
      this.health.public = 'no-house';
      this.publicAll = new Map();
      this.nearby = [];
    } else {
      const all = new Map();
      const nearby = new Map();
      let failure;
      const exclude = new Set(this.own.keys());
      for (const house of this.houses) {
        try {
          const raw = await this.client.publicDevices(
            boxAround(house.latitude, house.longitude, config.publicRadiusKm),
          );
          const list = nearbyPublic(stationsOf(raw, { isPublic: true }), {
            latitude: house.latitude,
            longitude: house.longitude,
            radiusKm: config.publicRadiusKm,
            now: this.now(),
            exclude,
          });
          for (const station of list) {
            if (!all.has(station.id) || all.get(station.id).distanceKm > station.distanceKm) {
              all.set(station.id, station);
            }
          }
          for (const station of list.slice(0, config.publicMaxStations)) {
            nearby.set(station.id, station);
          }
        } catch (err) {
          failure = err;
          this.logger.warn(`Public stations around ${house.name} failed: ${this.scrub(err)}`);
        }
      }
      if (generation !== this.generation) {
        return;
      }
      // A failed read keeps the stations of the previous one.
      if (!failure || all.size > 0) {
        this.publicAll = all;
        this.nearby = [...nearby.values()];
      }
      this.health.public = failure && all.size === 0 ? this.classify(failure) : 'ok';
    }
    await this.publish();
    await this.refreshStatus();
  }

  // --- Gladys devices and states --------------------------------------------------

  discoveredDevices() {
    const units = this.config.units;
    return [...this.own.values(), ...this.nearby].flatMap((station) =>
      devicesOf(this.gladys, station, { units }),
    );
  }

  async publish() {
    await this.publishDiscovered();
    await this.publishStates([...this.own.values(), ...this.publicAll.values()]);
  }

  /** The Discovery tab, published again only when it changed. */
  async publishDiscovered({ force = false } = {}) {
    const devices = this.discoveredDevices();
    const key = JSON.stringify(devices);
    if (!force && key === this.lastDiscovered) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.lastDiscovered = key;
    } catch (err) {
      this.logger.warn(`publishDiscoveredDevices failed: ${err.message}`);
    }
  }

  /** The units of the features the user created: feature external id -> unit. */
  createdFeatures() {
    const units = new Map();
    for (const device of this.gladys.devices ?? []) {
      for (const feature of device.features ?? []) {
        units.set(feature.external_id, feature.unit ?? null);
      }
    }
    return units;
  }

  /**
   * The fresh readings of `stations`, for the created features only, and only
   * what changed (plus a heartbeat): far below the 300 states per minute the
   * core accepts.
   */
  async publishStates(stations) {
    const created = this.createdFeatures();
    if (created.size === 0) {
      return;
    }
    const now = this.now();
    const unitOf = (id) => (created.has(id) ? created.get(id) : undefined);
    const states = stations
      .filter((station) => isFresh(station.lastData, now))
      .flatMap((station) => statesOf(this.gladys, station, { units: this.config.units, unitOf }));
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT });
    } catch (err) {
      this.logger.warn(`Publishing the states failed: ${err.message}`);
    }
  }

  // --- Configuration screen button -------------------------------------------------

  temperatureText(lastData, lang) {
    const f = num(lastData?.tempf);
    if (f === null) {
      return null;
    }
    const metric = this.config.units !== 'imperial';
    const value = Math.round((metric ? ((f - 32) * 5) / 9 : f) * 10) / 10;
    const text = lang === 'fr' ? String(value).replace('.', ',') : String(value);
    return `${text} ${metric ? '°C' : '°F'}`;
  }

  ageText(lastData, lang) {
    const t = readingTime(lastData);
    if (!Number.isFinite(t)) {
      return lang === 'fr' ? 'aucune mesure' : 'no reading';
    }
    const minutes = Math.max(0, Math.round((this.now() - t) / 60_000));
    if (minutes >= 120) {
      const hours = Math.round(minutes / 60);
      return lang === 'fr' ? `mesure d'il y a ${hours} h` : `read ${hours} h ago`;
    }
    return lang === 'fr' ? `mesure d'il y a ${minutes} min` : `read ${minutes} min ago`;
  }

  stationLine(station, lang) {
    const parts = [
      this.temperatureText(station.lastData, lang),
      this.ageText(station.lastData, lang),
    ];
    const where = station.distanceKm !== undefined ? ` (${station.distanceKm} km)` : '';
    const colon = lang === 'fr' ? ' :' : ':';
    return `- ${station.name}${where}${colon} ${parts.filter(Boolean).join(', ')}`;
  }

  async testConnection() {
    const { config } = this;
    if (!hasAccount(config) && !config.publicStations) {
      return config.apiKey || config.applicationKey ? T.oneKeyMissing : T.notConfigured;
    }
    const en = [];
    const fr = [];
    if (hasAccount(config)) {
      await this.pollAccount();
      const { account } = this.health;
      if (account === 'ok') {
        en.push(`Account: ${this.own.size} station(s).`);
        fr.push(`Compte : ${this.own.size} station(s).`);
        for (const station of this.own.values()) {
          en.push(this.stationLine(station, 'en'));
          fr.push(this.stationLine(station, 'fr'));
        }
        const live = this.realtimeStatus === 'subscribed';
        en.push(
          `Realtime: ${config.realtime ? (live ? 'connected' : 'not connected yet') : 'off'}.`,
        );
        fr.push(
          `Temps réel : ${config.realtime ? (live ? 'connecté' : 'pas encore connecté') : 'désactivé'}.`,
        );
      } else {
        const text =
          account === 'refused'
            ? T.keysRefused
            : account === 'limited'
              ? T.rateLimited
              : T.accountDown(account);
        en.push(text.en);
        fr.push(text.fr);
      }
    } else if (config.apiKey || config.applicationKey) {
      en.push(T.oneKeyMissing.en);
      fr.push(T.oneKeyMissing.fr);
    }
    if (config.publicStations) {
      await this.pollPublic();
      const pub = this.health.public;
      if (pub === 'no-house') {
        en.push(T.noLocatedHouse.en);
        fr.push(T.noLocatedHouse.fr);
      } else if (pub !== 'ok') {
        en.push(T.publicDown(pub).en);
        fr.push(T.publicDown(pub).fr);
      } else if (this.nearby.length === 0) {
        en.push(`Public stations: none with a recent reading within ${config.publicRadiusKm} km.`);
        fr.push(
          `Stations publiques : aucune avec une mesure récente à moins de ${config.publicRadiusKm} km.`,
        );
      } else {
        en.push(`Public stations nearby: ${this.nearby.length}.`);
        fr.push(`Stations publiques à proximité : ${this.nearby.length}.`);
        for (const station of this.nearby) {
          en.push(this.stationLine(station, 'en'));
          fr.push(this.stationLine(station, 'fr'));
        }
      }
    } else {
      en.push('Public stations: off.');
      fr.push('Stations publiques : désactivées.');
    }
    return { en: en.join('\n'), fr: fr.join('\n') };
  }
}
