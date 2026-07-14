import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { api } from '../api';
import { C } from '../theme';
import { Button } from '../ui';

export default function ChangePasswordScreen({ onDone }) {
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    setErr('');
    if (p1 !== p2) return setErr('Passordene er ikke like');
    if (p1.length < 8) return setErr('Passordet må ha minst 8 tegn');
    setLoading(true);
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { newPassword: p1 } });
      onDone();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
      <View style={styles.icon}><Text style={{ fontSize: 26 }}>🔒</Text></View>
      <Text style={styles.h1}>Velg ditt eget passord</Text>
      <Text style={styles.sub}>
        Du logget inn med et midlertidig passord fra skolen. Velg et nytt passord som bare du kjenner.
      </Text>

      <Text style={styles.label}>Nytt passord</Text>
      <TextInput style={styles.input} secureTextEntry value={p1} onChangeText={setP1} />
      <Text style={[styles.label, { marginTop: 16 }]}>Gjenta nytt passord</Text>
      <TextInput style={styles.input} secureTextEntry value={p2} onChangeText={setP2} onSubmitEditing={submit} />
      <Text style={{ fontSize: 13, color: C.muted2, marginTop: 10 }}>Minst 8 tegn.</Text>

      {err ? <Text style={styles.err}>{err}</Text> : null}
      <Button title="Lagre og fortsett" onPress={submit} loading={loading} style={{ marginTop: 22 }} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 26, backgroundColor: C.surface },
  icon: { width: 56, height: 56, borderRadius: 16, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  h1: { fontSize: 26, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  sub: { fontSize: 15, color: C.muted, marginTop: 10, marginBottom: 22, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '700', color: C.slate, marginBottom: 6 },
  input: {
    height: 54, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line2, borderRadius: 14,
    paddingHorizontal: 16, fontSize: 16, color: C.ink,
  },
  err: { color: C.redInk, fontSize: 14, fontWeight: '600', marginTop: 14 },
});
