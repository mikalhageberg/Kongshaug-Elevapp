import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, Alert, Modal, KeyboardAvoidingView } from 'react-native';
import { api } from '../../api';
import { C, formatTime, formatDateLong, shiftDate, senAnkomstTekst } from '../../theme';
import { Button, Card } from '../../ui';
import { KeyboardScrollView, TextField } from '../../keyboard';
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
  // Søk på navn eller rom, på tvers av internatfilteret.
  const [sok, setSok] = useState('');
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
  const q = sok.trim().toLocaleLowerCase('nb');
  const treffElev = (s) => !q || s.fullName.toLocaleLowerCase('nb').includes(q) || String(s.room ?? '').toLocaleLowerCase('nb') === q;
  const treffGjest = (g) => !q || g.name.toLocaleLowerCase('nb').includes(q) || (g.hostName || '').toLocaleLowerCase('nb').includes(q);
  let vist = filter === 'Alle' || q ? d.dorms : d.dorms.filter((x) => x.dorm === filter);
  if (q) {
    vist = vist
      .map((x) => ({ ...x, students: x.students.filter(treffElev), guests: (x.guests || []).filter(treffGjest) }))
      .filter((x) => x.students.length || x.guests.length);
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <KeyboardScrollView
        contentContainerStyle={{ padding: 18, paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.h1}>Brannliste</Text>
        <Text style={styles.date}>Natt til {formatDateLong(shiftDate(d.nightDate, 1))}</Text>

        <View style={styles.tall}>
          <Tall stor tekst={`${d.present} / ${d.total}`} under="til stede" bg={C.navy} fg="#fff" />
          <Tall tekst={String(d.away)} under="borte" bg="#e7edf5" fg={C.navy} />
          <Tall tekst={String(d.missing)} under="mangler" merk={d.lateCount ? `${d.lateCount} kommer sent` : ''} bg={d.missing ? C.redBg : '#e7edf5'} fg={d.missing ? C.redInk : C.navy} />
        </View>

        <Button title="Opprop ved evakuering" onPress={startOpprop} style={{ marginTop: 16, height: 60 }} fontSize={19} />

        {feil ? <Text style={styles.feil}>{feil}</Text> : null}

        <TextField
          value={sok}
          onChangeText={setSok}
          placeholder="Søk etter elev eller rom …"
          placeholderTextColor="#aab1bd"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={styles.sok}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -18 }}
          contentContainerStyle={{ paddingHorizontal: 18, gap: 9 }}>
          {internater.map((f) => (
            <Pressable key={f} onPress={() => setFilter(f)}
              style={[styles.chip, filter === f && { backgroundColor: C.navy, borderColor: C.navy }]}>
              <Text style={[styles.chipTekst, filter === f && { color: '#fff' }]}>{f}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {q && !vist.length ? (
          <Text style={styles.ingenTreff}>Ingen elever eller gjester passer til «{sok.trim()}».</Text>
        ) : null}

        {vist.map((dorm) => {
          const gjester = dorm.guests || [];
          const vertIder = new Set(dorm.students.map((s) => s.id));
          return (
            <Card key={dorm.dorm} style={{ marginTop: 16, padding: 0, overflow: 'hidden' }}>
              <View style={styles.dormTopp}>
                <Text style={styles.dormNavn}>{dorm.dorm}</Text>
                <Text style={styles.dormTall}>
                  {q ? `${dorm.students.length + gjester.length} treff` : `${dorm.present} av ${dorm.total}${gjester.length ? ` · ${gjester.length} gjest${gjester.length > 1 ? 'er' : ''}` : ''}`}
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
      </KeyboardScrollView>
      <SenAnkomstModal
        elev={sen}
        alle={d.dorms.flatMap((x) => x.students.map((e) => ({ ...e, dorm: x.dorm })))}
        onClose={() => setSen(null)}
        onLagret={async () => { setSen(null); await last(); }}
      />
    </View>
  );
}

function ElevRad({ elev, venter, onSett, onSen }) {
  const farge = elev.status === 'present' ? C.green : elev.status === 'away' ? C.navy : C.red;
  const bg = elev.status === 'missing' ? '#fdf5f4' : elev.status === 'away' ? '#f6f8fb' : '#fff';
  // «Kommer etter fristen» er en egen liten knapp under rommet, ikke en fjerde
  // statusknapp: tre 52 px-knapper er alt raden tåler ved siden av et navn.
  // Vises på dem som mangler, og på alle som alt har merket, så det kan
  // endres eller fjernes. Med merke viser knappen tidspunktet.
  const la = elev.lateArrival;
  const visSen = la || elev.status === 'missing';
  const senTekst = la ? (la.expectedAt ? `Kommer ca. kl. ${la.expectedAt}` : 'Kommer sent – tid ukjent') : 'Kommer etter fristen';
  // Knappen ligger under hele raden, ikke inne i navnekolonnen – der fikk den
  // bare navnets bredde og ble til «Ko…».
  return (
    <View style={[styles.rad, { backgroundColor: bg, opacity: venter ? 0.5 : 1 }]}>
      <View style={styles.radTopp}>
      <View style={[styles.prikk, { backgroundColor: farge }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.navn} numberOfLines={2}>{elev.fullName}</Text>
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
      {visSen ? (
        <Pressable onPress={() => onSen(elev)} style={[styles.senKnapp, la && styles.senKnappSatt]}>
          <Text style={[styles.senKnappTekst, la && { color: '#fff' }]} numberOfLines={1}>🕘 {senTekst}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function GjestRad({ gjest, sammeInternat }) {
  return (
    <View style={[styles.rad, styles.radTopp, { backgroundColor: '#fbf6ee' }]}>
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
function SenAnkomstModal({ elev, alle, onClose, onLagret }) {
  const har = !!elev?.lateArrival;
  const [modus, setModus] = useState('time');
  const [tid, setTid] = useState('');
  const [feil, setFeil] = useState('');
  const [busy, setBusy] = useState(false);
  // «Gjelder flere elever»: de andre som skal få samme merke. Den åpne eleven
  // er alltid med og står ikke her.
  const [ekstra, setEkstra] = useState([]);
  // Velgeren er en andre side i SAMME modal, ikke en ny. To RN-modaler oppå
  // hverandre er upålitelig på iOS – den andre kan la være å vises.
  const [side, setSide] = useState('dialog');
  useEffect(() => {
    if (!elev) return;
    setModus(har && !elev.lateArrival.expectedAt ? 'unknown' : 'time');
    setTid(elev.lateArrival?.expectedAt || '');
    setFeil(''); setBusy(false); setEkstra([]); setSide('dialog');
  }, [elev, har]);

  async function send(body) {
    setBusy(true); setFeil('');
    try {
      if (body && ekstra.length) {
        const r = await api('/api/firelist/late-arrival/bulk', { method: 'POST', body: { userIds: [elev.id, ...ekstra], ...body } });
        if (r.skipped?.length) Alert.alert('Lagret', `Merket ${r.saved} elever. ${r.skipped.length} ble hoppet over fordi de ikke står på lista lenger.`);
      } else if (body) await api('/api/firelist/late-arrival', { method: 'POST', body: { userId: elev.id, ...body } });
      else await api(`/api/firelist/late-arrival/${elev.id}`, { method: 'DELETE' });
      await onLagret();
    } catch (ex) { setFeil(ex.message); setBusy(false); }
  }
  // Tilbake fra velgeren først; ellers lukk.
  const tilbakeEllerLukk = () => (side === 'velger' ? setSide('dialog') : !busy && onClose());
  const ekstraNavn = alle.filter((e) => ekstra.includes(e.id)).map((e) => e.fullName);
  function lagre() {
    if (modus === 'unknown') return send({ expectedAt: null });
    const v = normTid(tid);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { setFeil('Skriv klokkeslettet som 23:30, eller velg «Tidspunkt ukjent».'); return; }
    send({ expectedAt: v });
  }

  return (
    <Modal visible={!!elev} transparent animationType="fade" onRequestClose={tilbakeEllerLukk}>
      <KeyboardAvoidingView behavior="padding" style={styles.modalBg}>
        <Pressable style={StyleSheet.absoluteFill} onPress={tilbakeEllerLukk} />
        {side === 'velger' && elev ? (
          <FlereVelger
            hoved={elev}
            alle={alle}
            startValg={ekstra}
            onAvbryt={() => setSide('dialog')}
            onFerdig={(ids) => { setEkstra(ids); setSide('dialog'); }}
          />
        ) : (
        <View style={styles.modal}>
          <Text style={styles.modalH}>Kommer etter fristen</Text>
          <Text style={styles.modalUnder}>{elev?.fullName} · Rom {elev?.room ?? '–'}</Text>
          <Text style={styles.modalP}>Eleven står som «mangler» til registreringen er gjort, men lista viser at eleven er ventet. Med et klokkeslett kan eleven registrere seg selv til 10 minutter etter det.</Text>

          <Valg verdi="time" modus={modus} onVelg={setModus} tittel="Oppgi tidspunkt">
            <TextField
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

          <Pressable
            onPress={() => (ekstra.length ? setEkstra([]) : setSide('velger'))}
            style={styles.flereRad}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: ekstra.length > 0 }}
          >
            <Sjekk på={ekstra.length > 0} />
            <View style={{ flex: 1 }}>
              <Text style={styles.valgTittel}>Gjelder flere elever</Text>
              <Text style={styles.flereHint}>Samme klokkeslett for flere – enkeltelever, en hel klasse eller et internat.</Text>
            </View>
          </Pressable>
          {ekstra.length ? (
            <Pressable onPress={() => setSide('velger')} style={styles.flereSammendrag}>
              <Text style={styles.flereSammendragTekst}>
                <Text style={{ fontWeight: '800' }}>+ {ekstra.length} {ekstra.length === 1 ? 'elev' : 'elever'}: </Text>
                {ekstraNavn.length <= 3 ? ekstraNavn.join(', ') : `${ekstraNavn.slice(0, 3).join(', ')} og ${ekstraNavn.length - 3} til`}
                <Text style={{ fontWeight: '800', color: C.navy }}>  Endre</Text>
              </Text>
            </Pressable>
          ) : null}

          {feil ? <Text style={styles.feil}>{feil}</Text> : null}

          <Button title="Lagre" onPress={lagre} loading={busy} style={{ marginTop: 18 }} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            {har ? (
              <Button title="Fjern merket" onPress={() => send(null)} disabled={busy} color="#fff" textColor={C.redInk} style={{ flex: 1, borderWidth: 1.5, borderColor: C.line2 }} />
            ) : null}
            <Button title="Avbryt" onPress={onClose} disabled={busy} color="#fff" textColor={C.slate} style={{ flex: 1, borderWidth: 1.5, borderColor: C.line2 }} />
          </View>
        </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Avkrysningsboks. Tegnet selv – React Native har ingen innebygd.
function Sjekk({ på, av }) {
  return (
    <View style={[styles.sjekk, på && styles.sjekkPå, av && { opacity: 0.4 }]}>
      {på ? <Text style={styles.sjekkTegn}>✓</Text> : null}
    </View>
  );
}

// Velgeren bak «Gjelder flere elever»: hele klasser og hele internat med ett
// trykk, eller enkeltelever via søk. Samme regler som på adminsiden.
//
// Bare elever som MANGLER kan velges. En som allerede er til stede eller meldt
// borte, skal ikke få «kommer etter fristen» – da sier lista to ting om samme
// elev, og vakten kan ende med å lete etter en som sover hjemme. De vises
// likevel, grået ut med statusen, så det er tydelig hvorfor de ble utelatt.
//
// Egen toppnivåkomponent: definert inne i dialogen ville søkefeltet fått ny
// identitet for hver tast og mistet fokus.
function FlereVelger({ hoved, alle, startValg, onAvbryt, onFerdig }) {
  const kan = (e) => e.status === 'missing' && e.id !== hoved.id;
  const [valgt, setValgt] = useState(() => new Set(startValg.filter((id) => alle.some((e) => e.id === id && kan(e)))));
  const [sok, setSok] = useState('');
  const [bareValgte, setBareValgte] = useState(false);
  const klasser = useMemo(
    () => [...new Set(alle.map((e) => e.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nb')),
    [alle],
  );
  const internater = useMemo(() => [...new Set(alle.map((e) => e.dorm))], [alle]);
  const gruppe = (type, navn) => alle.filter((e) => kan(e) && (type === 'klasse' ? e.className === navn : e.dorm === navn));

  const veksle = (id) => setValgt((før) => {
    const n = new Set(før);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  // En gruppe velges hel, eller velges bort hel hvis alle allerede er med.
  const veksleGruppe = (g) => setValgt((før) => {
    const n = new Set(før);
    const alleMed = g.every((e) => n.has(e.id));
    g.forEach((e) => (alleMed ? n.delete(e.id) : n.add(e.id)));
    return n;
  });

  const q = sok.trim().toLowerCase();
  const rader = alle.filter((e) => {
    if (bareValgte && !valgt.has(e.id) && e.id !== hoved.id) return false;
    if (!q) return true;
    return [e.fullName, e.className, e.dorm, e.room].some((v) => String(v ?? '').toLowerCase().includes(q));
  });
  const merknad = (e) => (e.id === hoved.id ? 'Denne eleven'
    : e.status === 'present' ? 'Til stede'
      : e.status === 'away' ? 'Borte'
        : e.lateArrival && !valgt.has(e.id) ? 'Merket fra før' : '');

  const Chip = ({ type, navn }) => {
    const g = gruppe(type, navn);
    const på = g.length > 0 && g.every((e) => valgt.has(e.id));
    return (
      <Pressable
        disabled={!g.length}
        onPress={() => veksleGruppe(g)}
        style={[styles.velgChip, på && { backgroundColor: C.navy, borderColor: C.navy }, !g.length && { opacity: 0.4 }]}
      >
        <Text style={[styles.velgChipTekst, på && { color: '#fff' }]}>
          {navn} <Text style={{ fontWeight: '600', opacity: 0.7 }}>{g.length}</Text>
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.velger}>
      <View style={styles.velgerTopp}>
        <Text style={styles.modalH}>Velg flere elever</Text>
        <Text style={styles.modalUnder}>Får samme merke som {hoved.fullName}</Text>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
        <View style={{ paddingHorizontal: 20 }}>
          {klasser.length ? (
            <>
              <Text style={styles.velgSeksjon}>HELE KLASSER</Text>
              <View style={styles.velgChips}>{klasser.map((n) => <Chip key={n} type="klasse" navn={n} />)}</View>
            </>
          ) : null}
          <Text style={styles.velgSeksjon}>HELE INTERNAT</Text>
          <View style={styles.velgChips}>{internater.map((n) => <Chip key={n} type="internat" navn={n} />)}</View>
          <TextField
            value={sok}
            onChangeText={setSok}
            placeholder="Søk etter elev, klasse eller rom"
            placeholderTextColor="#aab1bd"
            autoCorrect={false}
            style={[styles.sok, { marginTop: 14 }]}
          />
          <Pressable onPress={() => setBareValgte(!bareValgte)} style={styles.bareValgte}>
            <Sjekk på={bareValgte} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: C.slate }}>Vis bare valgte</Text>
          </Pressable>
        </View>
        {rader.length ? rader.map((e) => {
          const av = !kan(e);
          const m = merknad(e);
          return (
            <Pressable key={e.id} disabled={av} onPress={() => veksle(e.id)} style={[styles.velgRad, av && { opacity: 0.5 }]}>
              <Sjekk på={valgt.has(e.id) || e.id === hoved.id} av={av} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.velgNavn} numberOfLines={1}>{e.fullName}</Text>
                <Text style={styles.under} numberOfLines={1}>{[e.className, e.dorm, `Rom ${e.room ?? '–'}`].filter(Boolean).join(' · ')}</Text>
              </View>
              {m ? <Text style={styles.velgMerk}>{m}</Text> : null}
            </Pressable>
          );
        }) : <Text style={styles.ingenTreff}>Ingen treff.</Text>}
      </ScrollView>
      <View style={styles.velgerBunn}>
        <Text style={styles.velgAntall}>{valgt.size ? `${valgt.size} valgt` : 'Ingen valgt'}</Text>
        <Button title="Avbryt" onPress={onAvbryt} color="#fff" textColor={C.slate} style={{ flex: 1, height: 48, borderWidth: 1.5, borderColor: C.line2 }} fontSize={15} />
        <Button title="Ferdig" onPress={() => onFerdig([...valgt])} style={{ flex: 1, height: 48 }} fontSize={15} />
      </View>
    </View>
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

function Tall({ tekst, under, merk, bg, fg, stor }) {
  return (
    <View style={[styles.tallBoks, { backgroundColor: bg, flex: stor ? 1.5 : 1 }]}>
      <Text style={[styles.tallStor, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>{tekst}</Text>
      <Text style={[styles.tallUnder, { color: fg }]}>{under}</Text>
      {merk ? <Text style={styles.tallMerk} numberOfLines={1} adjustsFontSizeToFit>{merk}</Text> : null}
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
  senKnapp: {
    marginTop: 9, marginLeft: 20, height: 40, paddingHorizontal: 14, borderRadius: 11,
    borderWidth: 1.5, borderColor: C.amber, backgroundColor: C.amberBg, justifyContent: 'center',
  },
  senKnappSatt: { backgroundColor: C.amberInk, borderColor: C.amberInk },
  senKnappTekst: { fontSize: 14.5, fontWeight: '800', color: C.amberInk },
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
  sjekk: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.line2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', marginTop: 1,
  },
  sjekkPå: { backgroundColor: C.navy, borderColor: C.navy },
  sjekkTegn: { color: '#fff', fontSize: 14, fontWeight: '900', lineHeight: 16 },
  flereRad: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 16, paddingHorizontal: 2 },
  flereHint: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 18 },
  flereSammendrag: {
    marginTop: 10, marginLeft: 34, padding: 12, borderRadius: 12,
    backgroundColor: '#f7f8fa', borderWidth: 1, borderColor: C.line,
  },
  flereSammendragTekst: { fontSize: 14, color: C.ink, lineHeight: 20 },
  velger: {
    width: '100%', maxWidth: 520, height: '88%', backgroundColor: '#fff', borderRadius: 22, overflow: 'hidden',
  },
  velgerTopp: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  velgSeksjon: { fontSize: 12, fontWeight: '800', color: C.muted2, letterSpacing: 0.4, marginTop: 16, marginBottom: 8 },
  velgChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  velgChip: {
    height: 40, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1.5, borderColor: C.line2,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  velgChipTekst: { fontSize: 14, fontWeight: '700', color: C.slate },
  bareValgte: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, marginBottom: 8 },
  velgRad: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#f2f4f6',
  },
  velgNavn: { fontSize: 16, fontWeight: '700', color: C.ink },
  velgMerk: { fontSize: 12.5, fontWeight: '700', color: C.muted2 },
  velgerBunn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16,
    borderTopWidth: 1, borderTopColor: C.line, backgroundColor: '#fff',
  },
  velgAntall: { fontSize: 14, fontWeight: '800', color: C.ink, minWidth: 74 },
  tall: { flexDirection: 'row', gap: 9, marginTop: 18 },
  tallBoks: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 10, alignItems: 'center' },
  tallStor: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  tallUnder: { fontSize: 12.5, fontWeight: '700', marginTop: 3, opacity: 0.85 },
  tallMerk: { fontSize: 11, fontWeight: '700', color: C.amberInk, marginTop: 2 },
  sok: {
    marginTop: 18, height: 48, borderWidth: 1.5, borderColor: C.line2, borderRadius: 14, paddingHorizontal: 16,
    fontSize: 16, color: C.ink, backgroundColor: '#fff',
  },
  ingenTreff: { marginTop: 22, textAlign: 'center', color: C.muted2, fontSize: 15, fontWeight: '600' },
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
    paddingLeft: 15, paddingRight: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#f2f4f6',
  },
  radTopp: { flexDirection: 'row', alignItems: 'center', gap: 11 },
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
