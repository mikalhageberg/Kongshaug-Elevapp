import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { api } from '../../api';
import { C, formatTime, formatNight } from '../../theme';

// Varslingssenteret: varslene fra vakten du står i nå.
//
// Et push-varsel er flyktig – det kan komme mens telefonen ligger i lommen,
// bli sveipet bort, eller ha gått ut før du rakk å skanne koden. Her blir de
// liggende. Serveren skriver raden selv om utsendingen feilet, så et varsel
// som aldri nådde låseskjermen finnes likevel her.
//
// Siden starter TOM når vakten begynner. Gårsdagens varsler er ikke ditt
// problem i kveld, og en side som allerede er full gjør at kveldens ene
// viktige beskjed drukner. De er ikke borte: de ligger under «Tidligere
// vakter», så lenge lagringstiden for varsler sier.
//
// Uleste merkes med farget kant og tonet bakgrunn. Merkingen som lest skjer i
// det skjermen åpnes, men de fetes fortsatt opp i denne visningen: hadde de
// bleknet under fingeren, ville man mistet nettopp det man kom for å se.

const IKON = { vakt: '🔥', beskjed: '📣' };

export default function VarslerScreen({ onLest }) {
  const [d, setD] = useState(null);
  const [feil, setFeil] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [visTidligere, setVisTidligere] = useState(false);

  const last = useCallback(async () => {
    try {
      const r = await api('/api/notifications');
      setD(r);
      setFeil('');
      if (r.unread) {
        await api('/api/notifications/read', { method: 'POST' }).catch(() => {});
        onLest?.();
      }
    } catch (ex) { setFeil(ex.message); }
  }, [onLest]);

  useEffect(() => { last(); }, [last]);

  const onRefresh = async () => { setRefreshing(true); await last(); setRefreshing(false); };

  if (!d) {
    return <View style={styles.midt}><Text style={{ color: C.muted }}>{feil || 'Laster varsler…'}</Text></View>;
  }

  const harVakt = !!d.watchStartedAt;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.surface }}
      contentContainerStyle={{ padding: 18, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.h1}>Varsler</Text>
      <Text style={styles.date}>
        {harVakt ? `Vakten din, fra kl. ${formatTime(d.watchStartedAt)}` : 'Du har ikke tatt vakten'}
      </Text>

      {feil ? <Text style={styles.feil}>{feil}</Text> : null}

      {d.current.length
        ? d.current.map((v) => <VarselKort key={v.id} v={v} />)
        : <Tomt harVakt={harVakt} />}

      {d.earlier.length ? (
        <View style={{ marginTop: 26 }}>
          <Pressable onPress={() => setVisTidligere(!visTidligere)} style={styles.tidligereKnapp}>
            <Text style={styles.tidligereTekst}>
              {visTidligere ? 'Skjul tidligere vakter' : `Tidligere vakter (${d.earlier.length})`}
            </Text>
            <Text style={styles.pil}>{visTidligere ? '▲' : '▼'}</Text>
          </Pressable>

          {visTidligere ? grupperPåNatt(d.earlier).map((g) => (
            <View key={g.nightDate} style={{ marginTop: 18 }}>
              <Text style={styles.seksjon}>{storForbokstav(formatNight(g.nightDate)).toUpperCase()}</Text>
              {g.varsler.map((v) => <VarselKort key={v.id} v={v} dempet />)}
            </View>
          )) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

// Varslene gruppert på natten de hørte til. Rekkefølgen er allerede nyeste
// først, så nettene kommer i riktig orden av seg selv.
function grupperPåNatt(varsler) {
  const grupper = [];
  for (const v of varsler) {
    const siste = grupper[grupper.length - 1];
    if (siste && siste.nightDate === v.nightDate) siste.varsler.push(v);
    else grupper.push({ nightDate: v.nightDate, varsler: [v] });
  }
  return grupper;
}
const storForbokstav = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function VarselKort({ v, dempet }) {
  return (
    <View style={[styles.kort, !v.read && !dempet && styles.kortUlest, dempet && styles.kortDempet]}>
      <View style={styles.kortTopp}>
        <Text style={styles.ikon}>{IKON[v.kind] || '🔔'}</Text>
        <Text style={styles.merke}>{v.kindLabel}</Text>
        {!v.read && !dempet ? <View style={styles.ulestPrikk} /> : null}
        <View style={{ flex: 1 }} />
        <Text style={styles.tid}>{formatTime(v.createdAt)}</Text>
      </View>
      <Text style={styles.tittel}>{v.title}</Text>
      <Text style={styles.tekst}>{v.body}</Text>
    </View>
  );
}

function Tomt({ harVakt }) {
  return (
    <View style={styles.tomt}>
      <Text style={{ fontSize: 40, marginBottom: 14 }}>{harVakt ? '🔔' : '🛡️'}</Text>
      <Text style={styles.tomtTittel}>{harVakt ? 'Ingenting ennå i kveld' : 'Ingen vakt'}</Text>
      <Text style={styles.tomtTekst}>
        {harVakt
          ? 'Varselet om hvem som mangler kommer etter at innsjekken stenger. Beskjeder fra adminsiden havner også her.'
          : 'Varslene fra vakten din vises her. Ta vakten under fanen «Vakt» for å begynne.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  midt: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 34, backgroundColor: C.surface },
  h1: { fontSize: 26, fontWeight: '800', color: C.ink, letterSpacing: -0.6 },
  date: { fontSize: 14, color: C.muted, marginTop: 5, marginBottom: 18 },
  feil: { color: C.redInk, fontSize: 14, fontWeight: '600', marginBottom: 14 },
  seksjon: { fontSize: 12, fontWeight: '800', color: C.muted2, letterSpacing: 0.5, marginBottom: 9 },
  kort: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18,
    padding: 16, marginBottom: 11,
  },
  // Uleste får en tydelig kant i venstre marg, ikke bare en annen farge – det
  // leses også i sollys og av den som ikke skiller fargenyanser.
  kortUlest: { borderLeftWidth: 5, borderLeftColor: C.navy, backgroundColor: '#f7f9fc' },
  // Tidligere vakter er oppslag, ikke beskjeder. De skal ikke konkurrere med
  // kveldens om oppmerksomheten.
  kortDempet: { backgroundColor: 'transparent', borderColor: C.line2 },
  kortTopp: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9 },
  ikon: { fontSize: 15 },
  merke: { fontSize: 12, fontWeight: '800', color: C.muted2, letterSpacing: 0.4, textTransform: 'uppercase' },
  ulestPrikk: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.navy },
  tid: { fontSize: 13, color: C.muted2, fontWeight: '600' },
  tittel: { fontSize: 17.5, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  tekst: { fontSize: 15, color: C.slate, lineHeight: 22, marginTop: 6 },
  tomt: { alignItems: 'center', paddingVertical: 54, paddingHorizontal: 20 },
  tomtTittel: { fontSize: 19, fontWeight: '800', color: C.ink },
  tomtTekst: { fontSize: 14.5, color: C.muted, textAlign: 'center', lineHeight: 21, marginTop: 10 },
  tidligereKnapp: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderTopWidth: 1, borderTopColor: C.line,
  },
  tidligereTekst: { fontSize: 15, fontWeight: '700', color: C.slate },
  pil: { fontSize: 10, color: C.muted2 },
});
