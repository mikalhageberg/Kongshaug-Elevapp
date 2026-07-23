import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView } from 'react-native';
import { api, getPositionOnCampus } from '../api';
import { C, formatTime, formatDateLong, shiftDate } from '../theme';
import { Button, Banner, Card } from '../ui';
import PlanleggModal from './PlanleggModal';

// Henter internatvakt fra siste tolkede ukeoppslag (uansett hvor mange menyer
// som finnes), slik at Brannliste alltid viser nyeste vaktliste.
async function fetchLatestNightGuards() {
  const d = await api('/api/menus').catch(() => ({ menus: [] }));
  for (const m of d.menus || []) {
    if (m.parseStatus !== 'ok') continue;
    const p = await api(`/api/menus/${m.id}/parsed`).catch(() => null);
    const guards = (p?.menu?.nightGuards || []).filter((g) => g.day || g.name);
    if (guards.length) return guards;
  }
  return [];
}

function NightGuardsCard({ guards }) {
  if (!guards.length) return null;
  return (
    <Card style={styles.guardCard}>
      <Text style={styles.guardHeader}>🌙 Internatvakt denne uken</Text>
      {guards.map((g, i) => (
        <View key={i} style={[styles.guardRow, i === 0 && { borderTopWidth: 0 }]}>
          <Text style={styles.guardDay}>{g.day}</Text>
          <Text style={styles.guardName}>{g.name}</Text>
        </View>
      ))}
    </Card>
  );
}

