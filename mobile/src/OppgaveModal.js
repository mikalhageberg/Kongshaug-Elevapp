import React, { useState, useEffect } from 'react';
import { Modal, View, Text, Pressable, Platform, ScrollView, StyleSheet } from 'react-native';
import { api } from './api';
import { C, formatWeekRange } from './theme';
import { Button, Pill } from './ui';
import { authenticate, biometriNavn } from './screens/LockScreen';

// Én oppgave i internatvasken: hele beskrivelsen slik den står på vaskelista,
// og signeringen når jobben er gjort.
//
// Signaturen er Face ID / fingeravtrykk – telefonens egen låsing. Den er en
// kvittering, ikke et bevis: låsingen skjer på elevens enhet, og serveren kan
// ikke etterprøve den. Poenget er forpliktelsen i å skrive under selv.

const stempel = (iso) => {
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T') + 'Z');
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} kl. ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const METODE = {
  passord: 'passord i nettleseren',
  admin: 'lagt inn av administrasjonen',
};

export default function OppgaveModal({ visible, onClose, duty, week, base, kanSignere, onSigned }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  // Gjett ut fra plattformen med én gang, så knappen aldri står tom, og rett
  // den opp når telefonen har svart på hva den faktisk støtter.
  const [biometri, setBiometri] = useState(Platform.OS === 'ios' ? 'Face ID' : 'fingeravtrykk');

  useEffect(() => { biometriNavn().then(setBiometri).catch(() => {}); }, []);
  useEffect(() => { if (visible) setErr(null); }, [visible]);

  if (!duty) return null;
  const task = duty.task;
  const done = duty.done;

  async function signer() {
    setErr(null);
    setBusy(true);
    try {
      const r = await authenticate({ prompt: 'Signer at oppgaven er gjort' });
      // Uten Face ID/kode på telefonen har vi ingenting å signere med. Da er det
      // ærligere å si det enn å lagre en signatur ingen faktisk har gitt.
      if (r.unprotected) {
        // Her nevner vi ikke én bestemt metode: telefonen har ingen av dem.
        setErr('Telefonen har verken biometri eller kode slått på. Slå det på i telefonens innstillinger, eller signer i nettleseren med passordet ditt.');
        return;
      }
      if (!r.success) { setErr('Signeringen ble avbrutt.'); return; }
      await api(`${base}/duties/${duty.dutyId}/sign`, { method: 'POST', body: { method: 'biometri' } });
      onSigned?.();
      onClose?.();
    } catch (ex) {
      setErr(ex.message || 'Kunne ikke signere.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.head}>
          <Text style={styles.title}>{task ? task.title : 'Internatvask'}</Text>
          <Pressable onPress={onClose} hitSlop={12}><Text style={styles.close}>Lukk</Text></Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {task ? <Pill tone="grey" text={task.code} /> : null}
            {week ? <Text style={styles.uke}>Uke {week.isoWeek} · {formatWeekRange(week.weekStart, week.weekEnd)}</Text> : null}
          </View>

          <Text style={styles.body}>
            {task?.description?.trim() || 'Ingen beskrivelse er lagt inn på denne oppgaven ennå.'}
          </Text>

          {done ? (
            <View style={styles.kvittering}>
              <Text style={styles.kvitteringTittel}>✓ Signert {stempel(done.at)}</Text>
              <Text style={styles.kvitteringSub}>
                {done.method === 'biometri' ? biometri : (METODE[done.method] || done.method)}
                {done.method === 'admin' && done.by ? ` · ${done.by}` : ''}
              </Text>
            </View>
          ) : kanSignere ? (
            <>
              <Text style={styles.forklaring}>
                Når jobben er gjort, signerer du med {biometri}. Signaturen står med navnet ditt
                og klokkeslettet i internatets oversikt.
              </Text>
              <Button
                title={`Signer med ${biometri}`}
                onPress={signer}
                loading={busy}
                disabled={busy}
                style={{ marginTop: 16 }}
              />
            </>
          ) : (
            <Text style={styles.forklaring}>Denne oppgaven står på en annen elev denne uken.</Text>
          )}

          {err ? <Text style={styles.err}>{err}</Text> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.surface },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: '#fff',
  },
  title: { flex: 1, fontSize: 19, fontWeight: '800', color: C.ink, letterSpacing: -0.4 },
  close: { fontSize: 16, fontWeight: '700', color: C.navy },
  uke: { fontSize: 13, fontWeight: '700', color: C.muted2 },
  body: { fontSize: 15.5, lineHeight: 23, color: C.ink, marginTop: 14 },
  forklaring: { fontSize: 13.5, lineHeight: 20, color: C.muted, marginTop: 18 },
  kvittering: {
    marginTop: 20, backgroundColor: C.greenBg, borderRadius: 14, padding: 14,
  },
  kvitteringTittel: { fontSize: 15, fontWeight: '800', color: C.green },
  kvitteringSub: { fontSize: 13, fontWeight: '600', color: C.green, opacity: 0.85, marginTop: 3 },
  err: { fontSize: 14, fontWeight: '600', color: C.red, lineHeight: 20, marginTop: 16 },
});
