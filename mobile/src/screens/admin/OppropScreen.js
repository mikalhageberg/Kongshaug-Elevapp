import React, { useState, useRef, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { api } from '../../api';
import { C } from '../../theme';
import { Button, Pill } from '../../ui';

// Oppropsmodus: én elev av gangen, i samme rekkefølge som brannlisten – internat
// for internat, rom for rom. Det er den rekkefølgen man faktisk går i når man
// banker på dørene.
//
// To knapper, med vilje. «Til stede» er den store: det er den som skal treffes
// i mørket med en hånd. «Gå til neste» er liten og lar eleven stå uavklart –
// den som ikke er på rommet skal ikke bli borteregistrert av et raskt trykk,
// bare stå igjen på restlista til slutt.

// Alle elever i brannliste-rekkefølge, med internatet de hører til.
export function studentsInOrder(overview) {
  return (overview?.dorms || []).flatMap((d) => d.students.map((s) => ({ ...s, dorm: d.dorm })));
}

export default function OppropScreen({ overview, onClose, onDone }) {
  // valg = null (startskjerm) | 'alle' | 'mangler'
  const [valg, setValg] = useState(null);
  const [kø, setKø] = useState([]);
  const [i, setI] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feil, setFeil] = useState('');
  // Hvor mange oppropet selv registrerte, til oppsummeringen.
  const kryssetRef = useRef(new Set());
  // Fersk oversikt hentet når runden er ferdig. Uten den ville en elev som
  // krysset seg av selv mens oppropet gikk, stått som «ikke gjort rede for» i
  // oppsummeringen – og vakten gått ut i gangen etter en som ligger på rommet.
  const [fasit, setFasit] = useState(null);

  const alle = studentsInOrder(overview);
  const mangler = alle.filter((s) => s.status === 'missing');

  function start(hvilke) {
    kryssetRef.current = new Set();
    setKø(hvilke === 'alle' ? alle : mangler);
    setI(0);
    setValg(hvilke);
  }

  async function tilStede() {
    const elev = kø[i];
    setBusy(true);
    setFeil('');
    try {
      await api('/api/firelist/admin-checkin', { method: 'POST', body: { userId: elev.id, status: 'present' } });
      kryssetRef.current.add(elev.id);
      setI(i + 1);
    } catch (ex) {
      // Blir stående på samme elev. Et opprop som hoppet videre etter en feil
      // ville sagt at eleven var registrert uten at hun var det.
      setFeil(ex.message);
    }
    setBusy(false);
  }

  function neste() { setFeil(''); setI(i + 1); }

  // Runden er gjennomgått: hent lista på nytt før oppsummeringen vises.
  const ferdig = valg && i >= kø.length;
  useEffect(() => {
    if (!ferdig) return;
    let avbrutt = false;
    setFasit(null);
    api('/api/firelist/overview')
      .then((o) => { if (!avbrutt) setFasit(studentsInOrder(o)); })
      // Uten nett faller vi tilbake på øyeblikksbildet oppropet startet med.
      // Det er dårligere, men bedre enn en oppsummering som aldri kommer.
      .catch(() => { if (!avbrutt) setFasit(studentsInOrder(overview)); });
    return () => { avbrutt = true; };
  }, [ferdig]);

  // ── Startskjerm ────────────────────────────────────────────
  if (!valg) {
    return (
      <View style={styles.wrap}>
        <Topp tittel="Opprop" undertittel={`${alle.length} elever på brannlisten`} onClose={onClose} />
        <View style={styles.midt}>
          <Text style={styles.h1}>Hvem skal ropes opp?</Text>
          <Text style={styles.p}>
            Du får én elev av gangen, i samme rekkefølge som brannlisten. «Til stede»
            registrerer eleven med én gang.
          </Text>
          <View style={{ height: 26 }} />
          <Button title={`Alle på brannlisten (${alle.length})`} onPress={() => start('alle')} style={{ alignSelf: 'stretch' }} />
          <View style={{ height: 12 }} />
          <Button
            title={mangler.length ? `Bare de som mangler (${mangler.length})` : 'Ingen mangler nå'}
            onPress={() => start('mangler')}
            disabled={!mangler.length}
            color="#fff" textColor={C.navy} fontSize={16}
            style={{ alignSelf: 'stretch', borderWidth: 1.5, borderColor: '#d3dae2' }}
          />
        </View>
      </View>
    );
  }

  // ── Oppsummering ───────────────────────────────────────────
  if (ferdig) {
    if (!fasit) {
      return (
        <View style={styles.wrap}>
          <Topp tittel="Opprop ferdig" undertittel="Henter lista…" onClose={onClose} />
          <View style={styles.midt}><Text style={{ color: C.muted }}>Oppdaterer brannlisten…</Text></View>
        </View>
      );
    }
    const krysset = kryssetRef.current;
    // Bare elevene denne runden faktisk gikk gjennom, slik de står nå.
    const iRunden = new Set(kø.map((s) => s.id));
    const igjen = fasit.filter((s) => iRunden.has(s.id) && s.status === 'missing');
    return (
      <View style={styles.wrap}>
        <Topp tittel="Opprop ferdig" undertittel={`${krysset.size} registrert til stede`} onClose={onClose} />
        <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
          <View style={[styles.ring, { backgroundColor: igjen.length ? C.redBg : C.greenBg }]}>
            <View style={[styles.ringInner, { backgroundColor: igjen.length ? C.red : C.green }]}>
              <Text style={styles.tick}>{igjen.length ? '!' : '✓'}</Text>
            </View>
          </View>
          <Text style={styles.h1c}>
            {igjen.length ? `${igjen.length} er ikke gjort rede for` : 'Alle er gjort rede for'}
          </Text>
          <Text style={styles.pc}>
            {igjen.length
              ? 'Disse ble hoppet over og står fortsatt uregistrert.'
              : 'Hele runden er registrert. Brannlisten er komplett.'}
          </Text>

          {igjen.map((s) => (
            <View key={s.id} style={styles.restRad}>
              <View style={[styles.prikk, { backgroundColor: C.red }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.restNavn}>{s.fullName}</Text>
                <Text style={styles.restRom}>{s.dorm} · rom {s.room ?? '–'}</Text>
              </View>
            </View>
          ))}

          <View style={{ height: 26 }} />
          {igjen.length ? (
            <>
              <Button title={`Gå gjennom de ${igjen.length} igjen`} onPress={() => { kryssetRef.current = new Set(); setFasit(null); setKø(igjen); setI(0); }} />
              <View style={{ height: 12 }} />
            </>
          ) : null}
          <Button title="Ferdig" onPress={() => { onDone?.(); onClose(); }}
            color={igjen.length ? '#fff' : C.navy} textColor={igjen.length ? C.slate : '#fff'} fontSize={16}
            style={igjen.length ? { borderWidth: 1.5, borderColor: '#d3dae2' } : null} />
        </ScrollView>
      </View>
    );
  }

  // ── Én elev ────────────────────────────────────────────────
  const elev = kø[i];
  const alleredeRegistrert = elev.status === 'present' || elev.status === 'away';
  return (
    <View style={styles.wrap}>
      <Topp tittel="Opprop" undertittel={`${i + 1} av ${kø.length}`} onClose={onClose} />

      <View style={styles.bjelke}>
        <View style={[styles.bjelkeFyll, { width: `${(i / kø.length) * 100}%` }]} />
      </View>

      <View style={styles.midt}>
        <Text style={styles.internat}>{elev.dorm}</Text>
        <Text style={styles.navn} numberOfLines={3} adjustsFontSizeToFit>{elev.fullName}</Text>
        <Text style={styles.rom}>Rom {elev.room ?? '–'}</Text>
        <View style={{ height: 16 }} />
        {alleredeRegistrert ? (
          <Pill
            tone={elev.status === 'present' ? 'green' : 'grey'}
            text={elev.status === 'present' ? 'Har registrert seg selv' : 'Meldt borte i natt'}
          />
        ) : (
          <Pill tone="red" text="Ikke registrert" />
        )}
      </View>

      {feil ? <Text style={styles.feil}>{feil}</Text> : null}

      <View style={styles.bunn}>
        <Button title="Til stede" onPress={tilStede} loading={busy} color={C.green}
          style={{ alignSelf: 'stretch', height: 74 }} fontSize={22} />
        <Pressable onPress={neste} hitSlop={12} style={styles.hopp}>
          <Text style={styles.hoppTekst}>Gå til neste →</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Topp({ tittel, undertittel, onClose }) {
  return (
    <View style={styles.topp}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toppTittel}>{tittel}</Text>
        <Text style={styles.toppUnder}>{undertittel}</Text>
      </View>
      <Pressable onPress={onClose} hitSlop={14} style={styles.lukk}>
        <Text style={{ fontSize: 20, color: C.muted, fontWeight: '700' }}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.surface },
  topp: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 22, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: '#fff',
  },
  toppTittel: { fontSize: 18, fontWeight: '800', color: C.ink, letterSpacing: -0.4 },
  toppUnder: { fontSize: 13, color: C.muted2, fontWeight: '600', marginTop: 2 },
  lukk: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  bjelke: { height: 5, backgroundColor: '#e4e8ee' },
  bjelkeFyll: { height: 5, backgroundColor: C.navy },
  midt: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 26 },
  h1: { fontSize: 24, fontWeight: '800', color: C.ink, textAlign: 'center', letterSpacing: -0.5 },
  p: { fontSize: 15, color: C.muted, textAlign: 'center', lineHeight: 22, marginTop: 12 },
  internat: { fontSize: 14, fontWeight: '800', color: C.muted2, letterSpacing: 0.6, textTransform: 'uppercase' },
  navn: { fontSize: 38, fontWeight: '800', color: C.ink, textAlign: 'center', letterSpacing: -1, marginTop: 10 },
  rom: { fontSize: 18, color: C.muted, fontWeight: '600', marginTop: 10 },
  feil: { color: C.redInk, fontSize: 14, fontWeight: '600', textAlign: 'center', paddingHorizontal: 26, marginBottom: 8 },
  bunn: { padding: 22, paddingTop: 0 },
  hopp: { alignSelf: 'center', paddingVertical: 16, paddingHorizontal: 20 },
  hoppTekst: { fontSize: 16, fontWeight: '700', color: C.slate },
  ring: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 20 },
  ringInner: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
  tick: { color: '#fff', fontSize: 30, fontWeight: '800' },
  h1c: { fontSize: 24, fontWeight: '800', color: C.ink, textAlign: 'center', letterSpacing: -0.5 },
  pc: { fontSize: 14.5, color: C.muted, textAlign: 'center', lineHeight: 21, marginTop: 10, marginBottom: 18 },
  restRad: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderTopWidth: 1, borderTopColor: C.line },
  prikk: { width: 9, height: 9, borderRadius: 5 },
  restNavn: { fontSize: 17, fontWeight: '700', color: C.ink },
  restRom: { fontSize: 13.5, color: C.muted2, fontWeight: '600', marginTop: 2 },
});
