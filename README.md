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
- **Nedlastingsside** (`/distribusjon`) – enkel mobilside med app-ikonet og
  knapper til App Store og Google Play. Lenken (eller en QR-kode av den) er det
  elevene får når de skal installere appen.

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

### Andaktsarkiv

Ukesrapportene over andaktsfraværet samles i **Andaktsarkiv** i admin
(`server/src/andaktArchive.js`). Så snart en uke er over, fryses rapporten – hvem
som var borte, og hvem som kom for sent – som en JSON-kopi i
`andakt_week_reports`. Kopi, ikke oppslag: fraværet regnes ut fra elevene som er
aktive *nå*, så en rapport som ble regnet på nytt senere ville vist andre navn og
andre tall enn uken faktisk hadde.

Skolen velger på arkivsiden hvor mange uker som skal bli liggende (standard 12).
Eldre uker fjernes for godt. Uker uten en eneste registrering – ferier, og tiden
før appen ble tatt i bruk – hoppes over: en «rapport» der alle står som
fraværende sier ingenting. Uken som løper nå ligger ikke i arkivet ennå, og
lastes ned fra Andakt-siden.

En uke kan fjernes manuelt med **«Slett fra arkivet»** – nyttig for testuker fra
før appen ble tatt i bruk. Knappen sletter registreringene uken bygger på i samme
transaksjon, og det er ikke valgfritt: uten dem ville påfyllet lagt uken rett inn
igjen ved neste gjennomløp.

To ting å vite hvis arkivet endres: den generelle lagringstiden over gjelder
fortsatt som ytre grense, og siden rapportene er JSON nås de ikke av
`ON DELETE CASCADE` – sletting av en konto rydder dem gjennom
`removeUsersFromArchive()` i `routes/users.js`.

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

Nederst på admin-siden ligger **Nullstill konkurransen**: sletter alle
øveøkter og alle dokumentasjonsbilder, for alle elever. Perioden og
innstillingene beholdes – det er resultatene som nullstilles. Bekreftelsen
krever at ordet skrives inn, og viser hvor mange økter og bilder som forsvinner
før noe skjer. Handlingen logges på serveren med hvem som utførte den.

Dokumentasjonsbildet får et dato- og klokkeslettstempel i stil med gamle
digitalkameraer. Stempelet **tegnes ved visning**, fra serverens tidsstempel –
det brennes ikke inn av telefonen. Da kan det ikke forfalskes av en app, og det
ser likt ut i elevappen og i admin. Appen ber eleven om å ta bilde av
instrumentet eller notestativet, ikke av seg selv.

Hovedinstrument settes på eleven i admin (`INSTRUMENTS` i `admin.js` er fasit)
og leses også ut av en opplastet elevliste.

### Importere elever fra Excel

Under **Brukere → Legg til flere elever** kan hele elevlista lastes opp. Arket
kan leses på to måter, og du velger selv:

- **Arket følger malen** (standard) – tolkes lokalt på skolens server.
  Ingenting sendes til OpenAI. Krever at arket er satt opp slik:

  | Navn | Klasse | Internat | Rom | Hovedinstrument |
  | ---- | ------ | -------- | --- | --------------- |
  | Ingrid Sæther | VG1A | Treet 1 | 12 | Fiolin |
  | Ola Nordmann | VG2B | Svingen nede | 3B | Trommer/slagverk |

  - **Rad 1 er overskriftsraden** og skal inneholde postene, skrevet nøyaktig
    som over. Én elev per rad nedover fra rad 2, uten tittelrader eller tomme
    rader over overskriftene.
  - `Navn` må være med (hele navnet i én celle). Rekkefølgen på kolonnene
    spiller ingen rolle, og kolonner skolen ikke bruker kan sløyfes helt – men
    en kolonne som er med må hete akkurat som i tabellen.
  - `Klasse`, `Internat` og `Hovedinstrument` må være verdier fra `CLASSES`,
    `DORMS` og `INSTRUMENTS` i `admin.js`. `Rom` er fri tekst, og enkeltceller
    kan stå tomme (fylles inn i forhåndsvisningen). Bare første fane leses.
  - Er det en skrivefeil, avvises arket med **radnummer og hvilken celle** som
    er feil, i stedet for at importen gjetter. Knappen **Last ned mal** gir en
    tom .xlsx med overskriftene ferdig utfylt.

