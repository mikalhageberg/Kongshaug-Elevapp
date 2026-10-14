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
export function TildelPrikkerModal({ elev, onClose, onLagret }) {
  const sheetInsets = useSheetInsets();
  const [kategorier, setKategorier] = useState(null);
  const [valgt, setValgt] = useState(null);
  const [antall, setAntall] = useState('');
  const [grunn, setGrunn] = useState('');
  const [feil, setFeil] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!elev) return;
    setValgt(null); setAntall(''); setGrunn(''); setFeil(''); setBusy(false);
  }, [elev]);
  // Kategoriene hentes én gang, første gang dialogen åpnes.
  useEffect(() => {
    if (!elev || kategorier) return;
    api('/api/demerits/categories').then((r) => setKategorier(r.categories)).catch((ex) => setFeil(ex.message));
  }, [elev, kategorier]);

  const kat = kategorier?.find((c) => c.key === valgt);
  const medTall = kat && (kat.custom || kat.minPoints != null);

  function velg(c) {
    setValgt(c.key); setFeil('');
    setAntall(c.custom ? '' : c.minPoints != null ? prikkTall(c.minPoints) : '');
  }

  async function lagre() {
    if (!kat) { setFeil('Velg en kategori.'); return; }
    setBusy(true); setFeil('');
    try {
      const r = await api('/api/demerits', {
        method: 'POST',
        body: { userId: elev.id, category: kat.key, reason: grunn, ...(medTall ? { points: antall } : {}) },
      });
      Alert.alert('Prikker tildelt', `${elev.fullName} fikk ${prikkTekst(r.points)}.`);
      onLagret?.();
    } catch (ex) {
      setFeil(ex.message);
      setBusy(false);
    }
  }

  return (
    <Modal visible={!!elev} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <KeyboardAvoidingView behavior="padding" style={[styles.wrap, sheetInsets]}>
        <View style={styles.head}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>Tildel prikker</Text>
            <Text style={styles.under} numberOfLines={1}>{elev?.fullName}{elev?.room ? ` · Rom ${elev.room}` : ''}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}><Text style={{ fontSize: 22, color: C.muted2 }}>✕</Text></Pressable>
        </View>

        <KeyboardScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 8 }} keyboardShouldPersistTaps="handled">
          {!kategorier && !feil ? <Text style={styles.tom}>Laster kategorier …</Text> : null}
          {(kategorier || []).map((c) => {
            const på = valgt === c.key;
            return (
              <Pressable key={c.key} onPress={() => velg(c)} style={[styles.kat, på && styles.katPå]}
                accessibilityRole="radio" accessibilityState={{ selected: på }}>
                <View style={[styles.radio, på && { borderColor: C.navy }]}>{på ? <View style={styles.radioFyll} /> : null}</View>
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
            );
          })}

          {medTall ? (
            <>
              <Text style={styles.label}>Antall prikker</Text>
              <TextField
                value={antall}
                onChangeText={setAntall}
                placeholder="F.eks. 1,5"
                placeholderTextColor={C.muted2}
                keyboardType="decimal-pad"
                style={[styles.input, { maxWidth: 160 }]}
              />
            </>
          ) : null}

          <Text style={styles.label}>Begrunnelse (valgfritt)</Text>
          <TextField
            value={grunn}
            onChangeText={setGrunn}
            placeholder="Vises for eleven"
            placeholderTextColor={C.muted2}
            multiline
            maxLength={500}
            style={[styles.input, { height: 96, paddingTop: 14, textAlignVertical: 'top' }]}
          />
        </KeyboardScrollView>

        <View style={styles.footer}>
          {feil ? <View style={styles.errorBox}><Text style={styles.errorText}>{feil}</Text></View> : null}
          <Button title={kat ? `Tildel ${medTall ? '' : prikkTekst(kat.points)}`.trim() : 'Tildel prikker'} onPress={lagre} loading={busy} disabled={!kat} />
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
                        <Text style={styles.postDato}>{formatDateLong(lokalDato(x.createdAt))} kl. {formatTime(x.createdAt)}</Text>
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
  kat: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 8,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line2, borderRadius: 14,
  },
  katPå: { borderColor: C.navy, backgroundColor: '#f4f7fb' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  radioFyll: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.navy },
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
