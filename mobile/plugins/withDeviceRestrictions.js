const { withAndroidManifest } = require('@expo/config-plugins');

// Kongshaug Elevapp er laget for elevens egen telefon i internatet – ikke
// nettbrett eller Chromebook (jf. ios.supportsTablet=false i app.json).
// Android krever eksplisitte manifest-deklarasjoner for det samme, siden
// det ikke finnes noe enkelt "supportsTablet"-flagg der.
function withDeviceRestrictions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ekskluder nettbrett: Play bruker skjermstørrelse-klassene til å
    // avgjøre hvilke enheter appen regnes som kompatibel med, og dermed
    // hvilke skjermbilder butikkoppføringen krever.
    manifest['supports-screens'] = [
      {
        $: {
          'android:smallScreens': 'true',
          'android:normalScreens': 'true',
          'android:largeScreens': 'false',
          'android:xlargeScreens': 'false',
          'android:anyDensity': 'true',
        },
      },
    ];

    // Krev berøringsskjerm. Dette utelukker Chromebooks UTEN touch (eldre
    // modeller) og andre ikke-touch-enheter – men IKKE touch-Chromebooks
    // som HP Chromebook x2, som rapporterer touchscreen=true. Det finnes
    // ingen pålitelig manifest-tagg som utelukker alle Chromebooks; Google
    // lager dem nettopp for å kjøre Android-apper. Denne taggen er derfor
    // en delvis innsnevring, ikke en full utelukkelse.
    manifest['uses-feature'] = manifest['uses-feature'] || [];
    manifest['uses-feature'].push({
      $: {
        'android:name': 'android.hardware.touchscreen',
        'android:required': 'true',
      },
    });

    return config;
  });
}

module.exports = withDeviceRestrictions;
