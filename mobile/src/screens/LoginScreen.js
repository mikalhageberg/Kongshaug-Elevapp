import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, ScrollView, Platform, Linking } from 'react-native';
import { api, setToken, BASE_URL } from '../api';
import { registerForPushNotifications } from '../push';
import { C } from '../theme';
import { Button } from '../ui';

export default function LoginScreen({ onLoggedIn }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setErr('');
    setLoading(true);
    try {
      // client:'native' -> serveren gir et langlevet token (appen er låst bak
      // Face ID/kode), i stedet for nettleserens 12-timers cookie.
      const data = await api('/api/auth/login', { method: 'POST', body: { username, password, client: 'native' } });
      await setToken(data.token);
      if (data.user.role === 'admin') {
        setErr('Denne appen er for elever. Administratorer bruker nettsiden.');
        await setToken(null);
        return;
      }
      registerForPushNotifications();
      onLoggedIn(data.user);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    // ScrollView inni KeyboardAvoidingView: innholdet sentreres når tastaturet
    // er lukket, og kan rulles slik at det fokuserte feltet løftes over
    // tastaturet på Android (der adjustResize ikke er til å stole på med
    // edge-to-edge). keyboardShouldPersistTaps lar «Logg inn» trykkes på
    // første trykk mens tastaturet er oppe.
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.logoRow}>
        <View style={styles.logo}><Text style={{ color: '#fff', fontSize: 22 }}>🏫</Text></View>
        <View>
          <Text style={{ fontSize: 19, fontWeight: '800', color: C.ink }}>Kongshaug</Text>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted2 }}>Musikkgymnas</Text>
        </View>
      </View>

      <Text style={styles.h1}>Logg inn</Text>
      <Text style={styles.sub}>Elevapp · brannliste og andakt</Text>

      <Text style={styles.label}>Brukernavn</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
        placeholder="fornavn.etternavn"
        placeholderTextColor={C.muted2}
      />
      <Text style={[styles.label, { marginTop: 16 }]}>Passord</Text>
      <TextInput
        style={styles.input}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        onSubmitEditing={submit}
      />

      {err ? <Text style={styles.err}>{err}</Text> : null}

      <Button title="Logg inn" onPress={submit} loading={loading} style={{ marginTop: 22 }} />
      <Text style={styles.foot}>
        Elever får utdelt bruker av administrasjonen.
      </Text>
      <Pressable onPress={() => Linking.openURL(`${BASE_URL}/personvern/`)} hitSlop={8}>
        <Text style={styles.privacyLink}>Personvernerklæring</Text>
      </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.surface },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 26 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 26 },
  logo: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 28, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: C.muted, marginTop: 6, marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '700', color: C.slate, marginBottom: 6 },
  input: {
    height: 54, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line2, borderRadius: 14,
    paddingHorizontal: 16, fontSize: 16, color: C.ink,
  },
  err: { color: C.redInk, fontSize: 14, fontWeight: '600', marginTop: 14 },
  foot: { fontSize: 13, color: C.muted2, textAlign: 'center', marginTop: 16, lineHeight: 20 },
  privacyLink: { fontSize: 12.5, fontWeight: '700', color: C.muted2, textAlign: 'center', marginTop: 12 },
});
