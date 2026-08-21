# Kongshaug Elevapp

Brannliste og andaktsregistrering for **Kongshaug Musikkgymnas**.

To deler som deler samme backend:

- **Elevapp** (`/app/`) – mobil-app (PWA) hvor elever melder seg til stede på
  brannlisten om kvelden og registrerer oppmøte på andakt ved å skanne en
  QR-kode. Både brannliste og andakt krever at eleven er fysisk på skolen (GPS).
- **Elevapp (native)** (`mobile/`) – samme elevapp som en ekte Expo/React
  Native-app, kjørt i **Expo Go** på telefonen. Bedre kamera/GPS enn PWA-en, og
  trenger ikke HTTPS for å teste. Se `mobile/README.md`.
- **Administrasjon** (`/admin/`) – nettside for ansatte: opprette/administrere
  brukere, se kveldens brannliste, vise dagens QR-kode på storskjerm og følge
  oppmøtet i sanntid.

## Kom i gang

```bash
cd server
cp .env.example .env      # allerede gjort – .env inneholder ekte hemmeligheter
npm install
npm run seed              # oppretter admin + testelever
npm start
```

Åpne så:

- Elevapp:  <http://localhost:3000/app/>
- Admin:    <http://localhost:3000/admin/>

### Testkontoer (fra `npm run seed`)

| Rolle | Brukernavn        | Passord     |
| ----- | ----------------- | ----------- |
| Admin | `admin`           | `admin1234` |
| Elev  | `ingrid.saether`  | `elev1234`  |

> ⚠ Bytt disse passordene før reell bruk (admin kan endre passord under **Brukere**).

## Sikkerhet og hemmeligheter

- **Passord lagres aldri i klartekst.** De hashes med **bcrypt** (12 runder) i
  `server/src/auth.js`. Databasen inneholder bare hasher.
- **Innlogging** skjer med en signert JWT lagret i en `httpOnly`-cookie, slik at
  JavaScript i nettleseren ikke kan lese den. Sesjonen varer 12 timer.
- **Hemmeligheter ligger i `server/.env`** (se `server/.env.example` for mal).
  Filen er i `.gitignore` og skal aldri deles eller committes. Her ligger:
  - `JWT_SECRET` – signeringsnøkkelen for innlogging.
  - `SCHOOL_LAT` / `SCHOOL_LNG` / `SCHOOL_RADIUS_METERS` – skolens posisjon.
  - **`BREVO_API_KEY` / `MAIL_FROM` / `MAIL_FROM_NAME`** – for automatisk
    utsending av brannlisten på e-post (se under).

### Brannliste på e-post (Brevo)

Brannlisten kan sendes automatisk til en ansvarlig lærer hver dag, som en ren,
lettlest e-post med **hele listen vedlagt som PDF**.

Oppsett:

1. Lag en konto på [brevo.com](https://www.brevo.com) (gratis nivå holder for
   noen e-poster per dag).
2. Under **SMTP & API → API Keys**: lag en API-nøkkel og lim den inn i
   `server/.env` som `BREVO_API_KEY=...`.
3. Under **Senders**: verifiser avsender-adressen og sett samme adresse som
   `MAIL_FROM` i `.env`.
4. Start serveren på nytt.
5. I admin → **Innstillinger → E-post: brannliste**: skru på automatisk
   utsending, fyll inn mottakerens e-post og velg sendetidspunkt. Bruk
   **«Send test nå»** for å bekrefte at det virker.

Standard sendetidspunkt er **14:15**, som sender den siste ferdige natten
(gårsdagens liste). Vil du ha den midt på natten, sett f.eks. 02:15.

### Lagringstid og automatisk sletting

Systemet rydder etter seg selv, styrt fra admin → **Innstillinger → Personvern:
lagringstid** (`server/src/retention.js`):

- **GPS-koordinatene nulles etter et døgn.** De brukes bare til å avgjøre om
  eleven er på skolens område i selve registreringsøyeblikket, og leses aldri
  igjen. Statusen (til stede / borte / for sent) blir stående – det er den
  brannsikkerheten trenger, ikke stedet.
