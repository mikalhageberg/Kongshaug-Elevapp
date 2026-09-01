import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { api } from '../../api';
import { C, formatTime, formatNight } from '../../theme';

// Varslingssenteret: kveldens varslinger, slik de ble sendt.
//
// Et push-varsel er flyktig – det kan komme mens telefonen ligger i lommen,
// bli sveipet bort, eller ha gått ut før vakten tok vakten. Her blir de
// liggende. Serveren skriver raden selv om utsendingen feilet, så et varsel
// som aldri nådde låseskjermen finnes likevel her.
//
// Uleste merkes med en farget kant og tonet bakgrunn. Merkingen som lest skjer
// i det skjermen åpnes, men de fetes fortsatt opp i denne visningen: hadde de
// bleknet under fingeren, ville man mistet nettopp det man kom for å se.

const IKON = { vakt: '🔥', beskjed: '📣' };

export default function VarslerScreen({ onLest }) {
  const [d, setD] = useState(null);
  const [feil, setFeil] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const last = useCallback(async () => {
    try {
      const r = await api('/api/notifications');
      setD(r);
      setFeil('');
      // Telleren nullstilles med én gang senteret er åpnet.
      if (r.unread) {
        await api('/api/notifications/read', { method: 'POST' }).catch(() => {});
        onLest?.();
      }
    } catch (ex) { setFeil(ex.message); }
  }, [onLest]);

  useEffect(() => { last(); }, [last]);

  const onRefresh = async () => { setRefreshing(true); await last(); setRefreshing(false); };

  if (!d) {
    return (
      <View style={styles.midt}>
        <Text style={{ color: C.muted }}>{feil || 'Laster varsler…'}</Text>
      </View>
    );
  }

  // Grupper på natten varselet hører til. Kveldens ligger øverst.
  const grupper = [];
  for (const v of d.notifications) {
    const siste = grupper[grupper.length - 1];
    if (siste && siste.nightDate === v.nightDate) siste.varsler.push(v);
    else grupper.push({ nightDate: v.nightDate, varsler: [v] });
  }
  const tittelFor = (nightDate) => {
    if (nightDate === d.nightDate) return 'I kveld';
    const t = formatNight(nightDate);
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.surface }}
      contentContainerStyle={{ padding: 18, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.h1}>Varsler</Text>
      <Text style={styles.date}>Varslene du har fått, nyeste først</Text>

      {feil ? <Text style={styles.feil}>{feil}</Text> : null}

      {!d.notifications.length ? (
        <View style={styles.tomt}>
          <Text style={{ fontSize: 40, marginBottom: 14 }}>🔔</Text>
          <Text style={styles.tomtTittel}>Ingen varsler ennå</Text>
          <Text style={styles.tomtTekst}>
            Varselet om hvem som mangler kommer etter at innsjekken stenger, til
            den som har tatt vakten. Beskjeder fra adminsiden havner også her.
          </Text>
        </View>
      ) : grupper.map((g) => (
        <View key={g.nightDate} style={{ marginTop: 22 }}>
          <Text style={styles.seksjon}>{tittelFor(g.nightDate).toUpperCase()}</Text>
          {g.varsler.map((v) => (
            <View key={v.id} style={[styles.kort, !v.read && styles.kortUlest]}>
              <View style={styles.kortTopp}>
                <Text style={styles.ikon}>{IKON[v.kind] || '🔔'}</Text>
                <Text style={styles.merke}>{v.kindLabel}</Text>
                {!v.read ? <View style={styles.ulestPrikk} /> : null}
                <View style={{ flex: 1 }} />
                <Text style={styles.tid}>{formatTime(v.createdAt)}</Text>
              </View>
              <Text style={styles.tittel}>{v.title}</Text>
              <Text style={styles.tekst}>{v.body}</Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  midt: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 34, backgroundColor: C.surface },
  h1: { fontSize: 26, fontWeight: '800', color: C.ink, letterSpacing: -0.6 },
  date: { fontSize: 14, color: C.muted, marginTop: 5 },
  feil: { color: C.redInk, fontSize: 14, fontWeight: '600', marginTop: 14 },
  seksjon: { fontSize: 12, fontWeight: '800', color: C.muted2, letterSpacing: 0.5, marginBottom: 9 },
  kort: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18,
    padding: 16, marginBottom: 11,
  },
  // Uleste får en tydelig kant i venstre marg, ikke bare en annen farge – det
  // leses også i sollys og av den som ikke skiller fargenyanser.
  kortUlest: { borderLeftWidth: 5, borderLeftColor: C.navy, backgroundColor: '#f7f9fc' },
  kortTopp: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9 },
  ikon: { fontSize: 15 },
  merke: { fontSize: 12, fontWeight: '800', color: C.muted2, letterSpacing: 0.4, textTransform: 'uppercase' },
  ulestPrikk: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.navy },
  tid: { fontSize: 13, color: C.muted2, fontWeight: '600' },
  tittel: { fontSize: 17.5, fontWeight: '800', color: C.ink, letterSpacing: -0.3 },
  tekst: { fontSize: 15, color: C.slate, lineHeight: 22, marginTop: 6 },
  tomt: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  tomtTittel: { fontSize: 19, fontWeight: '800', color: C.ink },
  tomtTekst: { fontSize: 14.5, color: C.muted, textAlign: 'center', lineHeight: 21, marginTop: 10 },
});
