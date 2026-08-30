import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { C } from './theme';

// Hvilken app og hvilken oppdatering som faktisk kjører, nederst på hjemskjermen.
//
// Uten dette er «hvilken versjon har du?» umulig å svare på uten å grave i
// TestFlight – og en OTA-oppdatering som ikke har landet, ser ut som en feil i
// appen. Kjøretidsversjonen er den avgjørende: den bestemmer hvilke
// oppdateringer telefonen i det hele tatt kan ta imot.

// «10769f06fc5aee…» → «10769f06». Nok til å kjenne igjen, kort nok til å lese opp.
const kort = (s) => (s ? String(s).replace(/-/g, '').slice(0, 8) : null);

const stempel = (d) => {
  if (!d) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} kl. ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Alt leses defensivt: i Expo Go og i utvikling er oppdateringer slått av, og
// feltene kan mangle helt.
function les() {
  const info = { versjon: null, bygg: null, kjøretid: null, oppdatering: null, kanal: null, laget: null, innebygd: true };
  try {
    info.versjon = Constants.expoConfig?.version || null;
    info.bygg = Constants.platform?.ios?.buildNumber
      || (Constants.platform?.android?.versionCode != null ? String(Constants.platform.android.versionCode) : null);
  } catch { /* ignorer */ }
  try {
    if (Updates.isEnabled) {
      info.kjøretid = Updates.runtimeVersion || null;
      info.kanal = Updates.channel || null;
      info.innebygd = !!Updates.isEmbeddedLaunch;
      info.oppdatering = Updates.isEmbeddedLaunch ? null : (Updates.updateId || null);
      info.laget = Updates.createdAt || null;
    }
  } catch { /* ignorer */ }
  return info;
}

export default function Versjon({ style }) {
  const [åpen, setÅpen] = useState(false);
  const info = React.useMemo(les, []);

  const førsteLinje = [
    'Kongshaug Elevapp',
    info.versjon,
    info.bygg ? `(${info.bygg})` : null,
  ].filter(Boolean).join(' ');

  const andreLinje = info.innebygd
    ? 'Innebygd versjon – ingen oppdatering hentet'
    : `Oppdatering ${kort(info.oppdatering) || '–'}${info.laget ? ` · ${stempel(info.laget)}` : ''}`;

  const rad = (navn, verdi) => (verdi ? (
    <View style={styles.rad} key={navn}>
      <Text style={styles.radNavn}>{navn}</Text>
      <Text style={styles.radVerdi} selectable>{verdi}</Text>
    </View>
  ) : null);

  return (
    <Pressable onPress={() => setÅpen((o) => !o)} style={[styles.wrap, style]}>
      <Text style={styles.linje}>{førsteLinje}</Text>
      <Text style={styles.linje}>{andreLinje}</Text>
      {åpen ? (
        <View style={styles.detaljer}>
          {rad('Kjøretidsversjon', info.kjøretid)}
          {rad('Oppdaterings-ID', info.oppdatering)}
          {rad('Kanal', info.kanal)}
          {!info.kjøretid ? <Text style={styles.radVerdi}>Oppdateringer er slått av i denne byggevarianten.</Text> : null}
        </View>
      ) : (
        <Text style={styles.hint}>Trykk for detaljer</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 18 },
  linje: { fontSize: 12, fontWeight: '600', color: C.muted2, textAlign: 'center', lineHeight: 17 },
  hint: { fontSize: 11.5, fontWeight: '600', color: C.muted2, opacity: 0.7, marginTop: 4 },
  detaljer: { marginTop: 10, alignSelf: 'stretch', backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 8 },
  rad: { gap: 1 },
  radNavn: { fontSize: 11, fontWeight: '800', color: C.muted2, textTransform: 'uppercase', letterSpacing: 0.4 },
  radVerdi: { fontSize: 12.5, fontWeight: '600', color: C.slate },
});
