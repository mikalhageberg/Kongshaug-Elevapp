import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from 'react-native';
import { api } from '../../api';
import { C, formatTime, formatDateLong, shiftDate } from '../../theme';
import { Button, Card } from '../../ui';
import OppropScreen from './OppropScreen';

// Brannlisten på telefonen: samme oversikt som adminsiden viser, gruppert på
// internat, men bygget for en hånd i en mørk gang i stedet for en iPad på et
// bord. Statusknappene er 52 px – større enn nettsidens 48 – fordi de treffes
// i bevegelse.
//
// Krever gyldig vakt. Uten den svarer serveren 403 «no-watch», og skjermen
// sender vakten videre til QR-skanningen i stedet for å vise en feilmelding.

const STATUSER = [
  { key: 'present', tegn: '✓', farge: C.green, tittel: 'Til stede' },
  { key: 'away', tegn: '⌂', farge: C.navy, tittel: 'Borte' },
  { key: 'clear', tegn: '✕', farge: C.red, tittel: 'Fjern' },
];

export default function BrannlisteAdminScreen({ onNeedWatch }) {
  const [d, setD] = useState(null);
  const [feil, setFeil] = useState('');
  const [filter, setFilter] = useState('Alle');
  const [opprop, setOpprop] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Eleven knappen ble trykket på, mens serveren svarer. Uten den ser raden
  // uendret ut i det halve sekundet kallet tar, og man trykker en gang til.
  const [venter, setVenter] = useState(null);

  const last = useCallback(async () => {
    try { setD(await api('/api/firelist/overview')); setFeil(''); }
    catch (ex) { setFeil(ex.code === 'no-watch' ? 'no-watch' : ex.message); }
  }, []);

  useEffect(() => { last(); }, [last]);

  const onRefresh = async () => { setRefreshing(true); await last(); setRefreshing(false); };

  async function settStatus(userId, status) {
    setVenter(userId);
    try { await api('/api/firelist/admin-checkin', { method: 'POST', body: { userId, status } }); await last(); }
    catch (ex) { setFeil(ex.code === 'no-watch' ? 'no-watch' : ex.message); }
    setVenter(null);
  }

  if (feil === 'no-watch') {
    return (
      <View style={styles.midt}>
        <Text style={{ fontSize: 46, marginBottom: 18 }}>🔒</Text>
        <Text style={styles.h1c}>Du har ikke vakten</Text>
        <Text style={styles.pc}>
          Brannlisten er åpen for den som har tatt kveldens vakt. Skann vakt-koden
          på adminsiden under Brannliste, så får du lista her.
        </Text>
        <View style={{ height: 22 }} />
        <Button title="Ta vakten" onPress={onNeedWatch} style={{ alignSelf: 'stretch' }} />
      </View>
    );
  }

  if (!d) {
    return (
      <View style={styles.midt}>
        <Text style={{ color: C.muted }}>{feil || 'Laster brannlisten…'}</Text>
        {feil ? <Button title="Prøv igjen" onPress={last} style={{ marginTop: 18, alignSelf: 'stretch' }} /> : null}
      </View>
    );
  }

  if (opprop) {
    return <OppropScreen overview={d} onClose={() => setOpprop(false)} onDone={last} />;
  }

  const internater = ['Alle', ...d.dorms.map((x) => x.dorm)];
  const vist = filter === 'Alle' ? d.dorms : d.dorms.filter((x) => x.dorm === filter);

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <ScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.h1}>Brannliste</Text>
        <Text style={styles.date}>Natt til {formatDateLong(shiftDate(d.nightDate, 1))}</Text>

        <View style={styles.tall}>
          <Tall stor tekst={`${d.present} / ${d.total}`} under="til stede" bg={C.navy} fg="#fff" />
          <Tall tekst={String(d.away)} under="borte" bg="#e7edf5" fg={C.navy} />
          <Tall tekst={String(d.missing)} under="mangler" bg={d.missing ? C.redBg : '#e7edf5'} fg={d.missing ? C.redInk : C.navy} />
        </View>

        <Button title="Start opprop" onPress={() => setOpprop(true)} style={{ marginTop: 16, height: 60 }} fontSize={19} />

        {feil ? <Text style={styles.feil}>{feil}</Text> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 20, marginHorizontal: -18 }}
          contentContainerStyle={{ paddingHorizontal: 18, gap: 9 }}>
          {internater.map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)}
              style={[styles.chip, filter === f && { backgroundColor: C.navy, borderColor: C.navy }]}>
              <Text style={[styles.chipTekst, filter === f && { color: '#fff' }]}>{f}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {vist.map((dorm) => {
          const gjester = dorm.guests || [];
          const vertIder = new Set(dorm.students.map((s) => s.id));
          return (
            <Card key={dorm.dorm} style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
              <View style={styles.dormTopp}>
                <Text style={styles.dormNavn}>{dorm.dorm}</Text>
                <Text style={styles.dormTall}>
                  {dorm.present} av {dorm.total}{gjester.length ? ` · ${gjester.length} gjest${gjester.length > 1 ? 'er' : ''}` : ''}
                </Text>
              </View>
              {dorm.students.map((s) => (
                <View key={s.id}>
                  <ElevRad elev={s} venter={venter === s.id} onSett={settStatus} />
                  {gjester.filter((g) => g.hostId === s.id).map((g) => <GjestRad key={g.id} gjest={g} sammeInternat />)}
                </View>
              ))}
              {gjester.filter((g) => !vertIder.has(g.hostId)).map((g) => <GjestRad key={g.id} gjest={g} />)}
            </Card>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ElevRad({ elev, venter, onSett }) {
  const farge = elev.status === 'present' ? C.green : elev.status === 'away' ? C.navy : C.red;
  const bg = elev.status === 'missing' ? '#fdf5f4' : elev.status === 'away' ? '#f6f8fb' : '#fff';
  return (
    <View style={[styles.rad, { backgroundColor: bg, opacity: venter ? 0.5 : 1 }]}>
      <View style={[styles.prikk, { backgroundColor: farge }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.navn} numberOfLines={1}>{elev.fullName}</Text>
        <Text style={styles.under}>
          Rom {elev.room ?? '–'}
          {elev.status === 'present' && elev.checkedAt ? ` · ${formatTime(elev.checkedAt)}` : ''}
        </Text>
      </View>
      <View style={styles.knapper}>
        {STATUSER.map((k) => {
          // «Fjern» er den aktive knappen når eleven ikke er registrert – da er
          // det den som viser hvor eleven står, ikke hva et trykk vil gjøre.
          const aktiv = k.key === 'clear' ? elev.status === 'missing' : elev.status === k.key;
          return (
            <Pressable
              key={k.key}
              disabled={venter}
              onPress={() => onSett(elev.id, k.key)}
              style={[styles.knapp, aktiv ? { backgroundColor: k.farge, borderColor: k.farge } : null]}
            >
              <Text style={[styles.knappTegn, aktiv && { color: '#fff' }]}>{k.tegn}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function GjestRad({ gjest, sammeInternat }) {
  return (
    <View style={[styles.rad, { backgroundColor: '#fbf6ee' }]}>
      <View style={[styles.prikk, { backgroundColor: C.amber }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.navn} numberOfLines={1}>{gjest.name}</Text>
        <Text style={[styles.under, { color: C.amberInk }]}>
          Rom {gjest.room ?? '–'} · Gjest hos {gjest.hostName}{sammeInternat ? '' : ` (${gjest.hostDorm || '–'})`}
        </Text>
      </View>
    </View>
  );
}

function Tall({ tekst, under, bg, fg, stor }) {
  return (
    <View style={[styles.tallBoks, { backgroundColor: bg, flex: stor ? 1.5 : 1 }]}>
      <Text style={[styles.tallStor, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>{tekst}</Text>
      <Text style={[styles.tallUnder, { color: fg }]}>{under}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  midt: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 34, backgroundColor: C.surface },
  h1: { fontSize: 26, fontWeight: '800', color: C.ink, letterSpacing: -0.6 },
  h1c: { fontSize: 23, fontWeight: '800', color: C.ink, textAlign: 'center', letterSpacing: -0.5 },
  pc: { fontSize: 15, color: C.muted, textAlign: 'center', lineHeight: 22, marginTop: 12 },
  date: { fontSize: 14, color: C.muted, marginTop: 5 },
  feil: { color: C.redInk, fontSize: 14, fontWeight: '600', marginTop: 14 },
  tall: { flexDirection: 'row', gap: 9, marginTop: 18 },
  tallBoks: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center' },
  tallStor: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  tallUnder: { fontSize: 12.5, fontWeight: '700', marginTop: 3, opacity: 0.85 },
  chip: {
    height: 44, paddingHorizontal: 18, borderRadius: 999, borderWidth: 1.5, borderColor: C.line2,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  chipTekst: { fontSize: 14.5, fontWeight: '700', color: C.slate },
  dormTopp: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 13, backgroundColor: '#f7f8fa', borderBottomWidth: 1, borderBottomColor: C.line,
  },
  dormNavn: { fontSize: 17, fontWeight: '800', color: C.ink },
  dormTall: { fontSize: 13.5, fontWeight: '700', color: C.muted2 },
  rad: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    paddingLeft: 15, paddingRight: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f2f4f6',
  },
  prikk: { width: 9, height: 9, borderRadius: 5 },
  navn: { fontSize: 17, fontWeight: '700', color: C.ink },
  under: { fontSize: 13, color: C.muted2, fontWeight: '600', marginTop: 2 },
  knapper: { flexDirection: 'row', gap: 7 },
  knapp: {
    width: 52, height: 52, borderRadius: 13, borderWidth: 1.5, borderColor: C.line2,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  knappTegn: { fontSize: 20, fontWeight: '800', color: C.muted2 },
});
