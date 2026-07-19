import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, ActivityIndicator, Platform, StatusBar, AppState } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { api, loadToken, setToken } from './src/api';
import { C } from './src/theme';
import LockScreen from './src/screens/LockScreen';
import LoginScreen from './src/screens/LoginScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import BrannlisteScreen from './src/screens/BrannlisteScreen';
import AndaktScreen from './src/screens/AndaktScreen';
import MiddagScreen from './src/screens/MiddagScreen';

const TABS = [
  { key: 'home', label: 'Hjem', icon: '🏠' },
  { key: 'brann', label: 'Brannliste', icon: '🔥' },
  { key: 'andakt', label: 'Andakt', icon: '📖' },
  { key: 'middag', label: 'Middag', icon: '🍽️' },
];

// Sesjonen varer i 90 dager, så appen låses i stedet bak Face ID / telefonkode.
// Vi låser ikke hvis man var borte under et minutt: appen går selv i bakgrunnen
// når den åpner meny-PDF-er og kamera til QR-skanning, og da ville en streng
// lås gitt Face ID-spørsmål midt i helt vanlig bruk.
const LOCK_GRACE_MS = 60 * 1000;

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('home');
  const [locked, setLocked] = useState(false);
  const leftAt = useRef(null);

  useEffect(() => {
    (async () => {
      await loadToken();
      try {
        const d = await api('/api/auth/me');
        if (d.user.role === 'admin') { await setToken(null); }
        else { setUser(d.user); setLocked(true); } // krev opplåsing før innhold vises
      } catch { /* ikke innlogget */ }
      setBooting(false);
    })();
  }, []);

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

  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <ExpoStatusBar style="dark" />
        <LoginScreen onLoggedIn={setUser} />
      </SafeAreaView>
    );
  }

  // Innlogget, men appen er låst: ingenting av innholdet skal vises før
  // Face ID / kode er godkjent.
  if (locked) {
    return (
      <SafeAreaView style={styles.safe}>
        <ExpoStatusBar style="dark" />
        <LockScreen onUnlocked={() => setLocked(false)} onLogout={logout} />
      </SafeAreaView>
    );
  }

  if (user.mustChangePassword) {
    return (
      <SafeAreaView style={styles.safe}>
        <ExpoStatusBar style="dark" />
        <ChangePasswordScreen onDone={() => setUser({ ...user, mustChangePassword: false })} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ExpoStatusBar style="dark" />
      <View style={{ flex: 1 }}>
        {tab === 'home' && <DashboardScreen user={user} onLogout={logout} goTo={setTab} />}
        {tab === 'brann' && <BrannlisteScreen />}
        {tab === 'andakt' && <AndaktScreen user={user} />}
        {tab === 'middag' && <MiddagScreen user={user} />}
      </View>

      <View style={styles.tabbar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
              <Text style={{ fontSize: 22, opacity: active ? 1 : 0.45 }}>{t.icon}</Text>
              <Text style={[styles.tabLabel, { color: active ? C.navy : C.muted2, fontWeight: active ? '700' : '600' }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.surface,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabbar: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 8,
  },
  tab: { alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 4 },
  tabLabel: { fontSize: 11 },
});
