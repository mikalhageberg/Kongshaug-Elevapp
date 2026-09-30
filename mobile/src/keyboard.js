// Holder tekstfeltet man skriver i synlig over tastaturet, på både iOS og
// Android. Ren JS (ingen native modul), så det kan sendes ut med EAS Update.
//
// Bruk <KeyboardScrollView> i stedet for <ScrollView> og <TextField> i stedet
// for <TextInput>. Når et TextField får fokus, eller tastaturet kommer opp,
// ruller nærmeste KeyboardScrollView akkurat så langt at feltet ligger litt
// over tastaturkanten. Vi måler mot tastaturets faktiske posisjon på skjermen,
// så det virker likt om vinduet krymper (gammel adjustResize), om en
// KeyboardAvoidingView har skjøvet innholdet opp, eller om ingen av delene
// skjer (Android med edge-to-edge).
import React, { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Keyboard, Platform, ScrollView, TextInput } from 'react-native';

const MARGIN = 24;
const ScrollCtx = createContext(null);

function measure(node) {
  return new Promise((resolve) => {
    if (!node?.measureInWindow) return resolve(null);
    node.measureInWindow((x, y, width, height) => resolve({ y, height }));
  });
}

export function KeyboardScrollView({ ref, onScroll, onLayout, onContentSizeChange, children, ...props }) {
  const scroll = useRef(null);
  const offset = useRef(0);
  const viewH = useRef(0);
  const contentH = useRef(0);
  const keyboardTop = useRef(null); // skjerm-y for tastaturets overkant, null = lukket
  const field = useRef(null); // fokusert TextField inni denne rullevisningen

  const reveal = useCallback(async () => {
    const sv = scroll.current;
    const input = field.current;
    if (!sv || !input || keyboardTop.current == null) return;
    const [box, f] = await Promise.all([measure(sv.getNativeScrollRef?.() ?? sv), measure(input)]);
    if (!box || !f || keyboardTop.current == null) return;
    const top = box.y + MARGIN;
    const bottom = Math.min(box.y + box.height, keyboardTop.current) - MARGIN;
    let delta = 0;
    if (f.y < top || f.height > bottom - top) delta = f.y - top;
    else if (f.y + f.height > bottom) delta = f.y + f.height - bottom;
    if (Math.abs(delta) < 1) return;
    const max = Math.max(0, contentH.current - viewH.current);
    sv.scrollTo({ y: Math.min(max, Math.max(0, offset.current + delta)), animated: true });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
      reveal();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => { keyboardTop.current = null; });
    // iOS: forslagslinjen o.l. kan endre tastaturhøyden mens det er oppe.
    const change = Platform.OS === 'ios'
      ? Keyboard.addListener('keyboardDidChangeFrame', (e) => {
          if (keyboardTop.current == null) return;
          keyboardTop.current = e.endCoordinates.screenY;
          reveal();
        })
      : null;
    return () => { show.remove(); hide.remove(); change?.remove(); };
  }, [reveal]);

  const ctx = useRef({
    focus(node) { field.current = node; reveal(); },
    blur(node) { if (field.current === node) field.current = null; },
  }).current;

  const setRef = useCallback((node) => {
    scroll.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);

  return (
    <ScrollCtx.Provider value={ctx}>
      <ScrollView
        ref={setRef}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        {...props}
        onScroll={(e) => { offset.current = e.nativeEvent.contentOffset.y; onScroll?.(e); }}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          const changed = h !== viewH.current;
          viewH.current = h;
          // KeyboardAvoidingView krymper oss gjerne rett etter at tastaturet
          // kom opp – mål på nytt når den nye høyden er på plass.
          if (changed) reveal();
          onLayout?.(e);
        }}
        onContentSizeChange={(w, h) => { contentH.current = h; onContentSizeChange?.(w, h); }}
      >
        {children}
      </ScrollView>
    </ScrollCtx.Provider>
  );
}

export function TextField({ ref, onFocus, onBlur, ...props }) {
  const ctx = useContext(ScrollCtx);
  const input = useRef(null);
  const setRef = useCallback((node) => {
    input.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  return (
    <TextInput
      ref={setRef}
      {...props}
      onFocus={(e) => { ctx?.focus(input.current); onFocus?.(e); }}
      onBlur={(e) => { ctx?.blur(input.current); onBlur?.(e); }}
    />
  );
}
