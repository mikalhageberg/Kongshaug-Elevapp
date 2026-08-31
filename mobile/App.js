import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, AppState } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { api, loadToken, setToken, refreshCampus } from './src/api';
import { loadCachedCampus } from './src/campus';
import { registerForPushNotifications, unregisterPushToken } from './src/push';
import { C } from './src/theme';
import LockScreen from './src/screens/LockScreen';
import LoginScreen from './src/screens/LoginScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import BrannlisteScreen from './src/screens/BrannlisteScreen';
import AndaktScreen from './src/screens/AndaktScreen';
import MiddagScreen from './src/screens/MiddagScreen';
import InternatScreen from './src/screens/InternatScreen';
import AdminApp from './src/AdminApp';

const TABS = [
  { key: 'home', label: 'Hjem', icon: '🏠' },
  { key: 'brann', label: 'Brannliste', icon: '🔥' },
  { key: 'andakt', label: 'Andakt', icon: '📖' },
  { key: 'middag', label: 'Middag', icon: '🍽️' },
  { key: 'internat', label: 'Internat', icon: '🧹' },
];

// Sesjonen varer i 90 dager, så appen låses i stedet bak Face ID / telefonkode.
// Vi låser ikke hvis man var borte under et minutt: appen går selv i bakgrunnen
// når den åpner meny-PDF-er og kamera til QR-skanning, og da ville en streng
// lås gitt Face ID-spørsmål midt i helt vanlig bruk.
const LOCK_GRACE_MS = 60 * 1000;

// SafeAreaProvider må ligge ytterst, slik at useSafeAreaInsets() virker.
export default function App() {
  return (
    <SafeAreaProvider>
      <AppInner />
    </SafeAreaProvider>
  );
}

function AppInner() {
  // Faktiske høyder på systemets statuslinje (topp) og navigasjonslinje (bunn).
  // Android tegner edge-to-edge, så uten dette havner tab-baren under
  // navigasjonslinjen. Gjelder både gest-navigasjon og de tre knappene.
  const insets = useSafeAreaInsets();
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('home');
  const [locked, setLocked] = useState(false);
  const leftAt = useRef(null);

  useEffect(() => {
    (async () => {
      await loadToken();
      await loadCachedCampus(); // skolens område fra forrige økt – før noe vises
      try {
        const d = await api('/api/auth/me');
        // Både elever og administratorer bruker appen nå. Låsen gjelder begge:
        // for administratoren er brannlisten hele skolens elevliste, og
        // telefonens egen lås er det eneste som står foran den.
        setUser(d.user);
        setLocked(true);
        registerForPushNotifications();
      } catch { /* ikke innlogget */ }
      setBooting(false);
    })();
  }, []);

  // Skolens område hentes én gang per innlogging og caches lokalt, slik at
  // posisjonssjekken kan regnes ut på telefonen (se src/campus.js).
  useEffect(() => { if (user?.role === 'student') refreshCampus(); }, [user]);

  // Lås igjen når appen har vært i bakgrunnen en stund.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        leftAt.current = Date.now();
      } else if (state === 'active') {
        const away = leftAt.current ? Date.now() - leftAt.current : 0;
        if (user && away > LOCK_GRACE_MS) setLocked(true);
        leftAt.current = null;
      }
    });
    return () => sub.remove();
  }, [user]);

  async function logout() {
    await unregisterPushToken();
    await setToken(null);
    setUser(null);
    setLocked(false);
    setTab('home');
  }

  if (booting) {
    return (
      <View style={[styles.center, { backgroundColor: C.surface }]}>
        <ActivityIndicator color={C.navy} size="large" />
      </View>
    );
  }

  // Skjermer uten tab-bar: hold innholdet klar av både statuslinje og
  // navigasjonslinje.
  const screenPad = { paddingTop: insets.top, paddingBottom: insets.bottom };

  if (!user) {
    return (
      <View style={[styles.safe, screenPad]}>
        <ExpoStatusBar style="dark" />
        <LoginScreen onLoggedIn={setUser} />
      </View>
    );
  }

  // Innlogget, men appen er låst: ingenting av innholdet skal vises før
  // Face ID / kode er godkjent.
  if (locked) {
    return (
      <View style={[styles.safe, screenPad]}>
        <ExpoStatusBar style="dark" />
        <LockScreen onUnlocked={() => setLocked(false)} onLogout={logout} />
      </View>
    );
  }

  if (user.mustChangePassword) {
    return (
      <View style={[styles.safe, screenPad]}>
        <ExpoStatusBar style="dark" />
        <ChangePasswordScreen onDone={() => setUser({ ...user, mustChangePassword: false })} />
      </View>
    );
  }

  // Administratoren får sin egen, mye smalere app: brannlisten og vakten.
  if (user.role === 'admin') {
    return (
      <View style={[styles.safe, { paddingTop: insets.top }]}>
        <ExpoStatusBar style="dark" />
        <AdminApp user={user} onLogout={logout} insets={insets} />
      </View>
    );
  }

  return (
    // Kun topp-padding her: tab-baren håndterer bunnen selv, så dens hvite
    // flate strekker seg helt ned bak navigasjonslinjen.
    <View style={[styles.safe, { paddingTop: insets.top }]}>
      <ExpoStatusBar style="dark" />
      <View style={{ flex: 1 }}>
        {tab === 'home' && <DashboardScreen user={user} onLogout={logout} goTo={setTab} />}
        {tab === 'brann' && <BrannlisteScreen user={user} />}
        {tab === 'andakt' && <AndaktScreen user={user} />}
        {tab === 'middag' && <MiddagScreen user={user} />}
        {tab === 'internat' && <InternatScreen user={user} />}
      </View>

      <View style={[styles.tabbar, { paddingBottom: 8 + insets.bottom }]}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
              <Text style={{ fontSize: 22, opacity: active ? 1 : 0.45 }}>{t.icon}</Text>
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
  safe: {
    flex: 1,
    backgroundColor: C.surface,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabbar: {
    // paddingTop fast; paddingBottom settes i render til 8 + navigasjonslinjen.
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8,
  },
  // Fem faner må få plass på de smaleste telefonene: hver fane deler bredden
  // likt, og etiketten klippes framfor å presse naboene ut.
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4, paddingVertical: 4 },
  tabLabel: { fontSize: 11 },
});
