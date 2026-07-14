import React, { useState, useEffect, useCallback } from 'react';
import { ScrollView, View, Text, Pressable, TextInput, StyleSheet, Linking, Modal } from 'react-native';
import { api, fileUrl } from '../api';
import { C, formatDateLong, todayStr } from '../theme';
import { Button, Card } from '../ui';

// Modal-«rullegardin» for allergivalg: én rad å trykke på i stedet for et
// stort rutenett med chips. Utvalget lagres fortsatt kun når man trykker «Lagre».
function AllergyPickerModal({ visible, onClose, common, customs, selected, onToggle, onAddCustom }) {
  const [custom, setCustom] = useState('');
  function submitCustom() {
    const v = custom.trim();
    if (v) { onAddCustom(v); setCustom(''); }
  }
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={styles.modalWrap}>
        <View style={styles.modalHead}>
          <Text style={styles.modalTitle}>Velg allergier</Text>
          <Pressable onPress={onClose} hitSlop={12}><Text style={{ fontSize: 22, color: C.muted2 }}>✕</Text></Pressable>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
          {[...common, ...customs].map((label) => {
            const on = selected.includes(label);
            return (
              <Pressable key={label} onPress={() => onToggle(label)} style={styles.optionRow}>
                <Text style={styles.optionLabel}>{label}</Text>
                <View style={[styles.checkbox, on && { backgroundColor: C.navy, borderColor: C.navy }]}>
                  {on ? <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>✓</Text> : null}
                </View>
              </Pressable>
            );
          })}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <TextInput value={custom} onChangeText={setCustom} placeholder="Legg til egen…" placeholderTextColor={C.muted2} style={styles.input} onSubmitEditing={submitCustom} returnKeyType="done" />
            <Button title="Legg til" color="#fff" textColor={C.navy} onPress={submitCustom} fontSize={15} style={{ paddingHorizontal: 18, borderWidth: 1.5, borderColor: '#d3dae2' }} />
          </View>
        </ScrollView>
        <View style={styles.modalFooter}>
          <Button title="Ferdig" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

export default function MiddagScreen() {
  const [dinner, setDinner] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState([]);
  const [saved, setSaved] = useState([]);
  const [common, setCommon] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [menus, setMenus] = useState([]);
  const [parsed, setParsed] = useState({}); // { [menuId]: { days, note } }
  const [pickerOpen, setPickerOpen] = useState(false);

  const loadDinner = useCallback(async () => {
    setDinner(await api('/api/dinner/status').catch(() => null));
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
    api('/api/dinner/allergies').then((a) => { setSelected(a.allergies); setSaved(a.allergies); setCommon(a.common); }).catch(() => {});
    loadMenus();
  }, [loadDinner, loadMenus]);

  async function toggleDinner() {
    if (!dinner) return;
    setBusy(true);
    try { await api('/api/dinner/optout', { method: dinner.optedOut ? 'DELETE' : 'POST' }); await loadDinner(); }
    catch { /* ignorer */ } finally { setBusy(false); }
  }

  // Endringer lagres lokalt (utkast) – lagres først når man trykker «Lagre».
  const toggleAllergy = (label) => setSelected((cur) => (cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]));
  function addCustom(value) {
    const v = value.trim();
    if (v && !selected.includes(v)) setSelected([...selected, v]);
  }
  async function saveAllergies() {
    setSaving(true);
    try {
      const r = await api('/api/dinner/allergies', { method: 'PUT', body: { allergies: selected } });
      setSelected(r.allergies); setSaved(r.allergies);
      setSavedFlash(true); setTimeout(() => setSavedFlash(false), 2500);
    } catch { /* ignorer */ } finally { setSaving(false); }
  }

  const customs = selected.filter((x) => !common.includes(x));
  const dirty = !(selected.length === saved.length && selected.every((x) => saved.includes(x)));

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

      <Text style={[styles.h1, { fontSize: 19, marginTop: 26 }]}>Mine allergier</Text>
      <Text style={styles.sub}>Meld inn det kjøkkenet må ta hensyn til. Vises for kjøkkenet på dagene du spiser.</Text>

      <Pressable onPress={() => setPickerOpen(true)} style={styles.dropdown}>
        <Text style={[styles.dropdownText, !selected.length && { color: C.muted2 }]} numberOfLines={1}>
          {selected.length ? selected.join(', ') : 'Ingen valgt'}
        </Text>
        <Text style={{ color: C.muted2, fontSize: 13 }}>▾</Text>
      </Pressable>

      <AllergyPickerModal
        visible={pickerOpen} onClose={() => setPickerOpen(false)}
        common={common} customs={customs} selected={selected}
        onToggle={toggleAllergy} onAddCustom={addCustom}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 14, marginTop: 18 }}>
        {savedFlash ? <Text style={{ color: C.greenInk, fontWeight: '700' }}>Lagret ✓</Text> : null}
        <Button title="Lagre allergier" onPress={saveAllergies} loading={saving} disabled={!dirty} fontSize={15} style={{ paddingHorizontal: 24 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: '800', color: C.ink, letterSpacing: -0.5 },
  date: { fontSize: 13, fontWeight: '700', color: C.muted2, marginTop: 2 },
  sub: { fontSize: 14, color: C.muted, lineHeight: 20, marginTop: 6 },
  icon: { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.ink },
  dropdown: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, height: 50, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line2, borderRadius: 14, paddingHorizontal: 16, marginTop: 14 },
  dropdownText: { flex: 1, fontSize: 15, fontWeight: '700', color: C.ink },
  input: { flex: 1, height: 46, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line2, borderRadius: 14, paddingHorizontal: 14, fontSize: 15, color: C.ink },
  modalWrap: { flex: 1, backgroundColor: C.surface },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 10 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: C.ink },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 12, padding: 14, marginBottom: 8 },
  optionLabel: { fontSize: 15, fontWeight: '700', color: C.ink },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: C.line2, alignItems: 'center', justifyContent: 'center' },
  modalFooter: { padding: 16, borderTopWidth: 1, borderTopColor: C.line },
  menuCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, marginTop: 12, overflow: 'hidden' },
  menuHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  pdfBtn: { height: 38, paddingHorizontal: 14, borderRadius: 11, borderWidth: 1.5, borderColor: '#d3dae2', alignItems: 'center', justifyContent: 'center' },
  dayRow: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line },
  dayName: { fontSize: 13, fontWeight: '800', color: C.red, letterSpacing: 0.4, textTransform: 'uppercase' },
  dayDishes: { fontSize: 15, fontWeight: '600', color: C.navy, marginTop: 3, lineHeight: 21 },
  dayNote: { fontSize: 12.5, color: C.muted, marginTop: 3, lineHeight: 18 },
});
