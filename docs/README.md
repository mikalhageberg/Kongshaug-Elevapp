# Håndbøker

To bruksanvisninger for systemet, som vises under **Håndbøker** i admin
(`/api/handbooks`, krever innlogget administrator – de ligger med vilje ikke i
`public/`, som er åpent for alle).

| Kilde | Ferdig PDF | For hvem |
| ----- | ---------- | -------- |
| `elevmanual.html` | `Kongshaug-Elevapp-brukermanual.pdf` | Elevene. Deles ut ved skolestart. |
| `adminmanual.html` | `Kongshaug-Elevapp-adminhandbok.pdf` | Ansatte med adminkonto. |

**HTML-filene er kilden.** Rediger dem, og bygg PDF-en på nytt – ikke rediger
PDF-en direkte, den blir overskrevet.

## Bygge PDF-ene på nytt

PDF-ene lages med Chrome i headless-modus, som holder CSS-en (sidebrytninger,
farger, `@page`-marger) lik det du ser i nettleseren:

```bash
cd docs && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-pdf-header-footer --virtual-time-budget=3000 --print-to-pdf="Kongshaug-Elevapp-brukermanual.pdf" "file://$PWD/elevmanual.html"
```

```bash
cd docs && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-pdf-header-footer --virtual-time-budget=3000 --print-to-pdf="Kongshaug-Elevapp-adminhandbok.pdf" "file://$PWD/adminmanual.html"
```

Filnavnene er ikke valgfrie: de står i `HANDBOOKS` i
`server/src/routes/handbooks.js`, sammen med tittelen og beskrivelsen som vises
i admin. Endrer du et filnavn, må listen endres i samme slengen.

## Når innholdet må oppdateres

Håndbøkene beskriver skjermbildene slik de er, med knappetekster og
standardverdier. Endrer du noe av dette, går teksten ut av takt:

- **Nye eller endrede sider i admin** – kapittelnummereringen i adminhåndboken
  følger sidemenyen.
- **Nye faner eller skjermer i elevappen** – samme for elevmanualen.
- **Standardverdier** (frist for andakt, innsjekksvinduet, lagringstid,
  arkivuker) står i begge håndbøkene som «standard». De hentes ikke fra
  serveren, så de må rettes for hånd hvis `DEFAULTS` i `server/src/settings.js`
  endres.
- **Listene over klasser, internat og instrumenter** står i adminhåndbokens
  kapittel 3.6, og må holdes i takt med `CLASSES`, `DORMS` og `INSTRUMENTS` i
  `public/admin/admin.js`.