export default function BrannlisteScreen() {
  const [state, setState] = useState('loading'); // loading | ready | blocked | closed | done | away
  const [coords, setCoords] = useState(null);
  const [info, setInfo] = useState(null); // { checkedAt, nightDate }
  const [scheduled, setScheduled] = useState(false);
  const [msg, setMsg] = useState('Sjekker posisjon…');
  const [win, setWin] = useState(null); // { isOpen, state, opensAt, closesAt }
  const [busy, setBusy] = useState(false);
  const [awayBusy, setAwayBusy] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [noDinner, setNoDinner] = useState(true);
  const [nightGuards, setNightGuards] = useState([]);

  useEffect(() => { fetchLatestNightGuards().then(setNightGuards).catch(() => {}); }, []);

  async function loadPosition(closesAt) {
    setState('loading');
    try {
      const { coords: c, ok, distance } = await getPositionOnCampus();
      if (ok) {
        setCoords(c); setState('ready');
        setMsg(closesAt ? `Meld deg til stede før kl. ${closesAt}.` : 'Gjelder natten som kommer.');
      } else {
        setState('blocked');
        setMsg(`Du er ${distance} m unna skolen (din posisjon: ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}).`);
      }
    } catch (ex) {
      setState('blocked'); setMsg(ex.message);
    }
  }

  const refresh = useCallback(async () => {
    const status = await api('/api/firelist/status').catch(() => ({ status: null }));
    const w = status.window || { isOpen: true, state: 'open' };
    setWin(w);
    if (status.status === 'present') { setInfo({ checkedAt: status.checkedAt, nightDate: status.nightDate }); setScheduled(false); setState('done'); return; }
    if (status.status === 'away') { setInfo({ nightDate: status.nightDate }); setScheduled(!!status.scheduled); setNoDinner(!!status.noDinner); setState('away'); return; }
    // Utenfor vinduet: ikke be om posisjon – vis nedtelling / stengt.
    if (!w.isOpen) { setState('closed'); return; }
    loadPosition(w.closesAt);
  }, []);

  // Gå til innsjekk (fra «likevel på skolen»): respekter vinduet.
  function goToCheckin() {
    if (win && !win.isOpen) { setState('closed'); return; }
    loadPosition(win?.closesAt);
  }

  useEffect(() => { refresh(); }, [refresh]);

  async function submit() {
    setBusy(true);
    try {
      const r = await api('/api/firelist/checkin', { method: 'POST', body: coords });
      setInfo({ checkedAt: r.checkedAt, nightDate: r.nightDate }); setState('done');
    } catch (ex) {
      if (ex.code === 'offsite') { setState('blocked'); setMsg('Du må være innenfor skolens område for å melde deg til stede.'); }
      else if (ex.code === 'closed') { setBusy(false); refresh(); return; } // vinduet lukket seg – re-synk
      else setMsg(ex.message);
      setBusy(false);
    }
  }

  async function markAway() {
    setAwayBusy(true);
    try {
      const r = await api('/api/firelist/away', { method: 'POST', body: { noDinner: true } });
      setInfo({ nightDate: r.nightDate }); setScheduled(false); setNoDinner(true); setState('away');
    } catch (ex) { setMsg(ex.message); }
    finally { setAwayBusy(false); }
  }

  async function setNoDinnerFlag(value) {
    setNoDinner(value);
    try { await api('/api/firelist/away', { method: 'POST', body: { noDinner: value } }); }
    catch { setNoDinner(!value); }
  }

  const planModal = (
    <PlanleggModal visible={planOpen} onClose={() => { setPlanOpen(false); refresh(); }} />
  );
  const planButton = (
    <Button title="📅 Planlegg fravær" color="#fff" textColor={C.navy} fontSize={15}
      onPress={() => setPlanOpen(true)} style={{ height: 46 }} />
  );

  // Bekreftet til stede
  if (state === 'done') {
    return (
      <ScrollView style={styles.scrollBg} contentContainerStyle={styles.center}>
        {planModal}
        <View style={styles.ringBig}><View style={[styles.ringInner, { backgroundColor: C.green }]}><Text style={styles.tick}>✓</Text></View></View>
        <Text style={styles.doneTitle}>Du er registrert</Text>
        <Text style={styles.doneSub}>på brannlisten for natt til{'\n'}{info ? formatDateLong(shiftDate(info.nightDate, 1)) : ''}</Text>
        <View style={styles.timePill}><Text style={{ fontWeight: '700', color: C.ink }}>🕘 Registrert kl. {formatTime(info?.checkedAt)}</Text></View>
        <Text style={{ color: C.muted2, marginTop: 22, marginBottom: 24 }}>God natt. Sov godt. 🌙</Text>
        <Button title="Jeg er likevel ikke på skolen" color="#fff" textColor={C.slate} loading={awayBusy}
          onPress={markAway} style={{ alignSelf: 'stretch', borderWidth: 1.5, borderColor: '#d3dae2', height: 48 }} />
        <NightGuardsCard guards={nightGuards} />
      </ScrollView>
    );
  }

  // Meldt / planlagt borte
  if (state === 'away') {
    return (
      <ScrollView style={styles.scrollBg} contentContainerStyle={styles.center}>
        {planModal}
        <View style={[styles.ringBig, { backgroundColor: '#e7edf5' }]}><View style={[styles.ringInner, { backgroundColor: C.navy }]}><Text style={{ fontSize: 34 }}>🏠</Text></View></View>
        <Text style={styles.doneTitle}>{scheduled ? 'Planlagt borte i natt' : 'Meldt borte i natt'}</Text>
        <Text style={styles.doneSub}>Du er registrert som ikke på skolen natt til{'\n'}{info ? formatDateLong(shiftDate(info.nightDate, 1)) : ''}.</Text>
        <Text style={{ color: C.muted2, textAlign: 'center', marginBottom: 18 }}>
          {scheduled ? 'Dette er en planlagt fraværsdag.' : 'Da vet brannvakten at du ikke er i bygget.'}
        </Text>
        <View style={styles.dinnerRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', fontSize: 15, color: C.ink }}>Jeg skal heller ikke ha middag i dag</Text>
            <Text style={{ fontSize: 13, color: C.muted }}>Så slipper kjøkkenet å lage mat til deg.</Text>
          </View>
          <Switch value={noDinner} onValueChange={setNoDinnerFlag} trackColor={{ true: C.navy }} />
        </View>
        <View style={{ height: 16 }} />
        <Button title="✓  Jeg er likevel på skolen" color={C.green} onPress={goToCheckin} style={{ alignSelf: 'stretch', height: 56 }} />
        <View style={{ height: 10 }} />
        {planButton}
        <NightGuardsCard guards={nightGuards} />
      </ScrollView>
    );
  }

  // Skjema (loading | ready | blocked)
  return (
    <ScrollView style={styles.scrollBg} contentContainerStyle={styles.wrap}>
      {planModal}
      <Text style={styles.h1}>Meld deg til stede i kveld</Text>
      <Text style={styles.p}>Kryss av så vi vet hvem som er på skolen i natt ved brann.</Text>

      <View style={{ marginTop: 8 }}>
        {state === 'ready'
          ? <Banner tone="green" text="📍 Posisjon funnet · bekreftes mot skolens område" />
          : state === 'closed' && win
            ? <Banner text={`🕘 ${win.state === 'before' ? `Registrering åpner kl. ${win.opensAt}` : `Registreringen stengte kl. ${win.closesAt}`} · åpent ${win.opensAt}–${win.closesAt}`} />
            : state === 'blocked'
              ? <Banner tone="red" text={'✕ ' + msg} />
              : <Banner tone="grey" text="Sjekker posisjon…" />}
      </View>

      <View style={{ flex: 1, minHeight: 20 }} />
      <Button title="✓  Jeg er til stede" color={C.green} onPress={submit} loading={busy} disabled={state !== 'ready'} style={{ height: 62 }} />
      <Text style={styles.hint}>{
        state === 'ready' ? msg
          : state === 'closed' && win
            ? (win.state === 'before' ? `Du kan melde deg til stede mellom kl. ${win.opensAt} og ${win.closesAt}.` : 'Innsjekk for i kveld er stengt.')
            : state === 'blocked' ? msg
              : 'Sjekker posisjon…'
      }</Text>
      <Button title="Jeg er ikke på skolen i natt" color="#fff" textColor={C.slate} loading={awayBusy}
        onPress={markAway} style={{ height: 52, borderWidth: 1.5, borderColor: '#d3dae2' }} />
      <View style={{ height: 10 }} />
      {planButton}
      <NightGuardsCard guards={nightGuards} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollBg: { flex: 1, backgroundColor: C.surface },
  wrap: { flexGrow: 1, padding: 24 },
  h1: { fontSize: 25, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  p: { fontSize: 15, color: C.muted, lineHeight: 22, marginTop: 10 },
  hint: { fontSize: 13, color: C.muted2, textAlign: 'center', marginTop: 14, marginBottom: 10 },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 34 },
  guardCard: { alignSelf: 'stretch', marginTop: 20, padding: 18 },
  guardHeader: { fontSize: 12.5, fontWeight: '800', color: C.muted2, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4 },
  guardRow: { flexDirection: 'row', paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line },
  guardDay: { width: 96, fontSize: 13, fontWeight: '800', color: C.navy, letterSpacing: 0.3, textTransform: 'uppercase' },
  guardName: { flex: 1, fontSize: 15, fontWeight: '600', color: C.navy },
  ringBig: { width: 104, height: 104, borderRadius: 52, backgroundColor: C.greenBg, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  ringInner: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center' },
  tick: { color: '#fff', fontSize: 40, fontWeight: '800' },
  doneTitle: { fontSize: 26, fontWeight: '800', color: C.ink },
  doneSub: { fontSize: 15, color: C.muted, textAlign: 'center', lineHeight: 22, marginTop: 10, marginBottom: 18 },
  timePill: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line2, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  dinnerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch', backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 14 },
});
