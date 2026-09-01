import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '../../api';
import { C, formatTime, formatDateLong, shiftDate } from '../../theme';
import { Button, Card, Pill } from '../../ui';

// Vakten. Å være logget inn er ikke nok til å få brannlisten på telefonen –
// man må ha tatt kveldens vakt ved å skanne koden som henger på adminsiden
// under Brannliste. Koden skifter hver natt, så vakten tas på nytt hver kveld.
//
// Serveren er den som håndhever dette (se requireWatchOnNative i
// routes/firelist.js). Denne skjermen er bare veien inn.
export default function VaktScreen({ user, onChanged, onLogout }) {
  const [status, setStatus] = useState(null);   // { nightDate, active, watchers }
  const [feil, setFeil] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanner, setScanner] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [refreshing, setRefreshing] = useState(false);
  // Kameraet fyrer av flere ganger på samme kode mens den er i bildet.
  const skannetRef = useRef(false);

  const last = useCallback(async () => {
    try { setStatus(await api('/api/firelist/watch/status')); }
    catch (ex) { setFeil(ex.message); }
  }, []);

  useEffect(() => { last(); }, [last]);

  const onRefresh = async () => { setRefreshing(true); await last(); setRefreshing(false); };

  async function åpneScanner() {
    setFeil('');
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r?.granted) { setFeil('Appen trenger tilgang til kameraet for å skanne vakt-koden.'); return; }
    }
    skannetRef.current = false;
    setScanner(true);
  }

  async function onScan({ data }) {
    if (skannetRef.current) return;
    skannetRef.current = true;
    setScanner(false);
    setBusy(true);
    try {
      const r = await api('/api/firelist/watch/register', { method: 'POST', body: { token: data } });
      setStatus({ nightDate: r.nightDate, active: true, watchers: r.watchers });
      setFeil('');
      onChanged?.();
    } catch (ex) {
      setFeil(ex.message);
    }
    setBusy(false);
  }

  async function giFraSeg() {
    setBusy(true);
    try { await api('/api/firelist/watch', { method: 'DELETE' }); await last(); onChanged?.(); }
    catch (ex) { setFeil(ex.message); }
    setBusy(false);
  }

  if (scanner) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.h1}>Skann vakt-koden</Text>
        <Text style={styles.p}>Koden finner du i adminsiden under Brannliste → «Vakt-kode».</Text>
        <View style={styles.scanBox}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onScan}
          />
          <View style={styles.frameTL} /><View style={styles.frameTR} />
          <View style={styles.frameBL} /><View style={styles.frameBR} />
        </View>
        <Button title="Avbryt" color="#fff" textColor={C.slate} fontSize={15} onPress={() => setScanner(false)}
          style={{ height: 48, borderWidth: 1.5, borderColor: '#d3dae2' }} />
      </View>
    );
  }

  const natt = status?.nightDate ? formatDateLong(shiftDate(status.nightDate, 1)) : '';
  const andre = (status?.watchers || []).filter((w) => w.id !== user.id);
  const meg = (status?.watchers || []).find((w) => w.id === user.id);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.surface }}
      contentContainerStyle={{ padding: 22, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.h1}>Vakt</Text>
      <Text style={styles.date}>{natt ? `Natt til ${natt}` : 'Henter…'}</Text>

      <View style={{ height: 18 }} />

      {status?.bypass ? (
        // App/Play Store-reviewer-kontoen. Vakt-QR-en henger på adminsiden på
        // skolen, så en reviewer kan ikke skanne seg til vakten – serveren gir
        // den i stedet. Sagt rett ut her, framfor en grønn «du har vakten» som
        // ikke stemmer med noen rad i vaktlista under.
        <Card style={{ borderColor: '#bfe3ce', backgroundColor: C.greenBg }}>
          <Pill tone="green" text="App Review" />
          <Text style={styles.kortTittel}>Vakten er gitt uten skanning</Text>
          <Text style={styles.kortTekst}>
            Denne testkontoen får brannlisten uten å skanne vakt-koden, siden koden
            henger på en skjerm på skolen. En vanlig administrator må skanne den
            hver kveld for å komme hit.
          </Text>
        </Card>
      ) : status?.active ? (
        <Card style={{ borderColor: '#bfe3ce', backgroundColor: C.greenBg }}>
          <Pill tone="green" text={meg ? `Vakt fra kl. ${formatTime(meg.registeredAt)}` : 'Vakt i natt'} />
          <Text style={styles.kortTittel}>Du har vakten i natt</Text>
          <Text style={styles.kortTekst}>
            Du ser brannlisten og kan kjøre opprop. Etter at innsjekken stenger får du
            et varsel med navnene på dem som ikke er gjort rede for.
          </Text>
          <Text style={styles.kortSmått}>Vakten gjelder til i morgen tidlig. I morgen kveld må koden skannes på nytt.</Text>
        </Card>
      ) : (
        <Card>
          <Pill tone="amber" text="Ingen vakt" />
          <Text style={styles.kortTittel}>Du har ikke tatt vakten</Text>
          <Text style={styles.kortTekst}>
            Skann vakt-koden på adminsiden under Brannliste for å ta kveldens vakt.
            Da får du brannlisten her, og varselet om hvem som mangler.
          </Text>
          <Button title="Skann vakt-koden" onPress={åpneScanner} loading={busy} style={{ marginTop: 18 }} />
        </Card>
      )}

      {feil ? <Text style={styles.feil}>{feil}</Text> : null}

      {andre.length ? (
        <View style={{ marginTop: 22 }}>
          <Text style={styles.seksjon}>{status.active ? 'PÅ VAKT SAMMEN MED DEG' : 'HAR VAKTEN I NATT'}</Text>
          {andre.map((w) => (
            <View key={w.id} style={styles.rad}>
              <View style={[styles.prikk, { backgroundColor: C.green }]} />
              <Text style={styles.radNavn}>{w.fullName}</Text>
              <Text style={styles.radTid}>{formatTime(w.registeredAt)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {status?.active && !status?.bypass ? (
        <Button title="Gi fra deg vakten" onPress={giFraSeg} loading={busy}
          color="#fff" textColor={C.redInk} fontSize={15}
          style={{ marginTop: 26, height: 48, borderWidth: 1.5, borderColor: '#e7c4c0' }} />
      ) : null}

      <View style={{ height: 14 }} />
      <Text style={styles.konto}>Innlogget som {user.fullName}</Text>
      <Button title="Logg ut" onPress={onLogout} color="#fff" textColor={C.slate} fontSize={15}
        style={{ marginTop: 10, height: 46, borderWidth: 1.5, borderColor: '#d3dae2' }} />
    </ScrollView>
  );
}

const FR = { position: 'absolute', width: 34, height: 34, borderColor: '#7fe3ad' };
const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 22, backgroundColor: C.surface },
  h1: { fontSize: 26, fontWeight: '800', color: C.ink, letterSpacing: -0.6 },
  date: { fontSize: 14, color: C.muted, marginTop: 5 },
  p: { fontSize: 14, color: C.muted, marginTop: 8, marginBottom: 12 },
  scanBox: { flex: 1, backgroundColor: '#0f1a2b', borderRadius: 22, overflow: 'hidden', marginBottom: 16, position: 'relative' },
  frameTL: { ...FR, top: 20, left: 20, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 10 },
  frameTR: { ...FR, top: 20, right: 20, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 10 },
  frameBL: { ...FR, bottom: 20, left: 20, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 10 },
  frameBR: { ...FR, bottom: 20, right: 20, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 10 },
  kortTittel: { fontSize: 20, fontWeight: '800', color: C.ink, marginTop: 14, letterSpacing: -0.4 },
  kortTekst: { fontSize: 14.5, color: C.slate, lineHeight: 21, marginTop: 8 },
  kortSmått: { fontSize: 13, color: C.muted, lineHeight: 19, marginTop: 12 },
  feil: { color: C.redInk, fontSize: 14, fontWeight: '600', marginTop: 16 },
  seksjon: { fontSize: 12, fontWeight: '800', color: C.muted2, letterSpacing: 0.4, marginBottom: 8 },
  rad: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: 1, borderTopColor: C.line },
  prikk: { width: 9, height: 9, borderRadius: 5 },
  radNavn: { flex: 1, fontSize: 16, fontWeight: '700', color: C.ink },
  radTid: { fontSize: 13, color: C.muted2, fontWeight: '600' },
  konto: { fontSize: 13, color: C.muted2, textAlign: 'center' },
});
