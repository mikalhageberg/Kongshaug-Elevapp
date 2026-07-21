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

    // Ekskluder Chromebook: ChromeOS' kompatibilitetsprofil mot Play
    // rapporterer alltid berøringsskjerm som fraværende, uansett om
    // maskinen faktisk har en. Å kreve den er den dokumenterte måten å
    // melde en app ut av ChromeOS på.
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
