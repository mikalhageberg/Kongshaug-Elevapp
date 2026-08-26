// Ukestjeneste-plan: denne uken i detalj, og hele rundgangen framover.
//
// Delt mellom «Middag» (kjøkkentjeneste) og «Internat» (internatvask). De to
// oppfører seg likt, og bare tekstene, emojien og API-stien skiller dem –
// serveren deler koden på samme måte (se server/src/duty.js).

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { api } from './api';
import { C, formatWeekRange } from './theme';
import { Banner, Button, Card, Pill } from './ui';
import OppgaveModal from './OppgaveModal';

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
    // Internatvasken har oppgaver med beskrivelse og signering (se dormTasks.js
    // på serveren). Kjøkkentjenesten har bare navn på uken.
    hasTasks: true,
  },
};

export default function DutyPlan({ kind, user, style, showHeading = true }) {
  const cfg = DUTY_KINDS[kind];
  const [weeks, setWeeks] = useState(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [åpenOppgave, setÅpenOppgave] = useState(null);   // raden som vises i oppgavevinduet

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
  const minesNå = now.students.filter((s) => s.id === user?.id);

  return (
    <View style={style}>
      {showHeading ? <Text style={styles.h1}>{cfg.navn}</Text> : null}
      <Text style={styles.date}>Uke {now.isoWeek} · {formatWeekRange(now.weekStart, now.weekEnd)}</Text>
      <Card style={{ marginTop: 10, padding: 0, paddingVertical: 6 }}>
        {now.students.length ? now.students.map((s, i) => {
          const min = s.id === user?.id;
          const rad = (
            <View key={s.dutyId || s.id} style={[styles.dutyRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.line }]}>
              {/* Navnet får alltid minst dutyMain.minWidth. Blir det for trangt –
                  lange navn, eller stor skrift i systeminnstillingene – brekker
                  merkelappene ned på en egen linje i stedet for å presse navnet
                  ned til én bokstav per linje. */}
              <View style={styles.dutyMain}>
                <Text style={styles.dutyName}>{s.fullName}</Text>
                {cfg.hasTasks && s.task ? (
                  <Text style={styles.dutyTask}>{s.task.code} · {s.task.title}</Text>
                ) : null}
              </View>
              <View style={styles.dutyMeta}>
                {cfg.hasTasks && s.done ? <Pill tone="green" text="Signert" /> : null}
                {min ? <Pill tone="amber" text="Deg" /> : null}
                <Text style={styles.dutyClass}>{s.className || ''}</Text>
              </View>
            </View>
          );
          // Egne oppgaver kan åpnes: der ligger hele beskrivelsen og signeringen.
          if (!cfg.hasTasks || !min) return rad;
          return (
            <Pressable key={s.dutyId || s.id} onPress={() => setÅpenOppgave(s)}>{rad}</Pressable>
          );
        }) : (
          <Text style={styles.tom}>Ingen satt opp denne uken.</Text>
        )}
      </Card>

      {/* Mine oppgaver denne uken: én knapp per oppgave, med signaturstatus.
          Det er her eleven leser hva som skal gjøres, og skriver under. */}
      {cfg.hasTasks && minesNå.length ? (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.mineTittel}>Dine oppgaver denne uken</Text>
          {minesNå.map((s) => (
            <Card key={s.dutyId} style={[styles.mineKort, s.done && { backgroundColor: C.greenBg, borderColor: C.greenBg }]}
              onPress={() => setÅpenOppgave(s)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 20 }}>{s.done ? '✅' : cfg.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.mineNavn, s.done && { color: C.green }]}>
                    {s.task ? s.task.title : 'Internatvask uten oppgave'}
                  </Text>
                  <Text style={[styles.mineSub, s.done && { color: C.green }]}>
                    {s.done ? 'Signert – trykk for kvitteringen' : 'Trykk for å lese oppgaven og signere'}
                  </Text>
                </View>
              </View>
            </Card>
          ))}
        </View>
      ) : null}

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

      {cfg.hasTasks ? (
        <OppgaveModal
          visible={!!åpenOppgave}
          duty={åpenOppgave}
          week={now}
          base={cfg.base}
          kanSignere={åpenOppgave?.id === user?.id}
          onClose={() => setÅpenOppgave(null)}
          onSigned={load}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 19, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  date: { fontSize: 13, fontWeight: '700', color: C.muted2, marginTop: 2 },
  tom: { fontSize: 14, color: C.muted, lineHeight: 20, paddingHorizontal: 18, paddingVertical: 10 },
  dutyRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 6, paddingHorizontal: 18, paddingVertical: 11 },
  dutyMain: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 150 },
  dutyMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginLeft: 'auto' },
  dutyName: { fontSize: 15, fontWeight: '700', color: C.ink },
  dutyClass: { fontSize: 13, fontWeight: '600', color: C.muted2 },
  dutyTask: { fontSize: 12.5, fontWeight: '700', color: C.muted2, marginTop: 2 },
  mineTittel: { fontSize: 14, fontWeight: '800', color: C.ink, marginBottom: 6 },
  mineKort: { borderRadius: 14, padding: 14, marginTop: 8, backgroundColor: C.amberBg, borderColor: C.amber, borderWidth: 1 },
  mineNavn: { fontSize: 15, fontWeight: '800', color: C.amberInk },
  mineSub: { fontSize: 12.5, fontWeight: '600', color: C.amberInk, opacity: 0.85, marginTop: 2 },
  planCard: { borderRadius: 14, padding: 14, marginTop: 8 },
  planWeek: { fontSize: 14, fontWeight: '800', color: C.ink },
  planRange: { fontSize: 12.5, fontWeight: '600', color: C.muted2 },
  planNames: { fontSize: 14.5, fontWeight: '600', color: C.ink, marginTop: 3, lineHeight: 20 },
});
