import React from 'react';
import { Text, View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { C } from './theme';

export function Button({ title, onPress, disabled, loading, color = C.navy, textColor = '#fff', style, fontSize = 17 }) {
  return (
    <Pressable
      onPress={disabled || loading ? undefined : onPress}
      style={[
        styles.btn,
        { backgroundColor: disabled ? '#e7e9ed' : color },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.btnText, { color: disabled ? '#aab1bd' : textColor, fontSize }]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Pill({ text, tone = 'grey' }) {
  const map = {
    green: [C.greenBg, C.greenInk],
    red: [C.redBg, C.redInk],
    amber: [C.amberBg, C.amberInk],
    grey: ['#eef1f5', C.slate],
  };
  const [bg, fg] = map[tone] || map.grey;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <View style={[styles.pillDot, { backgroundColor: fg }]} />
      <Text style={{ color: fg, fontWeight: '700', fontSize: 13 }}>{text}</Text>
    </View>
  );
}

export function Card({ children, style, onPress }) {
  const inner = <View style={[styles.card, style]}>{children}</View>;
  return onPress ? <Pressable onPress={onPress}>{inner}</Pressable> : inner;
}

export function Banner({ text, tone = 'grey' }) {
  const map = {
    green: [C.greenBg, C.greenInk],
    red: [C.redBg, C.redInk],
    grey: ['#eef1f5', C.slate],
  };
  const [bg, fg] = map[tone] || map.grey;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: 13 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18,
  },
  btnText: { fontSize: 17, fontWeight: '700' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
    paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999,
  },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  card: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 22, padding: 20,
  },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12,
  },
});
