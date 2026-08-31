import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { api, resolveCampusStatus } from '../api';
import { C, formatTime, formatDateLong, formatDateShort, formatWeekRange, initials, todayStr, greeting } from '../theme';
import { Card, Pill, Banner, Button, campusBanner } from '../ui';
import { DUTY_KINDS } from '../DutyPlan';
import Versjon from '../Versjon';
import OvingModal from './OvingModal';

// Totaltid i øvekonkurransen, kort form: «2 t 15 min».
function practiceTotal(sek) {
  const n = Math.max(0, Math.round(sek || 0));
  if (n < 60) return `${n} sek`;
  const t = Math.floor(n / 3600);
  const m = Math.round((n % 3600) / 60);
  if (!t) return `${m} min`;
  return m ? `${t} t ${m} min` : `${t} t`;
}

// «sammen med X og Y» – hvem eleven deler tjenesteuken med. Samme elev kan stå
// på flere oppgaver samme uke, så navnene må være unike.
function dutyPartners(week, meId) {
  const others = [...new Set(week.students.filter((s) => s.id !== meId).map((s) => s.fullName))];
  if (!others.length) return '';
  const list = others.length === 1 ? others[0] : `${others.slice(0, -1).join(', ')} og ${others[others.length - 1]}`;
  return ` · sammen med ${list}`;
}

// «80-gongen, KJØKKEN · 1 av 2 signert» – elevens egne oppgaver i vaskeuken.
// Tom streng når tjenesten ikke har oppgaver (kjøkkentjeneste).
function dutyTaskSummary(week, meId) {
  const mine = week.students.filter((s) => s.id === meId && s.task);
  if (!mine.length) return '';
  const signert = mine.filter((s) => s.done).length;
  const status = signert === mine.length
    ? ' · alt signert ✓'
    : ` · ${signert} av ${mine.length} signert`;
  return `\n${mine.map((s) => s.task.title).join(', ')}${status}`;
}

