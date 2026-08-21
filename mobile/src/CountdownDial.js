// Sirkulær nedtellingsskive som tømmes mot klokken.
//
// Tegnet med rene View-er, uten SVG: prosjektet har ingen tegnepakke, og å
// legge til en ville krevd et nytt native-bygg for noe som kan løses med to
// maskerte halvsirkler.
//
// Slik virker det: sirkelen deles i en venstre og en høyre halvdel, hver med
// overflow: 'hidden'. Inni hver ligger en halvskive som roterer om SIRKELENS
// sentrum (transformOrigin). Roteres halvskiven helt over i nabohalvdelen, blir
// den klippet bort og vises ikke. Vinkelen den står i bestemmer dermed hvor mye
// av halvdelen som er synlig.
//
// Fyllet måles MED klokken fra klokka 12. Da ligger enden av buen på θ grader
// med klokken – og når θ krymper mot null, vandrer enden bakover: 12 → 9 → 6 →
// 3. Det er den bevegelsen som gjør at skiven tømmer seg mot klokken.

import React from 'react';
import { View } from 'react-native';
import { C } from './theme';

export default function CountdownDial({
  size = 220,
  stroke = 16,
  remaining,
  total,
  fill = C.navy,
  track = '#dbe4ef',
  hole = '#fff',
  children,
}) {
  const andel = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const grader = andel * 360;

  // Med klokken fra 12 fylles høyre halvdel først (12 → 3 → 6), venstre etterpå
  // (6 → 9 → 12). Negativ rotasjon skyver halvskiven ut i nabohalvdelen, der
  // masken klipper den bort.
  const høyre = Math.min(0, grader - 180);
  const venstre = Math.max(-180, grader - 360);

  const halv = size / 2;
  const innerside = size - stroke * 2;

  return (
    <View style={{ width: size, height: size, borderRadius: halv, backgroundColor: track }}>
      <View style={{ position: 'absolute', left: 0, top: 0, width: halv, height: size, overflow: 'hidden' }}>
        <View
          style={{
            width: halv, height: size, backgroundColor: fill,
            borderTopLeftRadius: halv, borderBottomLeftRadius: halv,
            transformOrigin: 'right center',
            transform: [{ rotate: `${venstre}deg` }],
          }}
        />
      </View>
      <View style={{ position: 'absolute', right: 0, top: 0, width: halv, height: size, overflow: 'hidden' }}>
        <View
          style={{
            width: halv, height: size, backgroundColor: fill,
            borderTopRightRadius: halv, borderBottomRightRadius: halv,
            transformOrigin: 'left center',
            transform: [{ rotate: `${høyre}deg` }],
          }}
        />
      </View>
      <View
        style={{
          position: 'absolute', left: stroke, top: stroke,
          width: innerside, height: innerside, borderRadius: innerside / 2,
          backgroundColor: hole, alignItems: 'center', justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}
