import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { api, getPositionOnCampus } from '../api';
import { C, formatTime, formatDateLong, formatWeekRange, initials, todayStr, greeting } from '../theme';
import { Card, Pill, Banner, Button } from '../ui';

// «sammen med X og Y» – hvem eleven deler tjenesteuken med.
function dutyPartners(week, meId) {
  const others = week.students.filter((s) => s.id !== meId).map((s) => s.fullName);
  if (!others.length) return '';
  const list = others.length === 1 ? others[0] : `${others.slice(0, -1).join(', ')} og ${others[others.length - 1]}`;
  return ` · sammen med ${list}`;
}

export default function DashboardScreen({ user, onLogout, goTo }) {
  const [fire, setFire] = useState(null);
  const [andakt, setAndakt] = useState(null);
  const [duty, setDuty] = useState(null);
  const [geo, setGeo] = useState({ tone: 'grey', text: 'Sjekker posisjon…' });
  const [refreshing, setRefreshing] = useState(false);
  const today = todayStr();

  const load = useCallback(async () => {
    const [f, a, k] = await Promise.all([
      api('/api/firelist/status').catch(() => null),
      api('/api/andakt/status').catch(() => null),
      api('/api/dinner/kitchen-duty/me').catch(() => null),
    ]);
    setFire(f);
    setAndakt(a);
    setDuty(k);
  }, []);

  useEffect(() => {
    load();
    getPositionOnCampus()
      .then(({ coords, ok, distance }) => setGeo(ok
        ? { tone: 'green', text: '📍 Du er ved skolen · GPS OK' }
        : { tone: 'red', text: `📍 Du er ikke ved skolen · ${distance} m unna\nDin posisjon: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` }))
      .catch((ex) => setGeo({ tone: 'red', text: '📍 ' + ex.message }));
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

      {/* Kjøkkentjeneste: tydelig kort i tjenesteuken, diskret varsel uken før. */}
      {duty?.thisWeek ? (
        <Card style={styles.dutyCard} onPress={() => goTo('middag')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={[styles.cardIcon, { backgroundColor: C.amberInk }]}><Text style={{ fontSize: 24 }}>🍽️</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: C.amberInk }]}>Du har kjøkkentjeneste denne uken</Text>
              <Text style={styles.dutySub}>
                Uke {duty.thisWeek.isoWeek} · {formatWeekRange(duty.thisWeek.weekStart, duty.thisWeek.weekEnd)}
                {dutyPartners(duty.thisWeek, user.id)}
              </Text>
            </View>
          </View>
        </Card>
      ) : duty?.nextWeek ? (
        <View style={{ marginBottom: 14 }}>
          <Banner text={`🍽️ Du har kjøkkentjeneste neste uke · uke ${duty.nextWeek.isoWeek}`} />
        </View>
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
  dutySub: { fontSize: 13, color: C.amberInk, fontWeight: '600', marginTop: 3, lineHeight: 18 },
});
