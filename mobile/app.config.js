// Testvarianten av appen. Med APP_VARIANT=staging (settes bare av
// eas.json-profilen «staging») får appen et eget navn og egen bundle-ID, så den
// installeres ved siden av den ekte appen i stedet for å erstatte den, og
// peker mot testserveren på Railway.
//
// Uten APP_VARIANT returneres app.json urørt. Det er viktig: produksjonsappens
// kjøretidsversjon er et fingeravtrykk av konfigurasjonen, og endrer den seg,
// når ikke lenger `eas update` de installerte appene.

const STAGING_API_URL = 'https://kongshaug-elevapp-staging.up.railway.app';

module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'staging') return config;
  return {
    ...config,
    name: 'Kongshaug TEST',
    ios: { ...config.ios, bundleIdentifier: 'no.kongshaug.elevapp.staging' },
    android: { ...config.android, package: 'no.kongshaug.elevapp.staging' },
    extra: { ...config.extra, apiUrl: STAGING_API_URL },
  };
};
