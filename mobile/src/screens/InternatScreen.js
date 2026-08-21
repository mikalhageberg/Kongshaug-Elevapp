// Internat: elevens egen fane for internatvask – hvem vasker denne uken, og
// hele rundgangen framover. Selve visningen er delt med kjøkkentjenesten.

import React from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { C, formatDateLong, todayStr } from '../theme';
import DutyPlan from '../DutyPlan';

export default function InternatScreen({ user }) {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.surface }} contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
      <Text style={styles.h1}>Internat</Text>
      <Text style={styles.date}>{formatDateLong(todayStr())}</Text>
      <DutyPlan kind="dorm" user={user} style={{ marginTop: 20 }} showHeading={false} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  date: { fontSize: 13, fontWeight: '700', color: C.muted2, marginTop: 2 },
});
