// Prikkesystemet i appen: tildelingsdialogen vakten åpner fra brannlisten, og
// elevens egen oversikt under Internat.
//
// Vakten får ALDRI se hvor mange prikker eleven har fra før – dialogen viser
// bare kategoriene, og serveren sender ingen sum tilbake ved tildeling.

import React, { useState, useEffect, useCallback } from 'react';
import { Modal, View, Text, Pressable, KeyboardAvoidingView, StyleSheet, Alert, RefreshControl, ScrollView } from 'react-native';
import { api } from './api';
import { C, formatDateLong, formatTime } from './theme';
import { Button, useSheetInsets } from './ui';
import { KeyboardScrollView, TextField } from './keyboard';

// 1,5 – ikke 1.5. «1 prikk», ellers «prikker».
export const prikkTall = (n) => String(Math.round(n * 2) / 2).replace('.', ',');
export const prikkTekst = (n) => `${prikkTall(n)} ${n === 1 ? 'prikk' : 'prikker'}`;

// SQLite-tid («2026-10-14 18:36:40», UTC) → «2026-10-14» i lokal tid.
function lokalDato(iso) {
  const d = new Date(String(iso).replace(' ', 'T') + 'Z');
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ── Tildel prikker ───────────────────────────────────────────
// elev: { id, fullName, room } eller null (lukket).
//
// To steg. Steg 1: kryss av én eller flere hendelser («Egendefinert» og
// rusmidler får et tallfelt). Steg 2: se over og skriv en valgfri
// begrunnelse. Begrunnelsen har et eget steg for at den ikke skal gå under
// nederst i en lang liste. Hver hendelse blir sin egen tildeling.
export function TildelPrikkerModal({ elev, onClose, onLagret }) {
  const sheetInsets = useSheetInsets();
  const [kategorier, setKategorier] = useState(null);
  // kategori-nøkkel → antall (tekst). Tom tekst for dem uten tallfelt.
  const [valgt, setValgt] = useState({});
  const [steg, setSteg] = useState(1);
  const [grunn, setGrunn] = useState('');
  const [feil, setFeil] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!elev) return;
    setValgt({}); setSteg(1); setGrunn(''); setFeil(''); setBusy(false);
  }, [elev]);
  // Kategoriene hentes én gang, første gang dialogen åpnes.
  useEffect(() => {
    if (!elev || kategorier) return;
    api('/api/demerits/categories').then((r) => setKategorier(r.categories)).catch((ex) => setFeil(ex.message));
  }, [elev, kategorier]);

  const medTall = (c) => c.custom || c.minPoints != null;
  const poengFor = (c) => (medTall(c) ? Number(String(valgt[c.key] ?? '').trim().replace(',', '.')) : c.points);
  const valgte = (kategorier || []).filter((c) => c.key in valgt);
  const sum = valgte.reduce((s, c) => s + (poengFor(c) || 0), 0);

  function veksle(c) {
    setFeil('');
    setValgt((før) => {
      const n = { ...før };
      if (c.key in n) delete n[c.key];
      else n[c.key] = c.custom ? '' : c.minPoints != null ? prikkTall(c.minPoints) : '';
      return n;
    });
  }

  function neste() {
    if (!valgte.length) { setFeil('Velg minst én hendelse.'); return; }
    const mangler = valgte.find((c) => medTall(c) && !(poengFor(c) > 0));
    if (mangler) { setFeil(`Skriv inn antall prikker for «${mangler.label}».`); return; }
    const forLavt = valgte.find((c) => c.minPoints != null && poengFor(c) < c.minPoints);
    if (forLavt) { setFeil(`«${forLavt.label}» gir minst ${prikkTall(forLavt.minPoints)} prikker.`); return; }
    setFeil(''); setSteg(2);
  }

  async function lagre() {
    setBusy(true); setFeil('');
    try {
      const r = await api('/api/demerits', {
        method: 'POST',
        body: {
          userId: elev.id,
          reason: grunn,
          items: valgte.map((c) => ({ category: c.key, ...(medTall(c) ? { points: valgt[c.key] } : {}) })),
        },
      });
      Alert.alert('Prikker tildelt', `${elev.fullName} fikk ${prikkTekst(r.points)}.`);
      onLagret?.();
    } catch (ex) {
      setFeil(ex.message);
      setBusy(false);
    }
  }

  const oppsummert = valgte.length ? `${valgte.length} ${valgte.length === 1 ? 'hendelse' : 'hendelser'} · ${prikkTekst(sum)}` : 'Ingen valgt';

  return (
    <Modal visible={!!elev} animationType="slide" onRequestClose={steg === 2 ? () => setSteg(1) : onClose} presentationStyle="pageSheet">
      <KeyboardAvoidingView behavior="padding" style={[styles.wrap, sheetInsets]}>
        <View style={styles.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>Tildel prikker</Text>
            <Text style={styles.under} numberOfLines={1}>
              {steg === 1 ? 'Steg 1 av 2: Velg hendelser' : 'Steg 2 av 2: Begrunnelse'} · {elev?.fullName}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}><Text style={{ fontSize: 22, color: C.muted2 }}>✕</Text></Pressable>
        </View>

        {steg === 1 ? (
          <KeyboardScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 4 }} keyboardShouldPersistTaps="handled">
            {!kategorier && !feil ? <Text style={styles.tom}>Laster kategorier …</Text> : null}
            {kategorier ? <Text style={styles.hint}>Du kan velge flere.</Text> : null}
            {(kategorier || []).map((c) => {
              const på = c.key in valgt;
              return (
                <View key={c.key} style={[styles.kat, på && styles.katPå]}>
                  <Pressable onPress={() => veksle(c)} style={styles.katRad}
                    accessibilityRole="checkbox" accessibilityState={{ checked: på }}>
                    <View style={[styles.boks, på && styles.boksPå]}>{på ? <Text style={styles.boksTegn}>✓</Text> : null}</View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.katTekst}>{c.label}</Text>
                      {c.note ? <Text style={styles.katNote}>{c.note}</Text> : null}
                    </View>
                    <View style={[styles.poeng, c.custom && { backgroundColor: '#eef1f5' }]}>
                      <Text style={[styles.poengTekst, c.custom && { color: C.slate }]}>
                        {c.custom ? 'Velg selv' : c.minPoints != null ? `${prikkTall(c.minPoints)} +` : prikkTall(c.points)}
                      </Text>
                    </View>
                  </Pressable>
                  {på && medTall(c) ? (
                    <View style={styles.antallRad}>
                      <Text style={styles.antallLabel}>Antall prikker</Text>
                      <TextField
                        value={valgt[c.key]}
                        onChangeText={(t) => setValgt((før) => ({ ...før, [c.key]: t }))}
                        placeholder="F.eks. 1,5"
                        placeholderTextColor={C.muted2}
                        keyboardType="decimal-pad"
                        autoFocus={c.custom}
                        style={[styles.input, { height: 44, width: 110 }]}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </KeyboardScrollView>
        ) : (
          <KeyboardScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
            <View style={styles.oversikt}>
              {valgte.map((c, i) => (
                <View key={c.key} style={[styles.oversiktRad, i > 0 && { borderTopWidth: 1, borderTopColor: '#f2f4f6' }]}>
                  <View style={styles.poeng}><Text style={styles.poengTekst}>{prikkTall(poengFor(c))}</Text></View>
                  <Text style={[styles.katTekst, { flex: 1 }]}>{c.label}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.grunnLabel}>Begrunnelse <Text style={{ fontWeight: '600', color: C.muted2 }}>(valgfritt)</Text></Text>
            <TextField
              value={grunn}
              onChangeText={setGrunn}
              placeholder="Hva skjedde? Eleven ser begrunnelsen sammen med prikkene."
              placeholderTextColor={C.muted2}
              multiline
              autoFocus
              maxLength={500}
              style={[styles.input, { height: 130, paddingTop: 14, textAlignVertical: 'top' }]}
            />
          </KeyboardScrollView>
        )}

        <View style={styles.footer}>
          {feil ? <View style={styles.errorBox}><Text style={styles.errorText}>{feil}</Text></View> : null}
          <Text style={styles.oppsummert}>{oppsummert}</Text>
          {steg === 1 ? (
            <Button title="Neste" onPress={neste} disabled={!valgte.length} />
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Tilbake" onPress={() => { setFeil(''); setSteg(1); }} disabled={busy} color="#fff" textColor={C.slate} style={{ flex: 1, borderWidth: 1.5, borderColor: C.line2 }} />
              <Button title="Tildel" onPress={lagre} loading={busy} style={{ flex: 1.4 }} />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Mine prikker (eleven) ────────────────────────────────────
export function MinePrikkerModal({ visible, onClose }) {
  const sheetInsets = useSheetInsets();
  const [d, setD] = useState(null);
  const [feil, setFeil] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const last = useCallback(async () => {
    try { setD(await api('/api/demerits/me')); setFeil(''); }
    catch (ex) { setFeil(ex.message); }
  }, []);
  useEffect(() => { if (visible) last(); }, [visible, last]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={[styles.wrap, sheetInsets]}>
        <View style={styles.head}>
          <Text style={styles.title}>Mine prikker</Text>
          <Pressable onPress={onClose} hitSlop={12}><Text style={{ fontSize: 22, color: C.muted2 }}>✕</Text></Pressable>
        </View>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await last(); setRefreshing(false); }} />}
        >
          {!d ? <Text style={styles.tom}>{feil || 'Laster …'}</Text> : (
            <>
              <View style={[styles.sum, d.total > 0 && { backgroundColor: C.amberBg }]}>
                <Text style={[styles.sumTall, d.total > 0 && { color: C.amberInk }]}>{prikkTall(d.total)}</Text>
                <Text style={[styles.sumUnder, d.total > 0 && { color: C.amberInk }]}>{d.total === 1 ? 'prikk' : 'prikker'} totalt</Text>
              </View>
              {d.items.length ? (
                <>
                  <Text style={styles.seksjon}>OVERSIKT</Text>
                  {d.items.map((x) => (
                    <View key={x.id} style={styles.post}>
                      <View style={styles.poeng}><Text style={styles.poengTekst}>{prikkTall(x.points)}</Text></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.postTittel}>{x.categoryLabel}</Text>
                        {x.reason ? <Text style={styles.postGrunn}>{x.reason}</Text> : null}
                        {/* Prikker fra før appen har ingen egen dato – bare merkelappen. */}
                        {x.category === 'tidligere' ? null : (
                          <Text style={styles.postDato}>{formatDateLong(lokalDato(x.createdAt))} kl. {formatTime(x.createdAt)}</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </>
              ) : (
                <Text style={styles.tom}>Du har ingen prikker. Bra jobba!</Text>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.surface },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 20, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: C.ink },
  under: { fontSize: 14, color: C.muted, fontWeight: '600', marginTop: 2 },
  tom: { textAlign: 'center', color: C.muted2, fontSize: 15, fontWeight: '600', marginTop: 24 },
  hint: { fontSize: 13.5, color: C.muted, marginTop: 2, marginBottom: 2 },
  kat: { marginTop: 8, backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line2, borderRadius: 14 },
  katPå: { borderColor: C.navy, backgroundColor: '#f4f7fb' },
  katRad: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  boks: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.line2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  boksPå: { backgroundColor: C.navy, borderColor: C.navy },
  boksTegn: { color: '#fff', fontSize: 14, fontWeight: '900', lineHeight: 16 },
  antallRad: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 48, paddingRight: 14, paddingBottom: 12 },
  antallLabel: { fontSize: 13, fontWeight: '700', color: C.slate },
  oversikt: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 14, overflow: 'hidden' },
  oversiktRad: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  grunnLabel: { fontSize: 16, fontWeight: '800', color: C.ink, marginTop: 22, marginBottom: 8 },
  oppsummert: { fontSize: 14, fontWeight: '700', color: C.slate, textAlign: 'center', marginBottom: 10 },
  katTekst: { fontSize: 15.5, fontWeight: '700', color: C.ink, lineHeight: 21 },
  katNote: { fontSize: 13, fontWeight: '700', color: C.redInk, marginTop: 2 },
  poeng: { minWidth: 40, paddingHorizontal: 9, height: 28, borderRadius: 999, backgroundColor: C.amberBg, alignItems: 'center', justifyContent: 'center' },
  poengTekst: { fontSize: 13.5, fontWeight: '800', color: C.amberInk },
  label: { fontSize: 13, fontWeight: '700', color: C.slate, marginBottom: 6, marginTop: 18 },
  input: { height: 52, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line2, borderRadius: 14, paddingHorizontal: 16, fontSize: 16, color: C.ink },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: C.line },
  errorBox: { backgroundColor: C.redBg, borderWidth: 1, borderColor: C.red, borderRadius: 12, padding: 12, marginBottom: 10 },
  errorText: { fontSize: 14, fontWeight: '700', color: C.redInk },
  sum: { alignItems: 'center', paddingVertical: 22, borderRadius: 20, backgroundColor: '#eef1f5' },
  sumTall: { fontSize: 44, fontWeight: '800', color: C.slate, letterSpacing: -1 },
  sumUnder: { fontSize: 14, fontWeight: '700', color: C.slate, marginTop: 2 },
  seksjon: { fontSize: 11, fontWeight: '800', color: C.muted2, letterSpacing: 0.5, marginTop: 24, marginBottom: 8 },
  post: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, marginBottom: 8,
    backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 14,
  },
  postTittel: { fontSize: 15.5, fontWeight: '700', color: C.ink, lineHeight: 21 },
  postGrunn: { fontSize: 14, color: C.slate, marginTop: 4, lineHeight: 20 },
  postDato: { fontSize: 12.5, color: C.muted2, fontWeight: '600', marginTop: 6 },
});
