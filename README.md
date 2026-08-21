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
  brannliste, andakt, planlagt fravær, gjester, middagsvalg, kjøkkentjeneste,
  internatvask og øveøkter. Dokumentasjonsbildene fra øvekonkurransen ligger som
  filer i `data/practice/` og slettes sammen med øktene sine.

Nullingen kjøres hver 15. minutt, slettingen én gang i døgnet. Knappen
**«Kjør sletting nå»** i Innstillinger kjører begge umiddelbart. Sletting er
endelig – dataen kan ikke hentes tilbake. Husk å holde
`public/personvern/index.html` i takt hvis periodene endres.

### Øvekonkurranse

Elevene konkurrerer om å øve mest på hovedinstrumentet sitt i en avgrenset
periode. Admin styrer alt fra fanen **Øvekonkurranse**: periode, lengden på
oppvarmingen, og stillingen med øktene til hver elev.

Eleven starter en økt i mobilappen. Den begynner med en obligatorisk oppvarming
som vises som en sirkulær skive – den tømmer seg mot klokken, med nedtellingen
inni. Når skiven er tom tar stoppeklokken over. Oppvarmingen teller med i tiden.
Økten kan pauses og tas opp igjen senere; pausen holdes utenfor øvetiden.

**Tre ting ligger bevisst på serveren, ikke i appen** (`server/src/practice.js`):

- **Lengden på økten.** Appen sender aldri hvor lenge det ble øvd; serveren
  regner den ut fra sine egne tidsstempler. «Stopp» fryser tiden, slik at
  minuttene det tar å ta dokumentasjonsbildet ikke teller som øving.
- **Om økten må dokumenteres.** Terningkastet skjer når økten starter og lagres
  på raden – ellers kunne appen latt være å spørre. Andelen settes i admin
  (standard 50 %). Sett den til 100 % for å teste flyten uten å vente på flaks,
  eller mens elevene læres opp.
- **Pausene.** `paused_at` står så lenge økten er pauset, og `paused_seconds`
  summerer pausene som er avsluttet. Øvetiden er
  `(stopp ?? pause ?? nå) − start − paused_seconds`, så en pause kan verken
  legge til eller trekke fra tid. Stopper eleven mens økten står på pause, er
  det pausetidspunktet som gjelder.
- **Om konkurransen er åpen.** Økter kan verken startes eller registreres
  utenfor perioden.

Lukkes appen midt i en økt, plukkes den samme økten opp igjen der den var.
Økter forkastes når de passerer seks timer faktisk øvetid, eller et døgn i
klokketid – uten den siste grensen kunne en økt satt på pause forrige uke blitt
registrert i dag, på datoen den startet.

Dokumentasjonsbildet får et dato- og klokkeslettstempel i stil med gamle
digitalkameraer. Stempelet **tegnes ved visning**, fra serverens tidsstempel –
det brennes ikke inn av telefonen. Da kan det ikke forfalskes av en app, og det
ser likt ut i elevappen og i admin. Appen ber eleven om å ta bilde av
instrumentet eller notestativet, ikke av seg selv.

Hovedinstrument settes på eleven i admin (`INSTRUMENTS` i `admin.js` er fasit)
og leses også ut av en opplastet elevliste.

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
│  │  ├─ practice.js       # øvekonkurransen
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
