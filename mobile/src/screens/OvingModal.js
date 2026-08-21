// Øvekonkurransen: eleven varmer opp, øver, og registrerer økten.
//
// Klokken eies av serveren. Appen får starttidspunktet og teller videre lokalt
// bare for å tegne tallene – hvor lang økten ble, avgjøres av serverens egne
// tidsstempler. Lukkes appen midt i en økt, plukkes den samme økten opp igjen
// der den var når skjermen åpnes på nytt.

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, View, Text, Image, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api, uploadBase64 } from '../api';
import { C, formatDateLong } from '../theme';
import { Button, Card, Banner } from '../ui';
import CountdownDial from '../CountdownDial';

// «01:23:45» / «12:04» – timer vises først når økten er over en time.
function klokke(sek) {
  const n = Math.max(0, Math.floor(sek));
  const t = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  const p = (x) => String(x).padStart(2, '0');
  return t ? `${t}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

function varighet(sek) {
  const n = Math.max(0, Math.round(sek || 0));
  if (n < 60) return `${n} sek`;
  const t = Math.floor(n / 3600);
  const m = Math.round((n % 3600) / 60);
  if (!t) return `${m} min`;
  return m ? `${t} t ${m} min` : `${t} t`;
}

// Datostempelet, i formen gamle digitalkameraer brente inn: «2026 08 21  19:42».
function stempel(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()} ${p(d.getMonth() + 1)} ${p(d.getDate())}  ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function OvingModal({ visible, onClose }) {
  const [status, setStatus] = useState(null);
  const [økt, setØkt] = useState(null);          // pågående økt
  const [nå, setNå] = useState(0);               // sekunder gått, tegnet lokalt
  const [busy, setBusy] = useState(false);
  const [feil, setFeil] = useState(null);
  const [kameraPå, setKameraPå] = useState(false);
  const [bilde, setBilde] = useState(null);      // { base64, uri, tid }
  const [tillatelse, beOmTillatelse] = useCameraPermissions();
  const kamera = useRef(null);
  // Serverens fasit: sekunder gått ved siste svar, og klokkeslettet vi fikk det.
  const grunnlag = useRef({ sek: 0, ved: 0 });

  const settØkt = useCallback((s) => {
    setØkt(s);
    grunnlag.current = { sek: s?.elapsedSeconds ?? 0, ved: Date.now() };
    setNå(s?.elapsedSeconds ?? 0);
  }, []);

  const last = useCallback(async () => {
    const d = await api('/api/practice/status').catch(() => null);
    setStatus(d);
    settØkt(d?.pending || null);
  }, [settØkt]);

  useEffect(() => {
    if (!visible) return;
    setFeil(null); setBilde(null); setKameraPå(false);
    last();
  }, [visible, last]);

  // Tikk bare mens en økt faktisk løper – en stoppet økt skal stå stille.
  const løper = !!økt && !økt.stoppedAt && !økt.pausedAt;
  useEffect(() => {
    if (!visible || !løper) return;
    const id = setInterval(() => {
      setNå(grunnlag.current.sek + (Date.now() - grunnlag.current.ved) / 1000);
    }, 250);
    return () => clearInterval(id);
  }, [visible, løper]);

  const oppvarming = økt?.warmupSeconds ?? status?.warmupSeconds ?? 0;
  const iOppvarming = !!økt && nå < oppvarming;
  const gjenstår = Math.max(0, oppvarming - nå);
  const stoppet = !!økt?.stoppedAt;
  const pauset = !!økt?.pausedAt && !stoppet;

  async function kjør(fn) {
    setBusy(true); setFeil(null);
    try { await fn(); } catch (ex) { setFeil(ex.message); } finally { setBusy(false); }
  }

  const start = () => kjør(async () => {
    const d = await api('/api/practice/start', { method: 'POST' });
    settØkt(d.session);
  });

  const pause = () => kjør(async () => {
    const d = await api(`/api/practice/${økt.id}/pause`, { method: 'POST' });
    settØkt(d.session);
  });

  const fortsett = () => kjør(async () => {
    const d = await api(`/api/practice/${økt.id}/resume`, { method: 'POST' });
    settØkt(d.session);
  });

  const stopp = () => kjør(async () => {
    const d = await api(`/api/practice/${økt.id}/stop`, { method: 'POST' });
    settØkt(d.session);
    setNå(d.session.elapsedSeconds);
  });

  const avbryt = () => kjør(async () => {
    await api(`/api/practice/${økt.id}`, { method: 'DELETE' });
    setBilde(null);
    await last();
  });

  const registrer = () => kjør(async () => {
    await api(`/api/practice/${økt.id}/finish`, { method: 'POST' });
    setBilde(null);
    await last();
  });

  async function taBilde() {
    if (!kamera.current) return;
    setBusy(true); setFeil(null);
    try {
      const foto = await kamera.current.takePictureAsync({ quality: 0.5, base64: true, skipProcessing: true });
      setBilde({ base64: foto.base64, uri: foto.uri, tid: new Date() });
      setKameraPå(false);
    } catch {
      setFeil('Kunne ikke ta bildet. Prøv igjen.');
    } finally {
      setBusy(false);
    }
  }

  const lastOppBilde = () => kjør(async () => {
    await uploadBase64(`/api/practice/${økt.id}/photo`, bilde.base64);
    const d = await api('/api/practice/status');
    setStatus(d);
    settØkt(d.pending);
    setNå(d.pending?.elapsedSeconds ?? nå);
    setBilde(null);
  });

  async function åpneKamera() {
    if (!tillatelse?.granted) {
      const r = await beOmTillatelse();
      if (!r.granted) { setFeil('Appen trenger tilgang til kameraet for å dokumentere økten.'); return; }
    }
    setFeil(null);
    setKameraPå(true);
  }

  const comp = status?.competition;
  const måHaBilde = !!økt?.photoRequired && !økt?.hasPhoto;

  // ── Kameraskjerm ───────────────────────────────────────────
  if (visible && kameraPå) {
    return (
      <Modal visible animationType="slide" onRequestClose={() => setKameraPå(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView ref={kamera} style={{ flex: 1 }} facing="back" />
          <View style={styles.kameraTekst}>
            <Text style={styles.kameraTittel}>Dokumenter økten</Text>
            <Text style={styles.kameraHjelp}>
              Ta gjerne bilde av instrumentet, notestativet eller rommet – helst ikke av deg selv
              eller andre. Bildet lagres hos skolen sammen med økten.
            </Text>
          </View>
          <View style={styles.kameraKnapper}>
            <Pressable onPress={() => setKameraPå(false)} hitSlop={12}>
              <Text style={styles.kameraAvbryt}>Avbryt</Text>
            </Pressable>
            <Pressable onPress={taBilde} disabled={busy} style={styles.utløser}>
              <View style={styles.utløserKjerne} />
            </Pressable>
            <View style={{ width: 62 }} />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: C.surface }}>
        <View style={styles.topp}>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Øvekonkurranse</Text>
            {comp?.configured ? (
              <Text style={styles.sub}>
                {formatDateLong(comp.startDate)} – {formatDateLong(comp.endDate)}
              </Text>
            ) : null}
          </View>
          <Pressable onPress={onClose} hitSlop={12}><Text style={styles.lukk}>Lukk</Text></Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
          {status == null ? <ActivityIndicator color={C.navy} /> : null}

          {feil ? <View style={{ marginBottom: 14 }}><Banner tone="red" text={feil} /></View> : null}

          {status && !comp.active ? (
            <Banner text={comp.configured
              ? '🎻 Konkurransen er ikke åpen akkurat nå.'
              : '🎻 Ingen øvekonkurranse er satt opp for øyeblikket.'} />
          ) : null}

          {/* ── Bilde tatt: vis det med stempel før det sendes ── */}
          {bilde ? (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <View>
                {/* Stempelet tegnes over bildet ved visning – det brennes ikke
                    inn i filen. Serveren står for tidspunktet, så det er likt
                    her og i admin, og kan ikke settes av telefonen. */}
                <View style={styles.bilderamme}>
                  <Image source={{ uri: bilde.uri }} style={styles.bildeboks} resizeMode="cover" />
                  <Text style={styles.stempel}>{stempel(bilde.tid)}</Text>
                </View>
                <View style={{ padding: 18 }}>
                  <Text style={styles.kortTittel}>Bruke dette bildet?</Text>
                  <Text style={styles.kortSub}>Stempelet med dato og klokkeslett legges på automatisk.</Text>
                  <Button title="Bruk bildet" onPress={lastOppBilde} loading={busy} style={{ marginTop: 14 }} />
                  <Button title="Ta på nytt" color="#fff" textColor={C.slate} onPress={åpneKamera}
                    style={{ marginTop: 10, borderWidth: 1.5, borderColor: '#d3dae2' }} />
                </View>
              </View>
            </Card>
          ) : null}

          {/* ── Pågående økt ── */}
          {!bilde && økt ? (
            <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
              {iOppvarming ? (
                <>
                  <Text style={styles.fase}>OPPVARMING</Text>
                  <View style={{ marginTop: 16, marginBottom: 18 }}>
                    <CountdownDial remaining={gjenstår} total={oppvarming}>
                      <Text style={styles.dialTall}>{klokke(gjenstår)}</Text>
                      <Text style={styles.dialSub}>igjen</Text>
                    </CountdownDial>
                  </View>
                  <Text style={styles.hjelp}>
                    {pauset
                      ? 'Oppvarmingen står på pause. Trykk «Fortsett» når du er klar.'
                      : 'Varm opp før du begynner å øve. Stoppeklokken tar over av seg selv når skiven er tom, og oppvarmingen teller med i tiden din.'}
                  </Text>
                  <Button title={pauset ? 'Fortsett' : 'Pause'} onPress={pauset ? fortsett : pause} loading={busy}
                    color={pauset ? C.navy : '#fff'} textColor={pauset ? '#fff' : C.slate}
                    style={{ marginTop: 20, alignSelf: 'stretch', ...(pauset ? {} : { borderWidth: 1.5, borderColor: '#d3dae2' }) }} />
                  <Button title="Avbryt økten" color="#fff" textColor={C.slate} onPress={avbryt} loading={busy}
                    style={{ marginTop: 10, alignSelf: 'stretch', borderWidth: 1.5, borderColor: '#d3dae2' }} />
                </>
              ) : (
                <>
                  <Text style={styles.fase}>{stoppet ? 'ØKTEN ER STOPPET' : pauset ? 'PÅ PAUSE' : 'ØVER NÅ'}</Text>
                  <Text style={[styles.stoppeklokke, pauset && { color: C.muted2 }]}>{klokke(nå)}</Text>
                  <Text style={styles.hjelp}>
                    {pauset
                      ? 'Tiden står stille. Trykk «Fortsett» når du begynner igjen.'
                      : `${varighet(oppvarming)} oppvarming er regnet med i tiden.`}
                    {økt.pausedSeconds ? ` ${varighet(økt.pausedSeconds)} pause er ikke regnet med.` : ''}
                  </Text>

                  {!stoppet ? (
                    <>
                      <Button title={pauset ? 'Fortsett' : 'Pause'} onPress={pauset ? fortsett : pause} loading={busy}
                        color={pauset ? C.navy : '#fff'} textColor={pauset ? '#fff' : C.slate}
                        style={{ marginTop: 22, alignSelf: 'stretch', ...(pauset ? {} : { borderWidth: 1.5, borderColor: '#d3dae2' }) }} />
                      <Button title="Stopp og registrer" onPress={stopp} loading={busy}
                        style={{ marginTop: 10, alignSelf: 'stretch' }} />
                    </>
                  ) : måHaBilde ? (
                    <>
                      <View style={{ marginTop: 18, alignSelf: 'stretch' }}>
                        <Banner tone="amber" text={'📷 Denne økten må dokumenteres med et bilde før den kan registreres.'} />
                      </View>
                      <Text style={styles.personvern}>
                        Ta bilde av instrumentet, notestativet eller rommet – helst ikke av deg selv eller andre.
                      </Text>
                      <Button title="Ta bilde" onPress={åpneKamera} style={{ marginTop: 14, alignSelf: 'stretch' }} />
                    </>
                  ) : (
                    <Button title="Registrer øving" onPress={registrer} loading={busy}
                      style={{ marginTop: 22, alignSelf: 'stretch' }} />
                  )}

                  <Button title="Avbryt økten" color="#fff" textColor={C.slate} onPress={avbryt} loading={busy}
                    style={{ marginTop: 10, alignSelf: 'stretch', borderWidth: 1.5, borderColor: '#d3dae2' }} />
                </>
              )}
            </Card>
          ) : null}

          {/* ── Ingen økt: start en ny ── */}
          {!bilde && !økt && status ? (
            <>
              <Card style={{ alignItems: 'center', paddingVertical: 26 }}>
                <Text style={styles.fase}>DIN TOTALTID</Text>
                <Text style={styles.total}>{varighet(status.totalSeconds)}</Text>
                <Text style={styles.hjelp}>
                  {status.sessions.length
                    ? `${status.sessions.length} registrert${status.sessions.length === 1 ? ' økt' : 'e økter'} i perioden`
                    : 'Ingen registrerte økter ennå'}
                </Text>
                {comp?.active ? (
                  <Button title="Start øving" onPress={start} loading={busy} style={{ marginTop: 22, alignSelf: 'stretch' }} />
                ) : null}
              </Card>
              {comp?.active ? (
                <Text style={styles.hjelpUnder}>
                  Økten begynner med {varighet(status.warmupSeconds)} obligatorisk oppvarming. Av og til blir du
                  bedt om å ta et bilde som dokumenterer økten.
                </Text>
              ) : null}
            </>
          ) : null}

          {/* ── Mine økter ── */}
          {!bilde && status?.sessions?.length ? (
            <View style={{ marginTop: 26 }}>
              <Text style={styles.h2}>Mine økter</Text>
              {status.sessions.map((o) => (
                <Card key={o.id} style={styles.øktRad}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.øktDato}>{formatDateLong(o.sessionDate)}</Text>
                    {o.hasPhoto ? <Text style={styles.øktSub}>📷 Dokumentert</Text> : null}
                  </View>
                  <Text style={styles.øktTid}>{varighet(o.totalSeconds)}</Text>
                </Card>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  topp: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 12 },
  h1: { fontSize: 22, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  h2: { fontSize: 17, fontWeight: '800', color: C.ink, marginBottom: 8 },
  sub: { fontSize: 13, fontWeight: '700', color: C.muted2, marginTop: 2 },
  lukk: { fontSize: 15, fontWeight: '700', color: C.navy },
  fase: { fontSize: 12, fontWeight: '800', color: C.muted2, letterSpacing: 1.2 },
  dialTall: { fontSize: 40, fontWeight: '800', color: C.ink, fontVariant: ['tabular-nums'] },
  dialSub: { fontSize: 13, fontWeight: '700', color: C.muted2, marginTop: 2 },
  stoppeklokke: { fontSize: 54, fontWeight: '800', color: C.ink, marginVertical: 10, fontVariant: ['tabular-nums'] },
  total: { fontSize: 40, fontWeight: '800', color: C.ink, marginVertical: 8 },
  hjelp: { fontSize: 13.5, color: C.muted, textAlign: 'center', lineHeight: 19, paddingHorizontal: 8 },
  hjelpUnder: { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 19, marginTop: 14, paddingHorizontal: 10 },
  personvern: { fontSize: 12.5, color: C.muted, textAlign: 'center', lineHeight: 18, marginTop: 12, paddingHorizontal: 6 },
  kortTittel: { fontSize: 16, fontWeight: '800', color: C.ink },
  kortSub: { fontSize: 13, color: C.muted, marginTop: 3 },
  bilderamme: { backgroundColor: '#0b0e13', position: 'relative' },
  bildeboks: { width: '100%', aspectRatio: 3 / 4 },
  stempel: {
    position: 'absolute', right: 14, bottom: 12,
    fontFamily: 'Courier', fontWeight: '700', fontSize: 16, color: '#ffa22b',
    letterSpacing: 1.2, textShadowColor: 'rgba(255,120,0,0.7)', textShadowRadius: 6,
  },
  øktRad: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, paddingVertical: 14 },
  øktDato: { fontSize: 14.5, fontWeight: '700', color: C.ink },
  øktSub: { fontSize: 12.5, fontWeight: '600', color: C.muted2, marginTop: 2 },
  øktTid: { fontSize: 15, fontWeight: '800', color: C.ink },
  kameraTekst: { position: 'absolute', top: 60, left: 22, right: 22 },
  kameraTittel: { color: '#fff', fontSize: 18, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6 },
  kameraHjelp: { color: '#fff', fontSize: 13.5, lineHeight: 19, marginTop: 6, textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 6 },
  kameraKnapper: {
    position: 'absolute', bottom: 44, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 30,
  },
  kameraAvbryt: { color: '#fff', fontSize: 16, fontWeight: '700', width: 62 },
  utløser: { width: 74, height: 74, borderRadius: 37, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  utløserKjerne: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
});
