// -----------------------------------------------------------------------------
// Runtime texts shown in Gladys (connection status, test button), en and fr.
// -----------------------------------------------------------------------------

const plural = (n, one, many) => (n === 1 ? one : many);

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
    en: 'Ambient Weather refused the keys: check the API key and the Application key.',
    fr: "Ambient Weather a refusé les clés : vérifiez la clé d'API et la clé d'application.",
  },
  rateLimited: {
    en: 'Ambient Weather asks to slow down (429): the next read will retry.',
    fr: 'Ambient Weather demande de ralentir (429) : la prochaine lecture réessaiera.',
  },
  accountDown: (reason) => ({
    en: `Ambient Weather does not answer (${reason}).`,
    fr: `Ambient Weather ne répond pas (${reason}).`,
  }),
  publicDown: (reason) => ({
    en: `The Ambient Weather Network does not answer (${reason}).`,
    fr: `L'Ambient Weather Network ne répond pas (${reason}).`,
  }),
  noLocatedHouse: {
    en: 'Public stations: no house of Gladys has a location.',
    fr: "Stations publiques : aucune maison de Gladys n'a de position.",
  },
  ok: ({ stations, realtime, publicStations }) => {
    const en = [];
    const fr = [];
    if (stations !== null) {
      en.push(`${stations} ${plural(stations, 'station', 'stations')} of the account`);
      fr.push(`${stations} ${plural(stations, 'station', 'stations')} du compte`);
      if (realtime) {
        en.push('realtime on');
        fr.push('temps réel actif');
      }
    }
    if (publicStations !== null) {
      en.push(`${publicStations} public ${plural(publicStations, 'station', 'stations')} nearby`);
      fr.push(
        `${publicStations} ${plural(publicStations, 'station publique', 'stations publiques')} à proximité`,
      );
    }
    return { en: `${en.join(', ')}.`, fr: `${fr.join(', ')}.` };
  },
};
