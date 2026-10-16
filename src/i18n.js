// -----------------------------------------------------------------------------
// Runtime texts shown in Gladys (connection status, test button), en and fr.
// -----------------------------------------------------------------------------

const plural = (n, one, many) => (n === 1 ? one : many);

/** The realtime link, as the status and the test button say it. */
const REALTIME = {
  on: { en: 'realtime connected', fr: 'temps réel connecté' },
  connecting: { en: 'realtime connecting', fr: 'temps réel en cours de connexion' },
  refused: {
    en: 'realtime refused (check the Application key)',
    fr: "temps réel refusé (vérifiez la clé d'application)",
  },
  down: {
    en: 'realtime unavailable for now (the periodic reads go on)',
    fr: 'temps réel indisponible pour le moment (les lectures périodiques continuent)',
  },
  off: { en: 'realtime off', fr: 'temps réel désactivé' },
};

export const T = {
  notConfigured: {
    en: 'Enter your Ambient Weather API key and Application key, or turn on the public stations.',
    fr: "Saisissez votre clé d'API et votre clé d'application Ambient Weather, ou activez les stations publiques.",
  },
  oneKeyMissing: {
    en: 'Both keys are needed: the API key and the Application key.',
    fr: "Les deux clés sont nécessaires : la clé d'API et la clé d'application.",
  },
  keysRefused: {
    en: 'Ambient Weather refused the keys: check the API key and the Application key (retried every 30 minutes until the configuration changes).',
    fr: "Ambient Weather a refusé les clés : vérifiez la clé d'API et la clé d'application (nouvel essai toutes les 30 minutes jusqu'au prochain changement de configuration).",
  },
  rateLimited: {
    en: 'Ambient Weather asks to slow down (429): the next read waits as asked.',
    fr: 'Ambient Weather demande de ralentir (429) : la prochaine lecture attend le délai demandé.',
  },
  accountDown: (reason) => ({
    en: `Ambient Weather does not answer (${reason}).`,
    fr: `Ambient Weather ne répond pas (${reason}).`,
  }),
  publicDown: (reason) => {
    if (reason === 'refused') {
      return {
        en: 'The Ambient Weather Network refused the request for the public stations (HTTP 401/403): the public map service may have changed.',
        fr: "L'Ambient Weather Network a refusé la demande des stations publiques (HTTP 401/403) : le service de la carte publique a peut-être changé.",
      };
    }
    if (reason === 'limited') {
      return {
        en: 'The Ambient Weather Network asks to slow down (429): the next read waits as asked.',
        fr: "L'Ambient Weather Network demande de ralentir (429) : la prochaine lecture attend le délai demandé.",
      };
    }
    return {
      en: `The Ambient Weather Network does not answer (${reason}).`,
      fr: `L'Ambient Weather Network ne répond pas (${reason}).`,
    };
  },
  noLocatedHouse: {
    en: 'Public stations: no house of Gladys has a location.',
    fr: "Stations publiques : aucune maison de Gladys n'a de position.",
  },
  realtime: (state) => REALTIME[state] ?? REALTIME.connecting,
  /**
   * The connected status: `stations` and `publicStations` null when unused,
   * `realtime` a REALTIME key (null without an account), `publicIssue` the
   * reason of a public outage next to a working account.
   */
  ok: ({ stations, realtime = null, publicStations, publicIssue = null }) => {
    const en = [];
    const fr = [];
    if (stations !== null) {
      en.push(`${stations} ${plural(stations, 'station', 'stations')} of the account`);
      fr.push(`${stations} ${plural(stations, 'station', 'stations')} du compte`);
      if (realtime) {
        en.push(REALTIME[realtime].en);
        fr.push(REALTIME[realtime].fr);
      }
    }
    if (publicStations !== null) {
      en.push(`${publicStations} public ${plural(publicStations, 'station', 'stations')} nearby`);
      fr.push(
        `${publicStations} ${plural(publicStations, 'station publique', 'stations publiques')} à proximité`,
      );
    }
    let textEn = `${en.join(', ')}.`;
    let textFr = `${fr.join(', ')}.`;
    if (publicIssue) {
      const issue = publicIssue === 'no-house' ? T.noLocatedHouse : T.publicDown(publicIssue);
      textEn += ` ${issue.en}`;
      textFr += ` ${issue.fr}`;
    }
    return { en: textEn, fr: textFr };
  },
};
