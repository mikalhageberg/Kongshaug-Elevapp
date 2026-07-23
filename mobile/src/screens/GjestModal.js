import React, { useState, useEffect, useCallback } from 'react';
import { Modal, View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { api } from '../api';
import { C, ymd, todayStr, formatNightRange, countNights } from '../theme';
import { Button } from '../ui';

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const WD = ['ma', 'ti', 'on', 'to', 'fr', 'lø', 'sø'];

function monthCells(y, m) {
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7;
  const dim = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(ymd(new Date(y, m, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// Melde gjest på internatet. Sendes til admin som forespørsel (pending).
export default function GjestModal({ visible, onClose, user }) {
  const [view, setView] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [guests, setGuests] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const today = todayStr();

  const load = useCallback(async () => {
    const d = await api('/api/firelist/guests/me').catch(() => ({ guests: [] }));
    setGuests(d.guests);
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    setName(''); setNote(''); setStart(null); setEnd(null); setErr(null); setConfirmation(null);
    const n = new Date();
    setView({ y: n.getFullYear(), m: n.getMonth() });
  }, [visible, load]);

  function tapDay(d) {
    if (!d || d < today) return;
    // Nytt valg = forrige kvittering er ikke lenger det man ser på.
    setErr(null); setConfirmation(null);
    if (!start || end) { setStart(d); setEnd(null); }
    else if (d < start) { setStart(d); setEnd(null); }
    else { setEnd(d); }
  }

  const now = new Date();
  const atFirstMonth = view.y < now.getFullYear() || (view.y === now.getFullYear() && view.m <= now.getMonth());
  function shift(delta) {
    let m = view.m + delta, y = view.y;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setView({ y, m });
  }
  function cellBg(d) {
    if (!d) return null;
    if (d === start || d === end) return { backgroundColor: C.navy };
    if (start && end && d > start && d < end) return { backgroundColor: '#dbe4ef' };
    return null;
  }

  async function submit() {
    if (!name.trim()) { setErr('Skriv inn gjestens navn.'); return; }
    if (!start) { setErr('Velg minst én natt.'); return; }
    setBusy(true); setErr(null);
    const from = start, to = end || start;
    try {
      await api('/api/firelist/guests/request', { method: 'POST', body: { guestName: name.trim(), note: note.trim(), startDate: from, endDate: to } });
      // Kvitteringen gjentar nøyaktig hva som ble sendt, i «natt til»-form.
      setConfirmation({ guestName: name.trim(), nights: countNights(from, to), range: formatNightRange(from, to) });
      setName(''); setNote(''); setStart(null); setEnd(null); load();
    } catch (ex) { setErr(ex.message || 'Kunne ikke sende'); }
    finally { setBusy(false); }
  }
  async function del(id) {
    await api(`/api/firelist/guests/me/${id}`, { method: 'DELETE' }).catch(() => {});
    load();
  }

  const cells = monthCells(view.y, view.m);
  const nights = start ? countNights(start, end || start) : 0;
  const summary = !start
    ? 'Ingen netter valgt'
    : `${nights} ${nights === 1 ? 'natt' : 'netter'} · ${formatNightRange(start, end || start)}`;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={styles.wrap}>
        <View style={styles.head}>
          <Text style={styles.title}>Meld gjest</Text>
          <Pressable onPress={onClose} hitSlop={12}><Text style={{ fontSize: 22, color: C.muted2 }}>✕</Text></Pressable>
        </View>
        <Text style={styles.hint}>Send en forespørsel til administrasjonen. De tildeler internat og rom til gjesten. Trykk kvelden gjesten kommer, deretter den siste kvelden. Én natt = trykk samme dag to ganger.</Text>
        <View style={styles.nightNote}>
          <Text style={styles.nightNoteText}>
            🌙 Besøket gjelder natten. Velger du <Text style={{ fontWeight: '800' }}>19. juli</Text>, betyr det gjesten er på internatet <Text style={{ fontWeight: '800' }}>natt til 20. juli</Text>.
          </Text>
        </View>
        <View style={styles.warnBox}><Text style={styles.warnText}>⚠ Du kan ikke ta imot gjesten før besøket er godkjent.</Text></View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <Text style={styles.label}>Gjestens navn</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Fullt navn" placeholderTextColor={C.muted2} />

          <Text style={[styles.label, { marginTop: 16 }]}>Kommentar (valgfritt)</Text>
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="F.eks. foreldre, søsken…" placeholderTextColor={C.muted2} />

          <Text style={[styles.label, { marginTop: 16 }]}>Nett(er) gjesten blir</Text>
          <View style={styles.monthNav}>
            <Pressable onPress={() => !atFirstMonth && shift(-1)} hitSlop={10} style={{ opacity: atFirstMonth ? 0.3 : 1, paddingHorizontal: 12, paddingVertical: 4 }}>
              <Text style={styles.nav}>‹</Text>
            </Pressable>
            <Text style={styles.monthLabel}>{MONTHS[view.m]} {view.y}</Text>
            <Pressable onPress={() => shift(1)} hitSlop={10} style={{ paddingHorizontal: 12, paddingVertical: 4 }}><Text style={styles.nav}>›</Text></Pressable>
          </View>
          <View style={styles.weekRow}>{WD.map((w) => <Text key={w} style={styles.wd}>{w}</Text>)}</View>
          <View style={styles.grid}>
            {cells.map((d, i) => {
              const disabled = !d || d < today;
              const edge = d && (d === start || d === end);
              return (
                <Pressable key={i} disabled={disabled} onPress={() => tapDay(d)} style={styles.cell}>
                  <View style={[styles.cellInner, cellBg(d)]}>
                    {d ? <Text style={[styles.cellText, disabled && { color: '#c8ced8' }, edge && { color: '#fff' }]}>{Number(d.slice(8))}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {guests.length > 0 && (
            <>
              <Text style={styles.section}>MINE GJESTER</Text>
              {guests.map((g) => (
                <View key={g.id} style={styles.guestRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: C.ink }}>{g.guestName}</Text>
                    {g.note ? <Text style={{ fontSize: 12.5, color: C.slate, fontWeight: '700', marginTop: 1 }}>{g.note}</Text> : null}
                    <Text style={{ fontSize: 12.5, color: C.muted2, marginTop: 2 }}>
                      {g.status === 'approved' && g.dorm ? `${g.dorm}${g.room ? ' · rom ' + g.room : ''} · ` : ''}
                      {formatNightRange(g.startDate, g.endDate)}
                    </Text>
                    <View style={{ marginTop: 6, alignSelf: 'flex-start', backgroundColor: g.status === 'approved' ? C.greenBg : C.amberBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: g.status === 'approved' ? C.greenInk : C.amberInk }}>
                        {g.status === 'approved' ? 'Godkjent' : 'Venter på godkjenning'}
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={() => del(g.id)} hitSlop={8}><Text style={{ color: C.redInk, fontWeight: '700' }}>Slett</Text></Pressable>
                </View>
              ))}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {confirmation ? (
            <View style={styles.confirm}>
              <Text style={styles.confirmTitle}>✓ Sendt til godkjenning</Text>
              <Text style={styles.confirmBody}>
                {confirmation.guestName} er meldt inn for {confirmation.nights} {confirmation.nights === 1 ? 'natt' : 'netter'}: {confirmation.range}. Du kan ikke ta imot gjesten før administrasjonen har godkjent besøket.
              </Text>
            </View>
          ) : null}
          {err ? <View style={styles.errorBox}><Text style={styles.errorText}>{err}</Text></View> : null}
          <Text style={styles.summary}>{summary}</Text>
          <Button title="Send til godkjenning" onPress={submit} loading={busy} disabled={!name.trim() || !start} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.surface },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 6 },
  title: { fontSize: 22, fontWeight: '800', color: C.ink },
  hint: { fontSize: 14, color: C.muted, paddingHorizontal: 20, marginBottom: 6, lineHeight: 20 },
  warnBox: { marginHorizontal: 20, marginBottom: 8, backgroundColor: C.amberBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  warnText: { fontSize: 13.5, color: C.amberInk, fontWeight: '600', lineHeight: 19 },
  nightNote: { marginHorizontal: 20, marginBottom: 8, backgroundColor: '#e7edf5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  nightNoteText: { fontSize: 13.5, color: C.navy, fontWeight: '600', lineHeight: 19 },
  confirm: { backgroundColor: C.amberBg, borderWidth: 1, borderColor: C.amber, borderRadius: 12, padding: 14, marginBottom: 12 },
  confirmTitle: { fontSize: 15.5, fontWeight: '800', color: C.amberInk },
  confirmBody: { fontSize: 13.5, color: C.amberInk, marginTop: 3, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: '700', color: C.slate, marginBottom: 6 },
  input: { height: 52, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line2, borderRadius: 14, paddingHorizontal: 16, fontSize: 16, color: C.ink },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  monthLabel: { fontSize: 17, fontWeight: '800', color: C.ink, textTransform: 'capitalize' },
  nav: { fontSize: 28, fontWeight: '700', color: C.navy, lineHeight: 30 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  wd: { width: `${100 / 7}%`, textAlign: 'center', fontSize: 12, fontWeight: '700', color: C.muted2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  cellInner: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 15.5, fontWeight: '700', color: C.ink },
  section: { fontSize: 11, fontWeight: '800', color: C.muted2, letterSpacing: 0.5, marginTop: 22, marginBottom: 8 },
  guestRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14, marginBottom: 8 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: C.line },
  summary: { fontSize: 14, fontWeight: '700', color: C.slate, textAlign: 'center', marginBottom: 10 },
  errorBox: { backgroundColor: C.redBg, borderWidth: 1, borderColor: C.red, borderRadius: 12, padding: 12, marginBottom: 10 },
  errorText: { fontSize: 14, fontWeight: '700', color: C.redInk },
});
