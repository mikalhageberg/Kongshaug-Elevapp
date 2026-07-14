import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, SafeAreaView, ActivityIndicator, Platform, StatusBar } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { api, loadToken, setToken } from './src/api';
import { C } from './src/theme';
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

export default function App() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('home');

  useEffect(() => {
    (async () => {
      await loadToken();
      try {
        const d = await api('/api/auth/me');
        if (d.user.role === 'admin') { await setToken(null); }
        else setUser(d.user);
      } catch { /* ikke innlogget */ }
      setBooting(false);
    })();
  }, []);

  async function logout() {
    await setToken(null);
    setUser(null);
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
        {tab === 'andakt' && <AndaktScreen />}
        {tab === 'middag' && <MiddagScreen />}
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
