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
4. **Gjør øvekonkurransen synlig i gjennomgangsperioden.** Er det ingen aktiv
   konkurranse, ser reviewer bare «Ingen øvekonkurranse er satt opp», og kan
   ikke prøve funksjonen – det kan bli lest som en skjult funksjon. Under
   admin → **Øvekonkurranse**:
   - sett en periode som dekker dagene appen er til gjennomgang,
   - sett **oppvarming til 1 minutt**, slik at reviewer slipper å vente ti,
   - sett **andel økter som må dokumenteres til 100 %**, slik at bildesteget
     dukker opp med én gang i stedet for annenhver gang.

   Sett verdiene tilbake (10 minutter, 50 %) når appen er godkjent, og bruk
   **Nullstill konkurransen** nederst på siden for å slette reviewerens
   testøkter og bilder.

## Til App Review – engelsk (dette limes inn)

App Review-køen er internasjonal, og notatet er det eneste stedet du får
forklart hvorfor appen krever GPS og hvorfor den ber om bilder. Det må derfor
kunne leses av en reviewer som ikke kan norsk.

Feltet i App Store Connect tar **4000 tegn**, og de to versjonene under er på
rundt 3100 hver – de får ikke plass sammen. Lim inn **den engelske**. Den norske
under er kilden, for skolens egen del.

```
This is a closed app for a single school (Kongshaug Musikkgymnas, Norway).
There is no self-registration - students receive accounts from the school
administration.

Test account (student):
  Username: apple.reviewer
  Password: <the password you set above>

About the GPS requirement:
Two features (fire roll call and morning assembly) require the user to be
physically on school grounds to register attendance. This is genuine fire
safety functionality - a boarding school must know who is present at night -
not tracking. Location is read while the screen is open, to show whether the
user is on school grounds, and once more the moment they tap "register" - that
last reading is the one that is stored. Never in the background, never
continuously.

The test account above is exempt from this requirement (this one account
only), so you can test the full flow without being on site. A normal student
account would see "You are not on school grounds" anywhere else. That is
expected and correct behaviour, not a bug.

About the QR code in "Andakt" (morning assembly):
Attendance is normally registered by scanning a rotating QR code shown on a
screen at the school. The test account is exempt from this for the same
reason.

About "Øvekonkurranse" (practice competition, with documentation photo):
The school is a music programme. It periodically runs a competition where
students practise as much as possible on their main instrument. The student
starts a stopwatch in the app, completes a mandatory warm-up, and registers
the session when finished. The screen stays awake while the timer runs, so the
phone can rest on a music stand without locking.

Roughly half of all sessions (the share is set by the school) must be
documented with a photo before they can be registered. This is a simple check
against someone just letting the clock run.

IMPORTANT ABOUT THIS PHOTO - PRIVACY:
The app explicitly asks the student NOT to photograph themselves or anyone
else. The text shown on the camera screen reads, in Norwegian: "Ta gjerne
bilde av instrumentet, notestativet eller rommet – helst ikke av deg selv
eller andre." ("Please photograph the instrument, the music stand or the room
- preferably not yourself or others.") The same instruction is repeated before
the photo is taken and in the privacy policy. The purpose is to document that
practice took place, not who practised - the student is already identified by
their own login, so a photo of the person would add nothing.

The photo is stored on the school's own server together with the session, is
visible only to the student and the school administration, and is deleted
automatically along with the rest of the practice history. It is never shared
with third parties.

The camera is therefore used for two things in this app: scanning the QR code
for morning assembly, and taking these documentation photos. Both are covered
by the camera usage description.

About "Internat" and "Middag" (weekly duties):
Students take turns with dormitory cleaning and kitchen duty, one week at a
time. These tabs show who has which duty in which week. The school can enable
a push notification reminding students of their duty week on Sunday evening.
No data is collected here - it only displays a schedule entered by the
administration.

About Face ID / device passcode:
The app locks behind the device's own Face ID / fingerprint / passcode on each
launch (expo-local-authentication; the app stores no PIN of its own). If the
device has no biometrics or passcode configured, the user passes through
without a check.

Privacy policy: https://elevapp.online/personvern/
```

## Samme notat på norsk (kilde – limes ikke inn)

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
natten), ikke sporing. Posisjon leses mens skjermen er åpen, for å vise om
eleven er på skolens område, og på nytt i det man trykker "registrer" – det er
den siste avlesningen som lagres. Aldri i bakgrunnen, aldri kontinuerlig.