- **Tolk arket med OpenAI** – for ark som ikke følger malen. Bare de første
  radene sendes til OpenAI, som svarer med hvilken kolonne som er hva; resten
  av arket tolkes lokalt. Krever `OPENAI_API_KEY`.

Begge veier ender i en forhåndsvisning som admin kan rette før elevene faktisk
opprettes. Elever som allerede finnes hoppes over. Serveren styres av
`?mode=mal|ai` på `POST /api/users/parse-xlsx`; koden ligger i
`server/src/studentParser.js`.

### Ukestjenester: kjøkkentjeneste og internatvask

Begge går på rundgang, én uke av gangen, og er bygget på samme kode i alle lag –
`server/src/duty.js`, ruteren i `server/src/routes/duty.js`, `mountDutyModule` i
admin og `DutyPlan` i mobilappen. Bare tekstene, ikonet og tabellen skiller dem,
så en endring i den ene gjelder automatisk for den andre.

- **Admin**: «Kjøkken» og «Internat» har hver sin side med ukeblaing, søk etter
  elev og Excel-import (se under; du bekrefter før det lagres).
- **Elevappen**: et tydelig kort på hjemskjermen i tjenesteuken, og et diskret
  varsel uken før. Hele rundgangen ligger under «Middag» og «Internat».
- **Push**: slås på under admin → **Varsler → Varsel om ukestjeneste**. Sendes
  søndag kl. 18:00 til elevene som har tjeneste uken som starter dagen etter.
  Har eleven begge deler samme uke, kommer det ett varsel om hver.

API-et ligger på `/api/dorm-duty` for internatvask. Kjøkkentjenesten beholder
`/api/dinner/kitchen-duty`: den stien ligger i utrullede app-versjoner, og en
flytting ville brutt dem.

#### Oppgaver i internatvasken

Internatvasken er ikke bare «hvem har vask denne uken», men **hvilke oppgaver**
som skal gjøres – 80-gongen, trappegangen, kjøkkenet – og hvem som tok hver av
dem. Oppgavene ligger i `dorm_tasks` (se `server/src/dormTasks.js`).

- **Admin oppretter oppgavene** per internat, under **Internat → Oppgaver**, med
  hele beskrivelsen slik den står på vaskelista. Eleven leser den i appen.
- Hver oppgave får en **kode**: `ØVEST1` = Øvre Vestheim, oppgave 1. Koden lages
  av internatnavnet (første bokstav + fire av siste ord), teller oppover, og er
  unik på tvers av internatene. Admin kan overstyre den. Internat med tall i
  navnet får bindestrek, så `TREET1-2` ikke leses som «uke 12».
- Koden er det man skriver i **«Oppgave»-kolonnen** i Excel-turnusen (se under).
- Oppgaver som har vært satt opp kan ikke slettes, bare **deaktiveres** – ellers
  ville historikken mistet hva som faktisk ble gjort.

**Signering.** Eleven kvitterer for at jobben er gjort. Det lagres på raden i
`dorm_duties` (`done_at`, `done_method`, `done_by_user_id`), og skjer på tre måter:

| Metode | Hvor | Hva den er verdt |
| ------ | ---- | ---------------- |
| `biometri` | Mobilappen | Face ID / fingeravtrykk via telefonens egen låsing. **En kvittering, ikke et bevis** – låsingen skjer på elevens enhet, og serveren kan ikke etterprøve den. Poenget er forpliktelsen i å skrive under selv. |
| `passord` | Nettleseren (PWA) | Face ID finnes ikke i nettleseren, så der signeres det med elevens eget passord. Dette kontrolleres mot passord-hashen på serveren, og er altså faktisk verifisert. |
| `admin` | Admin | En administrator signerte på vegne av eleven (elev uten telefon, glemt signering). Hvem det var, lagres og vises i oversikten. |

Ingen kan signere en uke som ikke har begynt, eleven kan bare signere sine egne
oppgaver, og en signatur kan bare angres av admin.

**Oversikten.** Under **Internat** ligger en matrise med oppgavene nedover og
ukene bortover – samme oppslag som henger på veggen, men med signaturene fylt
inn: grønn hake for signert, gul ring for uker som har vært uten signatur, prikk
for det som ligger fram i tid. Klikk en ukekolonne for å redigere den uken.

