import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api, resolveCampusStatus, getFreshPosition } from '../api';
import { C, formatTime, formatDateLong } from '../theme';
import { Button, Banner, campusBanner } from '../ui';

export default function AndaktScreen({ user }) {
  // status: loading | scanning | result
  const [status, setStatus] = useState('loading');
  const [result, setResult] = useState(null); // { kind:'present'|'late'|'error', ... }
  const [permission, requestPermission] = useCameraPermissions();
  const [geoText, setGeoText] = useState(campusBanner(null));
  const [win, setWin] = useState(null); // tidsvindu for QR (åpner/stengte kl. …)
  const [bypassBusy, setBypassBusy] = useState(false);
  const scannedRef = useRef(false);

  // Kun App/Play Store-reviewer-kontoen (serveren bestemmer dette, ikke appen).
  // En reviewer har ingen storskjerm å skanne QR fra, så uten dette ville de
  // stått fast på kameraskjermen og aldri fått testet funksjonen.
  const canSkipQr = !!user?.appReviewBypass;

  const cancelGeo = useRef(null);
  useEffect(() => () => cancelGeo.current?.(), []);

  useEffect(() => {
    (async () => {
      const s = await api('/api/andakt/status').catch(() => ({ registered: false }));
      if (s.andaktToday === false) { setStatus('noandakt'); return; }
      if (s.registered) {
        setResult({ kind: s.status, checkedAt: s.checkedAt, date: s.sessionDate });
        setStatus('result');
        return;
      }
      // QR-en er bare tilgjengelig ±30 min rundt fristen. Reviewer-kontoen har
      // ingen storskjerm og får gå videre til kameraet uansett.
      if (s.qrOpen === false && !canSkipQr) { setWin(s); setStatus('closed'); return; }
      if (!permission?.granted) await requestPermission();
      // Kun til visning. Koordinaten som registreres hentes fersk ved skanning.
      cancelGeo.current = resolveCampusStatus((st) => setGeoText(campusBanner(st)));
      setStatus('scanning');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onScan({ data }) {
    if (scannedRef.current) return;
    scannedRef.current = true;
    // Fersk posisjon i det QR-en skannes. QR-koden er gyldig i et halvt minutt
    // til, så det er tid nok – og da er det eleven som står her nå som
    // registreres, ikke der telefonen var da kameraet ble åpnet.
    let coords;
    try {
      coords = await getFreshPosition();
    } catch (ex) {
      setResult({ kind: 'error', code: 'nogps', message: ex.message });
      setStatus('result');
      return;
    }
    try {
      const r = await api('/api/andakt/checkin', {
        method: 'POST',
        body: { token: data, ...coords },
      });
      setResult({ kind: r.status, checkedAt: r.checkedAt, date: r.sessionDate });
    } catch (ex) {
      setResult({ kind: 'error', code: ex.code, message: ex.message });
    }
    setStatus('result');
  }

  // Registrer uten å skanne QR. Serveren godtar dette KUN for reviewer-kontoen
  // – for alle andre svarer den med "ugyldig QR-kode", som er riktig.
  async function registerWithoutQr() {
    setBypassBusy(true);
    try {
      const coords = await getFreshPosition().catch(() => ({}));
      const r = await api('/api/andakt/checkin', {
        method: 'POST',
        body: { token: 'app-review', ...coords },
      });
      setResult({ kind: r.status, checkedAt: r.checkedAt, date: r.sessionDate });
    } catch (ex) {
      setResult({ kind: 'error', code: ex.code, message: ex.message });
    }
    setBypassBusy(false);
    setStatus('result');
  }

  function scanAgain() {
    scannedRef.current = false;
    setResult(null);
    setStatus('scanning');
  }

  if (status === 'loading') {
    return <View style={styles.center}><Text style={{ color: C.muted }}>Laster…</Text></View>;
  }

  if (status === 'noandakt') {
    return (
      <View style={styles.center}>
        <View style={[styles.ringBig, { backgroundColor: '#eef1f5' }]}>
          <View style={[styles.ringInner, { backgroundColor: C.muted2 }]}><Text style={styles.tick}>📖</Text></View>
        </View>
        <Text style={styles.title}>Ingen andakt i dag</Text>
        <Text style={styles.sub}>Det er andakt på ukedager (mandag–fredag).</Text>
      </View>
    );
  }

  if (status === 'closed') {
    const before = win?.qrState === 'before';
    return (
      <View style={styles.center}>
        <View style={[styles.ringBig, { backgroundColor: before ? C.amberBg : '#eef1f5' }]}>
          <View style={[styles.ringInner, { backgroundColor: before ? C.amber : C.muted2 }]}><Text style={styles.tick}>🕘</Text></View>
        </View>
        <Text style={styles.title}>{before ? 'Registrering åpner snart' : 'Andakten er over'}</Text>
        <Text style={styles.sub}>
          {before ? `Du kan registrere oppmøte på andakt fra kl. ${win.opensAt}.` : `Registreringen stengte kl. ${win.closesAt}.`}
        </Text>
      </View>
    );
  }

  if (status === 'result') {
    return <ResultView result={result} onAgain={scanAgain} />;
  }

  // scanning
  return (
    <View style={styles.wrap}>
      <Text style={styles.h1}>Registrer oppmøte på andakt</Text>
      <Text style={styles.p}>Skann QR-koden som vises på storskjerm.</Text>

      <View style={styles.scanBox}>
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onScan}
          />
        ) : (
          <View style={styles.center}>
            <Text style={{ color: '#9fb0c6', textAlign: 'center', padding: 20 }}>
              Appen trenger tilgang til kamera for å skanne QR-koden.
            </Text>
            <Button title="Gi kameratilgang" onPress={requestPermission} style={{ marginTop: 12 }} />
          </View>
        )}
        <View style={styles.frameTL} /><View style={styles.frameTR} />
        <View style={styles.frameBL} /><View style={styles.frameBR} />
      </View>

      <Banner tone={geoText.tone} text={geoText.text} />

      {canSkipQr ? (
        <>
          <View style={{ height: 10 }} />
          <Button title="Registrer oppmøte uten QR (testkonto)" onPress={registerWithoutQr}
            loading={bypassBusy} color="#fff" textColor={C.navy} fontSize={15}
            style={{ height: 48, borderWidth: 1.5, borderColor: '#d3dae2' }} />
        </>
      ) : null}
    </View>
  );
}

function ResultView({ result, onAgain }) {
  if (result.kind === 'present' || result.kind === 'late') {
    const late = result.kind === 'late';
    return (
      <View style={styles.center}>
        <View style={[styles.ringBig, { backgroundColor: late ? C.amberBg : C.greenBg }]}>
          <View style={[styles.ringInner, { backgroundColor: late ? C.amber : C.green }]}>
            <Text style={styles.tick}>{late ? '!' : '✓'}</Text>
          </View>
        </View>
        <Text style={styles.title}>{late ? 'Registrert etter fristen' : 'Oppmøte registrert'}</Text>
        {late ? (
          <View style={[styles.warnBox]}>
            <Text style={{ color: C.amberInk, fontWeight: '600', textAlign: 'center' }}>
              Oppmøtet ditt kl. {formatTime(result.checkedAt)} er etter fristen og kan telle som fravær.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sub}>Andakt · {formatDateLong(result.date)}</Text>
            <View style={styles.timePill}><Text style={{ fontWeight: '700', color: C.ink }}>🕘 Registrert kl. {formatTime(result.checkedAt)}</Text></View>
          </>
        )}
        <View style={{ height: 24 }} />
        <Button title="Ferdig" onPress={onAgain} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  // error
  const offsite = result.code === 'offsite';
  const expired = result.code === 'expired';
  const closed = result.code === 'closed';
  const nogps = result.code === 'nogps';
  const nett = result.code === 'network';
  return (
    <View style={styles.center}>
      <View style={[styles.ringBig, { backgroundColor: closed ? C.amberBg : C.redBg }]}>
        <View style={[styles.ringInner, { backgroundColor: closed ? C.amber : C.red }]}><Text style={styles.tick}>{closed ? '🕘' : nett ? '📶' : offsite || nogps ? '📍' : '✕'}</Text></View>
      </View>
      <Text style={styles.title}>
        {offsite ? 'Du er ikke på skolens område'
          : nett ? 'Fikk ikke kontakt med serveren'
          : nogps ? 'Fikk ikke posisjonen din'
          : closed ? 'Registreringen er stengt'
          : expired ? 'QR-koden er ikke gyldig lenger'
          : 'Ugyldig QR-kode'}
      </Text>
      <Text style={styles.sub}>{result.message}</Text>
      <View style={{ height: 24 }} />
      <Button title={closed ? 'Tilbake' : offsite || nogps || nett ? 'Prøv igjen' : 'Skann på nytt'} onPress={onAgain} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

const FR = { position: 'absolute', width: 34, height: 34, borderColor: '#7fe3ad' };
const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 22, backgroundColor: C.surface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 34, backgroundColor: C.surface },
  h1: { fontSize: 22, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  p: { fontSize: 14, color: C.muted, marginTop: 8, marginBottom: 12 },
  scanBox: { flex: 1, backgroundColor: '#0f1a2b', borderRadius: 22, overflow: 'hidden', marginBottom: 16, position: 'relative' },
  frameTL: { ...FR, top: 20, left: 20, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 10 },
  frameTR: { ...FR, top: 20, right: 20, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 10 },
  frameBL: { ...FR, bottom: 20, left: 20, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 10 },
  frameBR: { ...FR, bottom: 20, right: 20, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 10 },
  ringBig: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  ringInner: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center' },
  tick: { color: '#fff', fontSize: 34, fontWeight: '800' },
  title: { fontSize: 24, fontWeight: '800', color: C.ink, textAlign: 'center', letterSpacing: -0.5 },
  sub: { fontSize: 15, color: C.muted, textAlign: 'center', lineHeight: 22, marginTop: 12 },
  timePill: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line2, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10, marginTop: 12 },
  warnBox: { backgroundColor: C.amberBg, borderWidth: 1, borderColor: '#f0dca0', borderRadius: 14, padding: 14, marginTop: 16 },
});
