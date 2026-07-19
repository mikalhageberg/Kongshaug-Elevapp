import React, { useState, useEffect, useCallback } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, Switch } from 'react-native';
import { api } from '../api';
import { C, ymd, todayStr, formatNight, formatNightRange, countNights } from '../theme';
import { Button } from '../ui';

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];
const WD = ['ma', 'ti', 'on', 'to', 'fr', 'lø', 'sø'];

// Rutenett for en måned (mandag først). Tomme celler = null.
function monthCells(y, m) {
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7; // mandag = 0
  const dim = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(ymd(new Date(y, m, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function PlanleggModal({ visible, onClose }) {
  const [view, setView] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [periods, setPeriods] = useState([]);
  const [busy, setBusy] = useState(false);
  const [noDinner, setNoDinner] = useState(true);
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState(null);
  const today = todayStr();

  const load = useCallback(async () => {
    const d = await api('/api/firelist/away-periods').catch(() => ({ periods: [] }));
    setPeriods(d.periods);
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    setStart(null); setEnd(null); setConfirmation(null); setError(null);
    const n = new Date();
    setView({ y: n.getFullYear(), m: n.getMonth() });
  }, [visible, load]);

  function tapDay(d) {
    if (!d || d < today) return;
    // Nytt valg = forrige kvittering er ikke lenger det man ser på.
    setConfirmation(null); setError(null);
    if (!start || end) { setStart(d); setEnd(null); }     // start nytt valg
    else if (d < start) { setStart(d); setEnd(null); }    // før start -> ny start
    else { setEnd(d); }                                   // sett slutt (periode)
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

  async function add() {
    if (!start) return;
    setBusy(true);
    setError(null);
    const from = start, to = end || start;
    try {
      await api('/api/firelist/away-period', { method: 'POST', body: { startDate: from, endDate: to, noDinner } });
      // Kvitteringen gjentar nøyaktig hva som ble lagret, i «natt til»-form, så
      // eleven kan se med én gang om de bommet med en dag.
      setConfirmation({
        nights: countNights(from, to),
        range: formatNightRange(from, to),
        noDinner,
      });
      setStart(null); setEnd(null); load();
    } catch (ex) {
      setError(ex.message || 'Kunne ikke lagre fraværet');
    } finally { setBusy(false); }
  }
  async function del(id) {
    await api(`/api/firelist/away-period/${id}`, { method: 'DELETE' }).catch(() => {});
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
          <Text style={styles.title}>Planlagt fravær</Text>
          <Pressable onPress={onClose} hitSlop={12}><Text style={{ fontSize: 22, color: C.muted2 }}>✕</Text></Pressable>
        </View>
        <Text style={styles.hint}>Trykk kvelden du reiser, deretter den siste kvelden du er borte. Én natt = trykk samme dag to ganger.</Text>
        <View style={styles.nightNote}>
          <Text style={styles.nightNoteText}>
            🌙 Fraværet gjelder natten. Velger du <Text style={{ fontWeight: '800' }}>19. juli</Text>, blir du meldt borte <Text style={{ fontWeight: '800' }}>natt til 20. juli</Text>.
          </Text>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <View style={styles.monthNav}>
            <Pressable onPress={() => !atFirstMonth && shift(-1)} hitSlop={10} style={{ opacity: atFirstMonth ? 0.3 : 1, paddingHorizontal: 12, paddingVertical: 4 }}>
              <Text style={styles.nav}>‹</Text>
            </Pressable>
            <Text style={styles.monthLabel}>{MONTHS[view.m]} {view.y}</Text>
            <Pressable onPress={() => shift(1)} hitSlop={10} style={{ paddingHorizontal: 12, paddingVertical: 4 }}><Text style={styles.nav}>›</Text></Pressable>
          </View>

          <View style={styles.weekRow}>
            {WD.map((w) => <Text key={w} style={styles.wd}>{w}</Text>)}
          </View>

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

          {periods.length > 0 && (
            <>
              <Text style={styles.section}>KOMMENDE FRAVÆR</Text>
              {periods.map((p) => (
                <View key={p.id} style={styles.period}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: '700', color: C.ink }}>{formatNightRange(p.startDate, p.endDate)}</Text>
                    <Text style={{ fontSize: 12.5, color: C.muted2, marginTop: 2 }}>
                      {countNights(p.startDate, p.endDate)} {countNights(p.startDate, p.endDate) === 1 ? 'natt' : 'netter'}
                      {p.noDinner ? ' · 🍽️ uten middag' : ''}
                    </Text>
                  </View>
                  <Pressable onPress={() => del(p.id)} hitSlop={8}><Text style={{ color: C.redInk, fontWeight: '700' }}>Slett</Text></Pressable>
                </View>
              ))}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          {confirmation ? (
            <View style={styles.confirm}>
              <Text style={styles.confirmTitle}>✓ Fraværet er lagret</Text>
              <Text style={styles.confirmBody}>
                Du er meldt borte {confirmation.nights} {confirmation.nights === 1 ? 'natt' : 'netter'}: {confirmation.range}.
                {confirmation.noDinner ? ' Du får ikke middag i perioden.' : ' Du får middag som vanlig.'}
              </Text>
            </View>
          ) : null}
          {error ? (
            <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>
          ) : null}

          <View style={styles.dinnerRow}>
            <Text style={{ flex: 1, fontWeight: '700', color: C.ink }}>Jeg skal heller ikke ha middag i perioden</Text>
            <Switch value={noDinner} onValueChange={setNoDinner} trackColor={{ true: C.navy }} />
          </View>
          <Text style={styles.summary}>{summary}</Text>
          <Button title="Legg til fravær" onPress={add} loading={busy} disabled={!start} />
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
  period: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14, marginBottom: 8 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: C.line },
  summary: { fontSize: 14, fontWeight: '700', color: C.slate, textAlign: 'center', marginBottom: 10 },
  dinnerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 12, marginBottom: 12 },
  nightNote: { marginHorizontal: 20, marginBottom: 8, backgroundColor: '#e7edf5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  nightNoteText: { fontSize: 13.5, color: C.navy, fontWeight: '600', lineHeight: 19 },
  confirm: { backgroundColor: C.greenBg, borderWidth: 1, borderColor: C.green, borderRadius: 12, padding: 14, marginBottom: 12 },
  confirmTitle: { fontSize: 15.5, fontWeight: '800', color: C.greenInk },
  confirmBody: { fontSize: 13.5, color: C.greenInk, marginTop: 3, lineHeight: 19 },
  errorBox: { backgroundColor: C.redBg, borderWidth: 1, borderColor: C.red, borderRadius: 12, padding: 14, marginBottom: 12 },
  errorText: { fontSize: 14, fontWeight: '700', color: C.redInk },
});