#### Importere turnus fra Excel

Samme valg som for elevlista, men de to tjenestene har hver sin form:
**internatvasken** bruker en matrise som ligner vaskelista på veggen, og
**kjøkkentjenesten** én rad per elev.

- **Arket følger malen** (standard) – tolkes lokalt, ingen OpenAI.

  **Internatvask** – oppgavene nedover, ukene bortover:

  | Oppgave | Uke 45 | Uke 46 | Uke 47 |
  | ------- | ------ | ------ | ------ |
  | Startdato | 03.11.2025 | 10.11.2025 | 17.11.2025 |
  | ØVEST1 | Olivia | Chandra | Signe |
  | ØVEST2 | Mari |  | Inga |

  **«Last ned mal» gir rammen**: overskriftsraden med 20 ukekolonner, og
  `Startdato`-raden med mandagsdatoene. Selve oppgavekodene og navnene skriver
  man inn selv – malen er tom, og inneholder ingen data fra basen.

  - Første celle må hete `Oppgave`, og første kolonne inneholder
    **oppgavekoden**, én per rad. Vil man ha oppgavenavnet synlig i arket, kan
    man legge inn en kolonne kalt `Beskrivelse`; den leses ikke.
  - Ukekolonnene godtar `Uke 45`, `Veke 45` og `45`. `Startdato`-raden er
    valgfri, og pinner ukene til konkrete mandager.
  - I cellene står **navnet**. Fornavn holder så lenge bare én elev heter det;
    ellers blir raden stående som «ikke funnet» i forhåndsvisningen. Romnummer
    foran navnet (`Rom 81 Olivia`) strippes, og `Signer`-rader fra de gamle
    listene hoppes over – signaturen ligger i appen nå.
  - Flere elever på samme oppgave samme uke skilles med komma eller linjeskift.

  **Kjøkkentjeneste** – én rad per elev:

  | Uke | Navn | Startdato |
  | --- | ---- | --------- |
  | 34 | Ingrid Sæther | 17.08.2026 |
  |  | Ola Nordmann |  |
  | 35 | Kari Ås |  |

  Internatvask leses fortsatt på denne formen også, med en `Oppgave`-kolonne
  for koden – arket sier selv hvilket oppsett det er (mangler `Navn` i
  overskriftsraden, og har ukenumre bortover, er det en matrise).

  - **Rad 1 er overskriftsraden** med postene skrevet nøyaktig som over, og én
    elev per rad nedover fra rad 2. Har flere elever tjeneste samme uke, får de
    hver sin rad – da kan `Uke` stå tom, og uken over gjelder videre (en helt
    tom rad avslutter blokken).
  - `Uke` er ISO-ukenummer 1–53, som `34` eller `Uke 34`. `Navn` er hele navnet
    i én celle.
  - `Startdato` er valgfri og kan sløyfes helt. Er den med, skal det være
    **mandagen** i uken (`17.08.2026`, `2026-08-17`, eller en datoformatert
    celle) – nyttig over et årsskifte. Uten dato velges nærmeste kommende uke
    med det nummeret, som i OpenAI-veien.
  - `Oppgave` (bare internatvask, radformen) er oppgavekoden. Hver rad har sin
    egen kode – den arves *ikke* nedover slik `Uke` gjør, for en tom celle betyr
    «vaskeuke uten bestemt oppgave». Koden må høre til elevens eget internat; en
    kode fra et annet internat er nesten alltid en skrivefeil og avvises.
  - Skrivefeil i uke, oppgavekode eller dato avvises med radnummer, og en dato
    som havner i en annen uke enn ukenummeret sier ifra. **Navn** som ikke
    finnes blant elevene stopper *ikke* importen – de vises som «ikke funnet» i
    forhåndsvisningen, slik admin kan rette opp der.

- **Tolk arket med OpenAI** – for ark som ikke følger malen. Da sendes
  innholdet i arket (navnene som står oppført); skolens elevliste sendes ikke.
  **OpenAI-veien leser ikke oppgavekoder** – de radene blir vaskeuker uten
  oppgave, som før. Skal turnusen ha oppgaver, må arket følge malen.

