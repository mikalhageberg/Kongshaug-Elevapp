// Internat: elevens egen fane for internatvask – hvem vasker denne uken, og
// hele rundgangen framover. Selve visningen er delt med kjøkkentjenesten.
// Her ligger også «Se mine prikker» (prikkesystemet, se Prikker.js).

import React, { useState } from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { C, formatDateLong, todayStr } from '../theme';
import { Button } from '../ui';
import DutyPlan from '../DutyPlan';
import { MinePrikkerModal } from '../Prikker';

export default function InternatScreen({ user }) {
  const [prikker, setPrikker] = useState(false);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.surface }} contentContainerStyle={{ padding: 22, paddingBottom: 40 }}>
      <Text style={styles.h1}>Internat</Text>
      <Text style={styles.date}>{formatDateLong(todayStr())}</Text>
      <Button
        title="Se mine prikker"
        onPress={() => setPrikker(true)}
        color="#fff"
        textColor={C.navy}
        style={{ marginTop: 18, height: 52, borderWidth: 1.5, borderColor: C.line2 }}
        fontSize={16}
      />
      <DutyPlan kind="dorm" user={user} style={{ marginTop: 20 }} showHeading={false} />
      <MinePrikkerModal visible={prikker} onClose={() => setPrikker(false)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  date: { fontSize: 13, fontWeight: '700', color: C.muted2, marginTop: 2 },
});
