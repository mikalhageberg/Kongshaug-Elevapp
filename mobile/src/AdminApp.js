import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { api } from './api';
import { C } from './theme';
import BrannlisteAdminScreen from './screens/admin/BrannlisteAdminScreen';
import VarslerScreen from './screens/admin/VarslerScreen';
import VaktScreen from './screens/admin/VaktScreen';

// Administratorens app. Bevisst mye smalere enn elevappen: brannlisten,
// varslene og vakten, ingenting annet. Alt det andre – brukere, andakt,
// gjester, menyer – hører hjemme på adminsiden, der man sitter ned og har
// tastatur.
//
// De tre fanene henger sammen: uten vakt gir Brannliste ingenting, og knappen
// der sender rett til Vakt.
const TABS = [
  { key: 'brann', label: 'Brannliste', icon: '🔥' },
  { key: 'varsler', label: 'Varsler', icon: '🔔' },
  { key: 'vakt', label: 'Vakt', icon: '🛡️' },
];

// Hvor ofte telleren hentes mens appen står åpen. Vaktvarselet kommer på et
// tidspunkt vakten ikke nødvendigvis følger med på, og da skal merket dukke
// opp av seg selv i stedet for ved neste fanebytte.
const TELLER_INTERVALL_MS = 60 * 1000;

export default function AdminApp({ user, onLogout, insets }) {
  const [tab, setTab] = useState('brann');
  const [ulest, setUlest] = useState(0);
  // Endres vakten, skal brannlisten lastes på nytt neste gang den vises –
  // ellers står «Du har ikke vakten» igjen etter at koden nettopp ble skannet.
  const [vaktNøkkel, setVaktNøkkel] = useState(0);
  const [varselNøkkel, setVarselNøkkel] = useState(0);
  const forrigeTab = useRef(tab);

  const hentUlest = useCallback(async () => {
    try { const r = await api('/api/notifications/unread-count'); setUlest(r.count); }
    catch { /* stille: et manglende merke skal ikke gi feilmelding */ }
  }, []);

  useEffect(() => {
    hentUlest();
    const timer = setInterval(hentUlest, TELLER_INTERVALL_MS);
    // Kommer appen fram igjen etter å ha ligget i bakgrunnen, er telleren
    // gjerne foreldet – da er det nettopp da et nytt varsel kan ha kommet.
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') hentUlest(); });
    // Kommer varselet mens appen er framme, skal merket dukke opp med det
    // samme – ikke først ved neste gjennomløp.
    const mottatt = Notifications.addNotificationReceivedListener(() => hentUlest());
    return () => { clearInterval(timer); sub.remove(); mottatt.remove(); };
  }, [hentUlest]);

  // Trykker vakten på selve varselet, er det senteret hun vil til. Ligger for
  // seg selv fordi den også må virke når appen startes av trykket.
  useEffect(() => {
    const trykk = Notifications.addNotificationResponseReceivedListener(() => bytt('varsler'));
    return () => trykk.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Åpnes Varsler på nytt, skal lista hentes på nytt – ikke vises slik den så
  // ut forrige gang fanen var framme.
  function bytt(ny) {
    if (ny === 'varsler' && forrigeTab.current !== 'varsler') setVarselNøkkel((n) => n + 1);
    forrigeTab.current = ny;
    setTab(ny);
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === 'brann' && (
          <BrannlisteAdminScreen key={vaktNøkkel} onNeedWatch={() => bytt('vakt')} />
        )}
        {tab === 'varsler' && (
          <VarslerScreen key={varselNøkkel} onLest={() => setUlest(0)} />
        )}
        {tab === 'vakt' && (
          <VaktScreen
            user={user}
            onLogout={onLogout}
            onChanged={() => setVaktNøkkel((n) => n + 1)}
          />
        )}
      </View>

      <View style={[styles.tabbar, { paddingBottom: 8 + insets.bottom }]}>
        {TABS.map((t) => {
          const active = tab === t.key;
          const merke = t.key === 'varsler' && ulest > 0;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => bytt(t.key)}>
              <View>
                <Text style={{ fontSize: 22, opacity: active ? 1 : 0.45 }}>{t.icon}</Text>
                {merke ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeTekst}>{ulest > 9 ? '9+' : ulest}</Text>
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={1} style={[styles.tabLabel, { color: active ? C.navy : C.muted2, fontWeight: active ? '700' : '600' }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabbar: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4, paddingVertical: 4 },
  tabLabel: { fontSize: 11 },
  badge: {
    position: 'absolute', top: -4, right: -11, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeTekst: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