Testkontoen over er unntatt dette kravet (kun denne ene kontoen), slik at dere
kan teste hele flyten uten å være fysisk til stede. En vanlig elevkonto ville
fått "Du er ikke på skolens område" utenfor Kongshaug – det er forventet og
korrekt oppførsel, ikke en feil.

Om QR-koden i "Andakt":
Andakt-registrering skjer normalt ved å skanne en roterende QR-kode vist på en
skjerm på skolen. Testkontoen er unntatt dette kravet av samme grunn som over.

Om "Øvekonkurranse" (øvetimer med dokumentasjonsbilde):
Skolen er en musikklinje, og arrangerer med jevne mellomrom en konkurranse der
elevene øver mest mulig på hovedinstrumentet sitt. Eleven starter en
stoppeklokke i appen, går gjennom en obligatorisk oppvarming, og registrerer
økten når hun er ferdig. Skjermen holdes våken mens klokken går, slik at
telefonen kan ligge på notestativet uten å låse seg.

Omtrent halvparten av øktene (andelen settes av skolen) må dokumenteres med et
bilde før de kan registreres. Dette er en enkel kontroll mot at noen bare lar
klokken gå.

VIKTIG OM DETTE BILDET – PERSONVERN:
Appen ber uttrykkelig eleven om å IKKE ta bilde av seg selv eller andre
personer. Teksten på kameraskjermen lyder: "Ta gjerne bilde av instrumentet,
notestativet eller rommet – helst ikke av deg selv eller andre." Den samme
oppfordringen gjentas før bildet tas og i personvernerklæringen. Hensikten er
å dokumentere at det ble øvd, ikke hvem som øvde - eleven er allerede
identifisert gjennom sin egen innlogging, så et bilde av personen ville ikke
tilført noe.

Bildet lagres på skolens egen server sammen med økten, er kun synlig for
eleven selv og skolens administrasjon, og slettes automatisk sammen med
resten av øvehistorikken. Det deles aldri med tredjeparter.

Kameraet brukes altså til to ting i appen: skanne QR-koden til andakt, og ta
disse dokumentasjonsbildene. Begge er beskrevet i formålsteksten for
kameratilgang.

Om "Internat" og "Middag" (ukestjenester):
Elevene har internatvask og kjøkkentjeneste på rundgang, én uke av gangen.
Fanene viser hvem som har tjeneste hvilken uke. Skolen kan slå på et
push-varsel som minner elevene på tjenesteuken sin søndag kveld. Ingen
registrering eller innsamling skjer her - det er ren visning av en plan
administrasjonen legger inn.

Om Face ID / telefonkode:
Appen låses bak enhetens egen Face ID/fingeravtrykk/kode ved hver åpning
(expo-local-authentication, ingen egen PIN lagres av appen). Har enheten ingen
biometri/kode registrert, slippes man gjennom uten sjekk.

Personvernerklæring: https://elevapp.online/personvern/
```

## Andre ting som kan komme opp i gjennomgangen

- **Privacy Nutrition Label / Data Safety-skjema:** appen samler posisjon
  (kun ved registrering, ikke kontinuerlig), kontoopplysninger, hovedinstrument,
  oppmøtehistorikk og **dokumentasjonsbilder fra øvekonkurransen**. Ingen
  helseopplysninger. Se `public/personvern/index.html` for full oversikt over
  hva som faktisk lagres.

  Bildene må legges inn i begge skjemaene før neste innsending:
  - **App Store Connect → App Privacy:** `User Content → Photos or Videos`,
    *Linked to You*, formål *App Functionality*, ikke sporing.
  - **Play Console → Data safety:** `Photos and videos → Photos`. Samles inn,
    deles ikke, påkrevd (ikke valgfritt), kryptert i transitt, kan slettes på
    forespørsel.
- **Mindreårige brukere:** elevene er delvis under 18, og appen samler både
  posisjon og bilder fra dem. Begge butikkene har egne regler for apper rettet
  mot barn/ungdom. Dette bør avklares med skolens personvernombud før
  innsending, ikke improviseres i gjennomgangen.
- **Smal målgruppe:** dette er et internt verktøy for én skole, distribuert på
  en offentlig store-oppføring. Hvis Apple/Google spør hvorfor, er svaret at
  skolen ikke har en organisasjonskonto for privat distribusjon (Apple
  Business Manager) ennå – det er et alternativ å vurdere senere.
- **Utviklerkonto:** bygget under en personlig/individuell Apple/Google-konto
  inntil videre. «Selger»-navnet i store-oppføringen vil derfor vise
  utvikleren, ikke skolen, til kontoen eventuelt overføres.