Styres av `?mode=mal|ai` på `POST {base}/parse`; koden ligger i
`server/src/dutyParser.js`. Oppgavene har egne endepunkter på `/api/dorm-tasks`,
og signeringen ligger på `POST {base}/duties/:id/sign` (admin angrer med
`DELETE` på samme sti). Malen deler kode med elevlista
(`server/src/sheetTemplate.js`), så feilmeldingene er de samme begge steder.

### Superbrukere og vanlige administratorer

Administratorer er delt i to. **Superbrukere** kan i tillegg endre
innstillingene og opprette, redigere og slette brukere. **Vanlige
administratorer** driver de daglige sidene – brannliste, andakt, gjester,
kjøkken, internat, øvekonkurransen og varsler – og kan rette opplysninger på
elever som allerede finnes, men ikke opprette eller slette dem.

Skillet håndheves på serveren (`server/src/permissions.js`), ikke bare ved å
skjule knapper. Flagget slås opp i databasen ved hvert kall, ikke i tokenet: en
sesjon varer opptil 90 dager i mobilappen, og tas rettigheten fra noen skal det
gjelde med én gang.

At en vanlig administrator ikke kan **endre** en administratorkonto er en del av
det samme: å sette et nytt passord på en superbruker ville vært å overta kontoen
hennes.

Innstillinger som hører til andre sider – push-bryterne på Varsler,
øvekonkurransens periode og andakts-arkivet – kan vanlige administratorer
fortsatt endre. Lista over hvilke ligger i `ADMIN_EDITABLE_SETTINGS`
(`settings.js`) og er en **ja-liste**: en ny innstilling er beskyttet fra første
stund, uten at noen må huske det.

**Komme i gang:** sett `SUPERADMIN_USERNAMES` i miljøet til brukernavnene på de
første superbrukerne, start serveren, og fjern variabelen igjen. Deretter styres
flagget fra admin → Administratorer.

Så lenge ingen er utpekt, regnes **alle** administratorer som superbrukere.
Alternativet – å låse alt til ingen har tilgang – ville stengt skolen ute av
sine egne innstillinger uten vei inn igjen. Serveren varsler om tilstanden ved
oppstart, og admin viser en påminnelse. Den siste superbrukeren kan verken
fratas flagget, deaktiveres eller slettes.

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

Koden vises bare i et **tidsvindu rundt fristen** (`andaktWindow.js`), og skolen
setter begge sidene under Innstillinger – standard 30 minutter hver vei. De to
styrer hver sin ting: åpningen avgjør når koden dukker opp på storskjermen,
lukkingen hvor lenge en som kommer for sent fortsatt rekker å registrere seg.
Settes lukkingen til 0, stenger registreringen på slaget, og alt etter fristen
blir fravær.

### Nedlastingsside (`/distribusjon`)

Siden elevene sendes til for å laste ned appen: app-ikonet, en kort beskrivelse
og knapper til butikkene. Butikken telefonen faktisk kan bruke legges øverst.

Lenkene settes som miljøvariabler (i Railway, eller i `server/.env` lokalt):

| Variabel | Eksempel |
| --- | --- |
| `APP_STORE_URL` | `https://apps.apple.com/no/app/kongshaug-elevapp/id1234567890` |
| `PLAY_STORE_URL` | `https://play.google.com/store/apps/details?id=no.kongshaug.elevapp` |

En tom variabel skjuler den knappen, så siden kan tas i bruk før begge
butikkene har godkjent appen. Er begge tomme, vises bare en melding om at appen
ikke er lagt ut ennå, med lenke til nettleserversjonen. Bare `http(s)`-adresser
godtas – andre ignoreres med en advarsel i loggen.

Selve siden ligger i `server/src/views/distribusjon.html` og fylles ut av
`server/src/routes/distribution.js` (den ligger utenfor `public/` så malen med
plassholdere aldri kan serveres rå).

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
│  │  ├─ andaktReport.js   # fravær/for sent per dag og uke
│  │  ├─ andaktArchive.js  # arkivet over ferdige ukesrapporter
│  │  ├─ duty.js           # kjøkkentjeneste + internatvask (delt)
│  │  ├─ permissions.js    # superbrukere vs. vanlige administratorer
│  │  ├─ practice.js       # øvekonkurransen
│  │  ├─ retention.js      # sletting/nulling av gamle data
│  │  ├─ seed.js           # testdata
│  │  ├─ views/            # server-fylte sider (nedlastingssiden)
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
