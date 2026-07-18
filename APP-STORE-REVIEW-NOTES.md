# App Store / Play Store – notater til reviewer

Kopier innholdet i «Til App Review» inn i **App Store Connect → App Review
Information → Notes** (og tilsvarende «App content» / reviewer-notat-felt i
Google Play Console). Resten av dette dokumentet er bakgrunn for deg, ikke for
Apple/Google.

## Oppsett før du sender inn (gjør dette først)

1. **Lag én dedikert testkonto** i admin (Elever → Legg til elev). Bruk et
   brukernavn som aldri kan kollidere med en ekte elev, f.eks. `apple.reviewer`.
   Gi den et passord du skriver inn i notatet under.
2. **Sett miljøvariabelen `APPLE_REVIEW_USERNAME`** i Railway til nøyaktig det
   brukernavnet. Dette gjør at *kun* denne kontoen slipper GPS-sjekken
   (brannliste/andakt) og QR-kode-kravet (andakt) – reviewere kan fysisk ikke
   være på Kongshaug eller skanne skjermen der. Se `server/.env.example` og
   `server/src/config.js` for detaljer.
3. **Fjern `APPLE_REVIEW_USERNAME` igjen** så snart appen er godkjent. Det er
   et reelt, om enn smalt avgrenset, unntak fra brannsikkerhets-verifiseringen,
   og skal ikke stå på lenger enn nødvendig.

## Til App Review (kopier dette)

```
Dette er en lukket app for én skole (Kongshaug Musikkgymnas, Norge). Det finnes
ingen selvregistrering – elever får kontoer utdelt av skolens administrasjon.

Testkonto (elev):
  Brukernavn: apple.reviewer
  Passord:    <sett inn passordet du valgte over>

Om GPS-kravet:
Appen har to funksjoner (brannliste og andakt) som krever at brukeren er
fysisk på skolens område for å registrere oppmøte – dette er reell
brannsikkerhets-funksjonalitet (internatskole må vite hvem som er til stede om
natten), ikke sporing. Posisjon brukes kun i det øyeblikket man trykker
"registrer", aldri kontinuerlig.

Testkontoen over er unntatt dette kravet (kun denne ene kontoen), slik at dere
kan teste hele flyten uten å være fysisk til stede. En vanlig elevkonto ville
fått "Du er ikke på skolens område" utenfor Kongshaug – det er forventet og
korrekt oppførsel, ikke en feil.

Om QR-koden i "Andakt":
Andakt-registrering skjer normalt ved å skanne en roterende QR-kode vist på en
skjerm på skolen. Testkontoen er unntatt dette kravet av samme grunn som over.

Om Face ID / telefonkode:
Appen låses bak enhetens egen Face ID/fingeravtrykk/kode ved hver åpning
(expo-local-authentication, ingen egen PIN lagres av appen). Har enheten ingen
biometri/kode registrert, slippes man gjennom uten sjekk.

Personvernerklæring: https://elevapp.online/personvern/
```

## Andre ting som kan komme opp i gjennomgangen

- **Privacy Nutrition Label / Data Safety-skjema:** appen samler posisjon
  (kun ved registrering, ikke kontinuerlig), kontoopplysninger og
  oppmøtehistorikk. Ingen helseopplysninger. Se `public/personvern/index.html`
  for full oversikt over hva som faktisk lagres.
- **Smal målgruppe:** dette er et internt verktøy for én skole, distribuert på
  en offentlig store-oppføring. Hvis Apple/Google spør hvorfor, er svaret at
  skolen ikke har en organisasjonskonto for privat distribusjon (Apple
  Business Manager) ennå – det er et alternativ å vurdere senere.
- **Utviklerkonto:** bygget under en personlig/individuell Apple/Google-konto
  inntil videre. «Selger»-navnet i store-oppføringen vil derfor vise
  utvikleren, ikke skolen, til kontoen eventuelt overføres.