export default function DashboardScreen({ user, onLogout, goTo }) {
  const [fire, setFire] = useState(null);
  const [andakt, setAndakt] = useState(null);
  const [duties, setDuties] = useState({});  // { kitchen: {...}, dorm: {...} }
  const [todayMenu, setTodayMenu] = useState(null); // { dinner, guard } fra ukemenyen
  const [guests, setGuests] = useState([]); // egne gjester (venter/godkjent)
  const [practice, setPractice] = useState(null);   // øvekonkurransen, null = ikke lastet
  const [ovingOpen, setOvingOpen] = useState(false);
  const [geo, setGeo] = useState({ tone: 'grey', text: 'Sjekker posisjon…' });
  const [refreshing, setRefreshing] = useState(false);
  const today = todayStr();

  const load = useCallback(async () => {
    const kinds = Object.keys(DUTY_KINDS);
    const [f, a, t, g, p, ...d] = await Promise.all([
      api('/api/firelist/status').catch(() => null),
      api('/api/andakt/status').catch(() => null),
      api('/api/menus/today').catch(() => null),
      api('/api/firelist/guests/me').catch(() => null),
      api('/api/practice/status').catch(() => null),
      ...kinds.map((k) => api(`${DUTY_KINDS[k].base}/me`).catch(() => null)),
    ]);
    setFire(f);
    setAndakt(a);
    setTodayMenu(t);
    setGuests(g?.guests || []);
    setPractice(p);
    setDuties(Object.fromEntries(kinds.map((k, i) => [k, d[i]])));
  }, []);

  useEffect(() => {
    load();
    // Banneret oppdaterer seg selv: først et foreløpig svar hvis telefonen har
    // en fersk posisjon fra før, så det endelige. Avbrytes ved unmount.
    return resolveCampusStatus((s) => setGeo(campusBanner(s)));
  }, [load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const firePill = fire == null
    ? <Pill text="Laster…" />
    : fire.status === 'present'
      ? <Pill tone="green" text={`Registrert ${formatTime(fire.checkedAt)}`} />
      : fire.status === 'away'
        ? <Pill tone="grey" text="🏠 Meldt borte i natt" />
        : <Pill tone="red" text="Ikke registrert" />;

  const andaktPill = andakt == null
    ? <Pill text="Laster…" />
    : !andakt.registered
      ? <Pill text="Ikke registrert ennå" />
      : andakt.status === 'late'
        ? <Pill tone="amber" text="Registrert for sent" />
        : <Pill tone="green" text={`Registrert ${formatTime(andakt.checkedAt)}`} />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: C.surface }}
      contentContainerStyle={{ padding: 22, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.head}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={styles.h1}>{greeting()}, {user.fullName.split(' ')[0]}</Text>
          <Text style={styles.date}>{formatDateLong(today)}</Text>
        </View>
        <View style={styles.avatar}><Text style={{ color: C.navy, fontWeight: '800' }}>{initials(user.fullName)}</Text></View>
      </View>

      <View style={{ marginBottom: 16 }}><Banner tone={geo.tone} text={geo.text} /></View>

      {/* Gjeste-status: venter på godkjenning / godkjent med tildelt rom. */}
      {guests.map((g) => {
        // Samme formatering som elevappen på nett, så de to viser identisk tekst.
        // (Intervallet viste tidligere rå ISO-datoer: «2026-08-28 – 2026-08-29».)
        const dates = g.startDate === g.endDate
          ? formatDateShort(g.startDate)
          : `${formatDateShort(g.startDate)} – ${formatDateShort(g.endDate)}`;
        const approved = g.status === 'approved';
        const place = approved && g.dorm ? `${g.dorm}${g.room ? ' · rom ' + g.room : ''} · ` : '';
        return (
          <Pressable key={g.id} style={{ marginBottom: 12 }} onPress={() => goTo('brann')}>
            <Banner tone={approved ? 'green' : 'amber'}
              text={approved
                ? `✓ Gjest godkjent: ${g.guestName} · ${place}${dates}`
                : `🕑 Gjest venter på godkjenning: ${g.guestName}`} />
          </Pressable>
        );
      })}

      {/* Ukestjeneste: tydelig kort i tjenesteuken, diskret varsel uken før.
          Samme oppsett for kjøkkentjeneste og internatvask – har eleven begge
          samme uke, står de under hverandre. */}
      {/* Denne uken før neste uke: det som haster skal stå øverst. */}
      {Object.entries(DUTY_KINDS)
        .sort(([a], [b]) => (duties[b]?.thisWeek ? 1 : 0) - (duties[a]?.thisWeek ? 1 : 0))
        .map(([kind, cfg]) => {
        const d = duties[kind];
        if (d?.thisWeek) {
          return (
            <Card key={kind} style={styles.dutyCard} onPress={() => goTo(cfg.tab)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={[styles.cardIcon, { backgroundColor: C.amberInk }]}><Text style={{ fontSize: 24 }}>{cfg.emoji}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: C.amberInk }]}>Du har {cfg.liten} denne uken</Text>
                  <Text style={styles.dutySub}>
                    Uke {d.thisWeek.isoWeek} · {formatWeekRange(d.thisWeek.weekStart, d.thisWeek.weekEnd)}
                    {dutyPartners(d.thisWeek, user.id)}
                    {dutyTaskSummary(d.thisWeek, user.id)}
                  </Text>
                </View>
              </View>
            </Card>
          );
        }
        if (d?.nextWeek) {
          return (
            <View key={kind} style={{ marginBottom: 14 }}>
              <Banner text={`${cfg.emoji} Du har ${cfg.liten} neste uke · uke ${d.nextWeek.isoWeek}`} />
            </View>
          );
        }
        return null;
      })}

      {/* Øvekonkurranse: bare synlig mens en konkurranse faktisk pågår. Den
          arrangeres av og til, og et kort som står tomt resten av året ville
          bare vært støy på hjemskjermen.
          Er konkurransen fryst, blir kortet stående ut perioden – forsvant det,
          ville elevene trodd at konkurransen var avlyst. inPeriod er ny; || active
          holder kortet på plass mot en server som ikke sender feltet ennå. */}
      {practice?.competition?.active || practice?.competition?.inPeriod ? (
        <Card style={styles.ovingCard} onPress={() => setOvingOpen(true)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={[styles.cardIcon, { backgroundColor: C.navy }]}><Text style={{ fontSize: 24 }}>🎻</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Øvekonkurranse</Text>
              <Text style={styles.ovingSub}>
                {practice.competition.frozen
                  ? '🧊 Fryst av skolen – stillingen står stille'
                  : practice.pending
                    ? 'Du har en økt som pågår – trykk for å fortsette'
                    : practice.totalSeconds
                      ? `Du har øvd ${practiceTotal(practice.totalSeconds)} så langt`
                      : 'Start en økt og få tiden registrert'}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {/* I dag: middagsrett + nattens internatvakt, fra ukemenyen. */}
      {todayMenu && (todayMenu.dinner || todayMenu.guard) ? (
        <Card style={{ marginBottom: 14, paddingVertical: 6 }}>
          {todayMenu.dinner ? (
            <View style={styles.todayRow}>
              <Text style={styles.todayIcon}>🍽️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.todayLabel}>Middag i dag</Text>
                <Text style={styles.todayValue}>{todayMenu.dinner.dishes.join(', ')}</Text>
                {todayMenu.dinner.note ? <Text style={styles.todaySub}>{todayMenu.dinner.note}</Text> : null}
              </View>
            </View>
          ) : null}
          {todayMenu.dinner && todayMenu.guard ? <View style={styles.todayDivider} /> : null}
          {todayMenu.guard ? (
            <View style={styles.todayRow}>
              <Text style={styles.todayIcon}>🌙</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.todayLabel}>Internatvakt i natt</Text>
                <Text style={styles.todayValue}>{todayMenu.guard.name}</Text>
              </View>
            </View>
          ) : null}
        </Card>
      ) : null}

      <Card style={{ marginBottom: 14 }} onPress={() => goTo('brann')}>
        <View style={styles.cardHead}>
          <View style={styles.cardIcon}><Text style={{ fontSize: 24 }}>🔥</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Brannliste i kveld</Text>
            <Text style={styles.cardSub}>Meld deg til stede</Text>
          </View>
        </View>
        {firePill}
      </Card>

      <Card onPress={() => goTo('andakt')}>
        <View style={styles.cardHead}>
          <View style={styles.cardIcon}><Text style={{ fontSize: 22 }}>📖</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Andakt i dag</Text>
            <Text style={styles.cardSub}>Skann på storskjerm</Text>
          </View>
        </View>
        {andaktPill}
      </Card>

      <Button title="Logg ut" onPress={onLogout} color="#fff" textColor={C.slate}
        style={{ marginTop: 24, borderWidth: 1.5, borderColor: '#d3dae2', height: 48 }} />

      {/* Hvilken app og hvilken oppdatering som kjører. Diskret, men det gjør
          «hvilken versjon har du?» til et spørsmål eleven kan svare på. */}
      <Versjon />

      <OvingModal visible={ovingOpen} onClose={() => { setOvingOpen(false); load(); }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  h1: { fontSize: 24, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  date: { fontSize: 13, fontWeight: '700', color: C.muted2, marginTop: 2 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#dbe4ef', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  cardIcon: { width: 50, height: 50, borderRadius: 15, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 18, fontWeight: '800', color: C.ink },
  cardSub: { fontSize: 13, color: C.muted2, fontWeight: '600', marginTop: 2 },
  dutyCard: { marginBottom: 14, backgroundColor: C.amberBg, borderColor: C.amber },
  ovingCard: { marginBottom: 14 },
  ovingSub: { fontSize: 13, color: C.muted, fontWeight: '600', marginTop: 3, lineHeight: 18 },
  dutySub: { fontSize: 13, color: C.amberInk, fontWeight: '600', marginTop: 3, lineHeight: 18 },
  todayRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  todayIcon: { fontSize: 22, lineHeight: 26 },
  todayLabel: { fontSize: 12.5, fontWeight: '700', color: C.muted2, letterSpacing: 0.4, textTransform: 'uppercase' },
  todayValue: { fontSize: 15.5, fontWeight: '700', color: C.ink, marginTop: 2, lineHeight: 21 },
  todaySub: { fontSize: 12.5, color: C.muted, marginTop: 2 },
  todayDivider: { height: 1, backgroundColor: C.line },
});
