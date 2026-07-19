import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { api, fileUrl } from '../api';
import { C, formatDateLong, formatWeekRange, todayStr } from '../theme';
import { Banner, Button, Card, Pill } from '../ui';

export default function MiddagScreen({ user }) {
  const [dinner, setDinner] = useState(null);
  const [busy, setBusy] = useState(false);
  const [menus, setMenus] = useState([]);
  const [parsed, setParsed] = useState({}); // { [menuId]: { days, note } }
  const [duty, setDuty] = useState(null);       // ukene framover, [0] = denne uken
  const [planOpen, setPlanOpen] = useState(false);

  const loadDinner = useCallback(async () => {
    setDinner(await api('/api/dinner/status').catch(() => null));
  }, []);

  const loadDuty = useCallback(async () => {
    const d = await api('/api/dinner/kitchen-duty?weeks=12').catch(() => null);
    setDuty(d?.weeks?.length ? d.weeks : null);
  }, []);

  const loadMenus = useCallback(async () => {
    const d = await api('/api/menus').catch(() => null);
    if (!d) return;
    setMenus(d.menus);
    // Hent den tolkede menyen (dag for dag) for hver meny som er ferdig tolket.
    d.menus.filter((m) => m.parseStatus === 'ok').forEach((m) => {
      api(`/api/menus/${m.id}/parsed`)
        .then((p) => { if (p.status === 'ok' && p.menu) setParsed((cur) => ({ ...cur, [m.id]: p.menu })); })
        .catch(() => {});
    });
    // Tolkning pågår? Prøv igjen om litt så dagene dukker opp av seg selv.
    if (d.menus.some((m) => m.parseStatus === 'pending')) setTimeout(loadMenus, 5000);
  }, []);

  useEffect(() => {
    loadDinner();
    loadMenus();
    loadDuty();
  }, [loadDinner, loadMenus, loadDuty]);

  async function toggleDinner() {
    if (!dinner) return;
    setBusy(true);
    try { await api('/api/dinner/optout', { method: dinner.optedOut ? 'DELETE' : 'POST' }); await loadDinner(); }
    catch { /* ignorer */ } finally { setBusy(false); }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.surface }} contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
      <Text style={styles.h1}>Middag</Text>
      <Text style={styles.date}>{formatDateLong(todayStr())}</Text>

      {dinner && (dinner.fromPeriod ? (
        <Card style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={[styles.icon, { backgroundColor: '#e7edf5' }]}><Text style={{ fontSize: 24 }}>🏠</Text></View>
          <View style={{ flex: 1 }}><Text style={styles.cardTitle}>Meldt av middag i dag</Text><Text style={styles.sub}>Del av et planlagt fravær. Endre det under «Brannliste → Planlegg fravær».</Text></View>
        </Card>
      ) : (
        <Card style={{ marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <View style={[styles.icon, { backgroundColor: dinner.optedOut ? C.redBg : C.greenBg }]}><Text style={{ fontSize: 24, color: dinner.optedOut ? C.red : C.green }}>{dinner.optedOut ? '✕' : '✓'}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{dinner.optedOut ? 'Du har meldt fra' : 'Du får middag i dag'}</Text>
              <Text style={styles.sub}>{dinner.optedOut ? 'Du får ikke middag i dag.' : 'Meld fra hvis du ikke skal spise, så unngår vi matsvinn.'}</Text>
            </View>
          </View>
          <Button
            title={dinner.optedOut ? 'Jeg spiser likevel middag' : 'Meld fra – jeg spiser ikke i dag'}
            color={dinner.optedOut ? C.navy : '#fff'} textColor={dinner.optedOut ? '#fff' : C.slate}
            loading={busy} onPress={toggleDinner} fontSize={15}
            style={dinner.optedOut ? {} : { borderWidth: 1.5, borderColor: '#d3dae2' }}
          />
        </Card>
      ))}

      {duty ? (() => {
        const now = duty[0];
        // Klipp planen etter den siste uken noen er satt opp – tomme uker midt
        // i beholdes, så eleven ser hullene i rundgangen.
        let last = 0;
        duty.forEach((w, i) => { if (w.students.length) last = i; });
        const upcoming = duty.slice(1, last + 1);
        const mine = upcoming.find((w) => w.students.some((s) => s.id === user?.id));
        return (
          <View style={{ marginTop: 26 }}>
            <Text style={[styles.h1, { fontSize: 19 }]}>Kjøkkentjeneste</Text>
            <Text style={styles.date}>Uke {now.isoWeek} · {formatWeekRange(now.weekStart, now.weekEnd)}</Text>
            <Card style={{ marginTop: 10, padding: 0, paddingVertical: 6 }}>
              {now.students.length ? now.students.map((s, i) => (
                <View key={s.id} style={[styles.dutyRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.line }]}>
                  <Text style={styles.dutyName}>{s.fullName}</Text>
                  {s.id === user?.id ? <Pill tone="amber" text="Deg" /> : null}
                  <Text style={styles.dutyClass}>{s.className || ''}</Text>
                </View>
              )) : (
                <Text style={[styles.sub, { paddingHorizontal: 18, paddingVertical: 10, marginTop: 0 }]}>Ingen satt opp denne uken.</Text>
              )}
            </Card>

            {mine ? (
              <View style={{ marginTop: 10 }}>
                <Banner text={`🕑 Din neste tjeneste: uke ${mine.isoWeek} · ${formatWeekRange(mine.weekStart, mine.weekEnd)}`} />
              </View>
            ) : null}

            {upcoming.length ? (
              <>
                <Button
                  title={planOpen ? 'Vis mindre' : 'Vis hele planen'}
                  color="#fff" textColor={C.slate} fontSize={14.5}
                  onPress={() => setPlanOpen((o) => !o)}
                  style={{ height: 46, marginTop: 10, borderWidth: 1.5, borderColor: '#d3dae2' }}
                />
                {planOpen ? upcoming.map((w) => {
                  const isMine = w.students.some((s) => s.id === user?.id);
                  return (
                    <Card key={w.weekStart} style={[styles.planCard, isMine && { backgroundColor: C.amberBg, borderColor: C.amber }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                        <Text style={[styles.planWeek, isMine && { color: C.amberInk }]}>Uke {w.isoWeek}</Text>
                        <Text style={styles.planRange}>{formatWeekRange(w.weekStart, w.weekEnd)}</Text>
                      </View>
                      <Text style={[styles.planNames, isMine && { color: C.amberInk }, !w.students.length && { color: C.muted2 }]}>
                        {w.students.map((s) => s.fullName).join(', ') || 'Ingen satt opp'}
                      </Text>
                    </Card>
                  );
                }) : null}
              </>
            ) : null}
          </View>
        );
      })() : null}

      <Text style={[styles.h1, { fontSize: 19, marginTop: 26 }]}>Ukemeny</Text>
      {menus.length ? menus.map((m) => {
        const menu = parsed[m.id];
        const days = (menu?.days || []).filter((d) => (d.dishes && d.dishes.length) || d.day);
        return (
          <View key={m.id} style={styles.menuCard}>
            <View style={styles.menuHeader}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>{m.title}</Text>
                {m.parseStatus === 'pending' ? <Text style={{ fontSize: 12.5, color: C.muted2, marginTop: 2 }}>Tolker meny…</Text> : null}
              </View>
              {m.hasFile ? (
                <Pressable onPress={() => Linking.openURL(fileUrl(`/api/menus/${m.id}/file`))} style={styles.pdfBtn}>
                  <Text style={{ color: C.slate, fontWeight: '700', fontSize: 13 }}>Åpne PDF</Text>
                </Pressable>
              ) : null}
            </View>
            {days.length ? (
              <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
                {days.map((d, i) => (
                  <View key={i} style={[styles.dayRow, i === 0 && { borderTopWidth: 0 }]}>
                    <Text style={styles.dayName}>{d.day}</Text>
                    <Text style={styles.dayDishes}>{d.dishes && d.dishes.length ? d.dishes.join('\n') : '—'}</Text>
                    {d.note ? <Text style={styles.dayNote}>{d.note}</Text> : null}
                  </View>
                ))}
                {menu.note ? <Text style={[styles.dayNote, { marginTop: 10 }]}>{menu.note}</Text> : null}
              </View>
            ) : null}
          </View>
        );
      }) : <Text style={[styles.sub, { marginTop: 8 }]}>Ingen meny lastet opp ennå.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  date: { fontSize: 13, fontWeight: '700', color: C.muted2, marginTop: 2 },
  sub: { fontSize: 14, color: C.muted, lineHeight: 20, marginTop: 6 },
  icon: { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.ink },
  menuCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, marginTop: 12, overflow: 'hidden' },
  menuHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  pdfBtn: { height: 38, paddingHorizontal: 14, borderRadius: 11, borderWidth: 1.5, borderColor: '#d3dae2', alignItems: 'center', justifyContent: 'center' },
  dayRow: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line },
  dayName: { fontSize: 13, fontWeight: '800', color: C.red, letterSpacing: 0.4, textTransform: 'uppercase' },
  dayDishes: { fontSize: 15, fontWeight: '600', color: C.navy, marginTop: 3, lineHeight: 21 },
  dayNote: { fontSize: 12.5, color: C.muted, marginTop: 3, lineHeight: 18 },
  dutyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 11 },
  dutyName: { flex: 1, fontSize: 15, fontWeight: '700', color: C.ink },
  dutyClass: { fontSize: 13, fontWeight: '600', color: C.muted2 },
  planCard: { borderRadius: 14, padding: 14, marginTop: 8 },
  planWeek: { fontSize: 14, fontWeight: '800', color: C.ink },
  planRange: { fontSize: 12.5, fontWeight: '600', color: C.muted2 },
  planNames: { fontSize: 14.5, fontWeight: '600', color: C.ink, marginTop: 3, lineHeight: 20 },
});
