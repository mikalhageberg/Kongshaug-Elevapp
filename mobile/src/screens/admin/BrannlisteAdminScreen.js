import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, Alert, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { api } from '../../api';
import { C, formatTime, formatDateLong, shiftDate, senAnkomstTekst } from '../../theme';
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
  // Eleven dialogen «kommer etter fristen» står åpen for, eller null.
  const [sen, setSen] = useState(null);

  const last = useCallback(async () => {
    try { setD(await api('/api/firelist/overview')); setFeil(''); }
    catch (ex) { setFeil(ex.code === 'no-watch' ? 'no-watch' : ex.message); }
  }, []);

  useEffect(() => { last(); }, [last]);

  const onRefresh = async () => { setRefreshing(true); await last(); setRefreshing(false); };

  // Opprop er en evakueringsrutine, ikke en måte å se over lista på. Hver
  // «Til stede» skriver rett i brannlisten, så en runde tatt «bare for å prøve»
  // markerer elever som gjort rede for uten at noen har sett dem – og da er
  // lista verdiløs akkurat den natten den trengs.
  //
  // Derfor en dialog man må ta stilling til, og ikke bare en tekst på skjermen
  // etterpå: den som er på vei inn hit i en travel kveld, leser ikke brødtekst.
  function startOpprop() {
    Alert.alert(
      'Opprop – kun ved evakuering',
      'Denne skal brukes når internatene evakueres, ikke for å sjekke lista en vanlig kveld.\n\n'
      + 'Hvert trykk på «Til stede» skriver rett i brannlisten. En elev som ikke har '
      + 'registrert seg selv ennå, blir stående som til stede fordi du trykket – ikke '
      + 'fordi eleven selv har registrert seg.',
      [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Vi evakuerer', style: 'destructive', onPress: () => setOpprop(true) },
      ],
    );
  }

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

        <Button title="Opprop ved evakuering" onPress={startOpprop} style={{ marginTop: 16, height: 60 }} fontSize={19} />
        <Text style={styles.hint}>Trykk på et navn for å merke at eleven kommer etter fristen.</Text>

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
                  <ElevRad elev={s} venter={venter === s.id} onSett={settStatus} onSen={setSen} />
                  {gjester.filter((g) => g.hostId === s.id).map((g) => <GjestRad key={g.id} gjest={g} sammeInternat />)}
                </View>
              ))}
              {gjester.filter((g) => !vertIder.has(g.hostId)).map((g) => <GjestRad key={g.id} gjest={g} />)}
            </Card>
          );
        })}
      </ScrollView>
      <SenAnkomstModal elev={sen} onClose={() => setSen(null)} onLagret={async () => { setSen(null); await last(); }} />
    </View>
  );
}

function ElevRad({ elev, venter, onSett, onSen }) {
  const farge = elev.status === 'present' ? C.green : elev.status === 'away' ? C.navy : C.red;
  const bg = elev.status === 'missing' ? '#fdf5f4' : elev.status === 'away' ? '#f6f8fb' : '#fff';
  const senTekst = senAnkomstTekst(elev.lateArrival);
  return (
    <View style={[styles.rad, { backgroundColor: bg, opacity: venter ? 0.5 : 1 }]}>
      <View style={[styles.prikk, { backgroundColor: farge }]} />
      <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => onSen(elev)} hitSlop={{ top: 8, bottom: 8 }}>
        <Text style={styles.navn} numberOfLines={2}>{elev.fullName}</Text>
        <Text style={styles.under}>
          Rom {elev.room ?? '–'}
          {elev.status === 'present' && elev.checkedAt ? ` · ${formatTime(elev.checkedAt)}` : ''}
        </Text>
        {senTekst ? <Text style={styles.sen}>🕘 {senTekst}</Text> : null}
      </Pressable>
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
        <Text style={styles.navn} numberOfLines={2}>{gjest.name}</Text>
        <Text style={[styles.under, { color: C.amberInk }]}>
          Rom {gjest.room ?? '–'} · Gjest hos {gjest.hostName}{sammeInternat ? '' : ` (${gjest.hostDorm || '–'})`}
        </Text>
      </View>
    </View>
  );
}

