import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { C } from '../theme';
import { Button } from '../ui';

// Slipper eleven inn med Face ID / fingeravtrykk, med telefonens egen kode som
// reservevalg. For eleven er dette innloggingen – kontoen er allerede pålogget,
// men appen er låst ved hver åpning.
// (disableDeviceFallback: false). Vi lagrer altså ingen egen PIN – telefonens
// innebygde lås er både sikrere og mindre kode.
//
// Har telefonen verken biometri eller kode, kan vi ikke kreve noe: da ville
// eleven blitt permanent utestengt. Vi slipper dem inn, men sier fra.
export async function deviceLockLevel() {
  try {
    return await LocalAuthentication.getEnrolledLevelAsync();
  } catch {
    return LocalAuthentication.SecurityLevel.NONE;
  }
}

// Hva telefonens biometri heter for eleven: «Face ID» på iPhone med
// ansiktslås, «Touch ID» på eldre iPhone, «fingeravtrykk» på Android.
// Brukes i knappetekster, så appen ikke lover Face ID på en Android-telefon.
export async function biometriNavn() {
  if (Platform.OS !== 'ios') return 'fingeravtrykk';
  try {
    const typer = await LocalAuthentication.supportedAuthenticationTypesAsync();
    return typer.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION) ? 'Face ID' : 'Touch ID';
  } catch {
    return 'Face ID';
  }
}

export async function authenticate({ prompt = 'Logg inn i Kongshaug Elevapp' } = {}) {
  const level = await deviceLockLevel();
  if (level === LocalAuthentication.SecurityLevel.NONE) return { success: true, unprotected: true };
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      cancelLabel: 'Avbryt',
      disableDeviceFallback: false, // -> faller tilbake til telefonens kode
    });
    return { success: !!r.success };
  } catch {
    return { success: false };
  }
}

export default function LockScreen({ onUnlocked, onLogout }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [biometri, setBiometri] = useState(Platform.OS === 'ios' ? 'Face ID' : 'fingeravtrykk');

  useEffect(() => { biometriNavn().then(setBiometri).catch(() => {}); }, []);

  const tryUnlock = useCallback(async () => {
    setBusy(true);
    const r = await authenticate();
    setBusy(false);
    if (r.success) onUnlocked();
    else setFailed(true);
  }, [onUnlocked]);

  // Be om opplåsing med én gang skjermen vises.
  useEffect(() => { tryUnlock(); }, [tryUnlock]);

  return (
    <View style={styles.wrap}>
      <View style={styles.badge}><Text style={{ fontSize: 44 }}>🏠</Text></View>
      <Text style={styles.title}>Kongshaug Elevapp</Text>
      <Text style={styles.sub}>
        {failed
          ? 'Innloggingen ble avbrutt. Prøv igjen for å fortsette.'
          : `Logg inn med ${biometri} eller koden din.`}
      </Text>
      <View style={{ height: 22 }} />
      <Button title="Logg inn" onPress={tryUnlock} loading={busy} style={{ alignSelf: 'stretch' }} />
      <View style={{ height: 10 }} />
      <Button title="Logg ut" color="#fff" textColor={C.slate} fontSize={15} onPress={onLogout}
        style={{ alignSelf: 'stretch', height: 46, borderWidth: 1.5, borderColor: '#d3dae2' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 34, backgroundColor: C.surface },
  badge: {
    width: 96, height: 96, borderRadius: 28, backgroundColor: '#e7edf5',
    alignItems: 'center', justifyContent: 'center', marginBottom: 22,
  },
  title: { fontSize: 24, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  sub: { fontSize: 15, color: C.muted, textAlign: 'center', lineHeight: 22, marginTop: 10 },
});
