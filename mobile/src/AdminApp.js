import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { C } from './theme';
import BrannlisteAdminScreen from './screens/admin/BrannlisteAdminScreen';
import VaktScreen from './screens/admin/VaktScreen';

// Administratorens app. Bevisst mye smalere enn elevappen: brannlisten og
// vakten, ingenting annet. Alt det andre – brukere, andakt, gjester, menyer –
// hører hjemme på adminsiden, der man sitter ned og har tastatur.
//
// De to fanene henger sammen: uten vakt gir Brannliste ingenting, og knappen
// der sender rett til Vakt.
const TABS = [
  { key: 'brann', label: 'Brannliste', icon: '🔥' },
  { key: 'vakt', label: 'Vakt', icon: '🛡️' },
];

export default function AdminApp({ user, onLogout, insets }) {
  const [tab, setTab] = useState('brann');
  // Endres vakten, skal brannlisten lastes på nytt neste gang den vises –
  // ellers står «Du har ikke vakten» igjen etter at koden nettopp ble skannet.
  const [vaktNøkkel, setVaktNøkkel] = useState(0);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === 'brann' && (
          <BrannlisteAdminScreen key={vaktNøkkel} onNeedWatch={() => setTab('vakt')} />
        )}
        {tab === 'vakt' && (
          <VaktScreen
            user={user}
            onLogout={onLogout}
            onChanged={() => setVaktNøkkel((n) => n + 1)}
          />
        )}
      </View>

      <View style={[styles.tabbar, { paddingBottom: 8 + insets.bottom }]}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
              <Text style={{ fontSize: 22, opacity: active ? 1 : 0.45 }}>{t.icon}</Text>
              <Text numberOfLines={1} style={[styles.tabLabel, { color: active ? C.navy : C.muted2, fontWeight: active ? '700' : '600' }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabbar: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4, paddingVertical: 4 },
  tabLabel: { fontSize: 11 },
});
