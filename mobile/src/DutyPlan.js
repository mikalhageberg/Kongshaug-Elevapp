// Ukestjeneste-plan: denne uken i detalj, og hele rundgangen framover.
//
// Delt mellom «Middag» (kjøkkentjeneste) og «Internat» (internatvask). De to
// oppfører seg likt, og bare tekstene, emojien og API-stien skiller dem –
// serveren deler koden på samme måte (se server/src/duty.js).

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { api } from './api';
import { C, formatWeekRange } from './theme';
import { Banner, Button, Card, Pill } from './ui';

export const DUTY_KINDS = {
  kitchen: {
    base: '/api/dinner/kitchen-duty',
    navn: 'Kjøkkentjeneste',
    liten: 'kjøkkentjeneste',
    emoji: '🍽️',
    neste: 'Din neste tjeneste',
    tab: 'middag',
  },
  dorm: {
    base: '/api/dorm-duty',
    navn: 'Internatvask',
    liten: 'internatvask',
    emoji: '🧹',
    neste: 'Din neste vaskeuke',
    tab: 'internat',
  },
};

export default function DutyPlan({ kind, user, style, showHeading = true }) {
  const cfg = DUTY_KINDS[kind];
  const [weeks, setWeeks] = useState(null);
  const [planOpen, setPlanOpen] = useState(false);

  const load = useCallback(async () => {
    const d = await api(`${cfg.base}?weeks=12`).catch(() => null);
    setWeeks(d?.weeks?.length ? d.weeks : null);
  }, [cfg.base]);

  useEffect(() => { load(); }, [load]);

  if (!weeks) return null;

  const now = weeks[0];
  // Klipp planen etter den siste uken noen er satt opp – tomme uker midt i
  // beholdes, så eleven ser hullene i rundgangen.
  let last = 0;
  weeks.forEach((w, i) => { if (w.students.length) last = i; });
  const upcoming = weeks.slice(1, last + 1);
  const mine = upcoming.find((w) => w.students.some((s) => s.id === user?.id));

  return (
    <View style={style}>
      {showHeading ? <Text style={styles.h1}>{cfg.navn}</Text> : null}
      <Text style={styles.date}>Uke {now.isoWeek} · {formatWeekRange(now.weekStart, now.weekEnd)}</Text>
      <Card style={{ marginTop: 10, padding: 0, paddingVertical: 6 }}>
        {now.students.length ? now.students.map((s, i) => (
          <View key={s.id} style={[styles.dutyRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.line }]}>
            <Text style={styles.dutyName}>{s.fullName}</Text>
            {s.id === user?.id ? <Pill tone="amber" text="Deg" /> : null}
            <Text style={styles.dutyClass}>{s.className || ''}</Text>
          </View>
        )) : (
          <Text style={styles.tom}>Ingen satt opp denne uken.</Text>
        )}
      </Card>

      {mine ? (
        <View style={{ marginTop: 10 }}>
          <Banner text={`🕑 ${cfg.neste}: uke ${mine.isoWeek} · ${formatWeekRange(mine.weekStart, mine.weekEnd)}`} />
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
}

const styles = StyleSheet.create({
  h1: { fontSize: 19, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  date: { fontSize: 13, fontWeight: '700', color: C.muted2, marginTop: 2 },
  tom: { fontSize: 14, color: C.muted, lineHeight: 20, paddingHorizontal: 18, paddingVertical: 10 },
  dutyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 11 },
  dutyName: { flex: 1, fontSize: 15, fontWeight: '700', color: C.ink },
  dutyClass: { fontSize: 13, fontWeight: '600', color: C.muted2 },
  planCard: { borderRadius: 14, padding: 14, marginTop: 8 },
  planWeek: { fontSize: 14, fontWeight: '800', color: C.ink },
  planRange: { fontSize: 12.5, fontWeight: '600', color: C.muted2 },
  planNames: { fontSize: 14.5, fontWeight: '600', color: C.ink, marginTop: 3, lineHeight: 20 },
});