// «Kommer etter fristen»: vakten vet at eleven har lov til å komme sent, og
// vil slippe å lete. To valg – et klokkeslett, eller ukjent – og «Fjern
// merket» når det alt står ett. Merket er en beskjed på raden, ikke en status:
// eleven står som mangler til hun faktisk registrerer seg.
//
// Klokkeslettet skrives i et vanlig tekstfelt, ikke en tidsvelger: den ville
// krevd en ny innebygd modul, og dermed en ny appversjon i butikkene. «2330»
// og «23.30» rettes til «23:30» ved lagring.
function normTid(s) {
  const d = String(s || '').replace(/\D/g, '');
  if (d.length === 3) return `0${d[0]}:${d.slice(1)}`;
  if (d.length === 4) return `${d.slice(0, 2)}:${d.slice(2)}`;
  return String(s || '').trim();
}
function SenAnkomstModal({ elev, onClose, onLagret }) {
  const har = !!elev?.lateArrival;
  const [modus, setModus] = useState('time');
  const [tid, setTid] = useState('');
  const [feil, setFeil] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!elev) return;
    setModus(har && !elev.lateArrival.expectedAt ? 'unknown' : 'time');
    setTid(elev.lateArrival?.expectedAt || '');
    setFeil(''); setBusy(false);
  }, [elev, har]);

  async function send(body) {
    setBusy(true); setFeil('');
    try {
      if (body) await api('/api/firelist/late-arrival', { method: 'POST', body: { userId: elev.id, ...body } });
      else await api(`/api/firelist/late-arrival/${elev.id}`, { method: 'DELETE' });
      await onLagret();
    } catch (ex) { setFeil(ex.message); setBusy(false); }
  }
  function lagre() {
    if (modus === 'unknown') return send({ expectedAt: null });
    const v = normTid(tid);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { setFeil('Skriv klokkeslettet som 23:30, eller velg «Tidspunkt ukjent».'); return; }
    send({ expectedAt: v });
  }

  return (
    <Modal visible={!!elev} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBg}>
        <Pressable style={StyleSheet.absoluteFill} onPress={busy ? undefined : onClose} />
        <View style={styles.modal}>
          <Text style={styles.modalH}>Kommer etter fristen</Text>
          <Text style={styles.modalUnder}>{elev?.fullName} · Rom {elev?.room ?? '–'}</Text>
          <Text style={styles.modalP}>Eleven står som «mangler» til registreringen er gjort, men lista viser at eleven er ventet.</Text>

          <Valg verdi="time" modus={modus} onVelg={setModus} tittel="Oppgi tidspunkt">
            <TextInput
              value={tid}
              onChangeText={(t) => { setTid(t); setModus('time'); }}
              onFocus={() => setModus('time')}
              placeholder="23:30"
              placeholderTextColor="#aab1bd"
              keyboardType="numbers-and-punctuation"
              returnKeyType="done"
              onSubmitEditing={lagre}
              style={styles.tidFelt}
            />
          </Valg>
          <Valg verdi="unknown" modus={modus} onVelg={setModus} tittel="Tidspunkt ukjent" />

          {feil ? <Text style={styles.feil}>{feil}</Text> : null}

          <Button title="Lagre" onPress={lagre} loading={busy} style={{ marginTop: 18 }} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            {har ? (
              <Button title="Fjern merket" onPress={() => send(null)} disabled={busy} color="#fff" textColor={C.redInk} style={{ flex: 1, borderWidth: 1.5, borderColor: C.line2 }} />
            ) : null}
            <Button title="Avbryt" onPress={onClose} disabled={busy} color="#fff" textColor={C.slate} style={{ flex: 1, borderWidth: 1.5, borderColor: C.line2 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Ett av de to valgene i dialogen. Egen komponent på toppnivå – definert inne
// i modalen ville den fått ny identitet for hver tast, og feltet mistet fokus.
function Valg({ verdi, modus, onVelg, tittel, children }) {
  const valgt = modus === verdi;
  return (
    <Pressable onPress={() => onVelg(verdi)} style={[styles.valg, valgt && { borderColor: C.navy, backgroundColor: '#f4f7fb' }]}>
      <View style={[styles.radio, valgt && { borderColor: C.navy }]}>
        {valgt ? <View style={styles.radioFyll} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.valgTittel}>{tittel}</Text>
        {children}
      </View>
    </Pressable>
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
  hint: { fontSize: 13, color: C.muted2, fontWeight: '600', marginTop: 12, textAlign: 'center' },
  sen: { fontSize: 13, color: C.amberInk, fontWeight: '700', marginTop: 3 },
  modalBg: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  modal: { width: '100%', maxWidth: 440, backgroundColor: '#fff', borderRadius: 22, padding: 22 },
  modalH: { fontSize: 21, fontWeight: '800', color: C.ink, letterSpacing: -0.4 },
  modalUnder: { fontSize: 14, color: C.muted, fontWeight: '600', marginTop: 3 },
  modalP: { fontSize: 14, color: C.muted, lineHeight: 20, marginTop: 12, marginBottom: 4 },
  valg: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, marginTop: 10,
    borderWidth: 1.5, borderColor: C.line2, borderRadius: 14, backgroundColor: '#fff',
  },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.line2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioFyll: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.navy },
  valgTittel: { fontSize: 16, fontWeight: '700', color: C.ink },
  tidFelt: {
    marginTop: 8, height: 46, borderWidth: 1.5, borderColor: C.line2, borderRadius: 12, paddingHorizontal: 14,
    fontSize: 18, fontWeight: '700', color: C.ink, backgroundColor: '#fff', maxWidth: 140,
  },
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
  navn: { fontSize: 17, fontWeight: '700', color: C.ink, lineHeight: 22 },
  under: { fontSize: 13, color: C.muted2, fontWeight: '600', marginTop: 2 },
  knapper: { flexDirection: 'row', gap: 7 },
  knapp: {
    width: 52, height: 52, borderRadius: 13, borderWidth: 1.5, borderColor: C.line2,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  knappTegn: { fontSize: 20, fontWeight: '800', color: C.muted2 },
});