- **Datert historikk slettes etter ett skoleår** (365 dager som standard):
  brannliste, andakt, planlagt fravær, gjester, middagsvalg, kjøkkentjeneste og
  internatvask.

Nullingen kjøres hver 15. minutt, slettingen én gang i døgnet. Knappen
**«Kjør sletting nå»** i Innstillinger kjører begge umiddelbart. Sletting er
endelig – dataen kan ikke hentes tilbake. Husk å holde
`public/personvern/index.html` i takt hvis periodene endres.

### Ukestjenester: kjøkkentjeneste og internatvask

Begge går på rundgang, én uke av gangen, og er bygget på samme kode i alle lag –
`server/src/duty.js`, ruteren i `server/src/routes/duty.js`, `mountDutyModule` i
admin og `DutyPlan` i mobilappen. Bare tekstene, ikonet og tabellen skiller dem,
så en endring i den ene gjelder automatisk for den andre.

- **Admin**: «Kjøkken» og «Internat» har hver sin side med ukeblaing, søk etter
  elev og Excel-import (OpenAI leser arket, du bekrefter før det lagres).
- **Elevappen**: et tydelig kort på hjemskjermen i tjenesteuken, og et diskret
  varsel uken før. Hele rundgangen ligger under «Middag» og «Internat».
- **Push**: slås på under admin → **Varsler → Varsel om ukestjeneste**. Sendes
  søndag kl. 18:00 til elevene som har tjeneste uken som starter dagen etter.
  Har eleven begge deler samme uke, kommer det ett varsel om hver.

API-et ligger på `/api/dorm-duty` for internatvask. Kjøkkentjenesten beholder
`/api/dinner/kitchen-duty`: den stien ligger i utrullede app-versjoner, og en
flytting ville brutt dem.

### Juksesikring (GPS)

Både brannliste- og andaktsregistrering sender elevens GPS-posisjon. Serveren
regner ut avstanden til skolen (`server/src/geo.js`) og avviser registreringer
utenfor `SCHOOL_RADIUS_METERS`. **Verifiser skolens koordinater** i `.env` mot
kart før dere tar systemet i bruk – standardverdiene er et anslag.

### QR-koden

QR-koden for andakt **roterer automatisk** (styrt av `ANDAKT_QR_TTL_SECONDS`).
Den inneholder en HMAC-signert kode knyttet til dagens hemmelighet og et
tidsvindu, så et avfotografert skjermbilde slutter å virke etter noen sekunder.
Admin kan også trykke «Ugyldiggjør koder nå» for å nullstille umiddelbart.
Oppmøte etter `ANDAKT_DEADLINE` markeres som «for sent».

## Prosjektstruktur

```
Kongshaug/
├─ server/                 # Node.js + Express + SQLite backend
│  ├─ .env / .env.example  # hemmeligheter (ekte / mal)
│  ├─ src/
│  │  ├─ index.js          # oppstart, ruter, statiske filer
│  │  ├─ config.js         # leser .env
│  │  ├─ db.js             # SQLite-skjema
│  │  ├─ auth.js           # bcrypt + JWT-cookie
│  │  ├─ geo.js            # GPS-avstand
│  │  ├─ andaktToken.js    # roterende QR-token
│  │  ├─ duty.js           # kjøkkentjeneste + internatvask (delt)
│  │  ├─ retention.js      # sletting/nulling av gamle data
│  │  ├─ seed.js           # testdata
│  │  └─ routes/           # auth, users, firelist, andakt, history
│  └─ data/                # SQLite-fil (opprettes automatisk)
└─ public/                 # frontend (serveres av backend)
   ├─ shared/              # felles css + fetch/hjelpere
   ├─ app/                 # elevapp (PWA)
   └─ admin/               # administrasjon
```

## Videre arbeid (forslag)

- E-postpåminnelser til elever som mangler på brannlisten (nøklene er klare).
- Eksport av fraværsrapport til skoleadministrasjonen.
- Kobling mot Itslearning/Feide for felles innlogging.
- HTTPS + `NODE_ENV=production` ved utrulling (aktiverer `Secure`-cookies).
```
