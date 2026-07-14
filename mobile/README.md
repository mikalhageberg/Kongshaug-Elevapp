# Kongshaug Elevapp – Expo (native app)

Native versjon av elevappen som kjøres i **Expo Go** på telefonen. Den bruker
det samme backend-API-et som web-appen (`../server`), men logger inn med
**Bearer-token** (lagret sikkert i telefonen) i stedet for cookie.

## Forutsetninger

- Backend kjører: fra `../server` → `npm start` (lytter på port 3000).
- Telefonen og PC-en er på **samme Wi-Fi**.
- Appen **Expo Go** er installert på telefonen (App Store / Google Play).

## Kom i gang

```bash
cd mobile
npm install
npx expo start
```

Skann QR-koden som dukker opp i terminalen med:
- **iPhone:** Kamera-appen → åpne i Expo Go.
- **Android:** Expo Go-appen → «Scan QR code».

Appen finner automatisk PC-ens IP-adresse (fra Metro/Expo), så du trenger
normalt ikke skrive inn serveradressen manuelt.

### Hvis appen ikke når serveren

Sett adressen eksplisitt i `app.json` under `expo.extra.apiUrl`, f.eks.:

```json
"extra": { "apiUrl": "http://192.168.1.42:3000" }
```

(Finn PC-ens IP: macOS → Systemvalg → Wi-Fi → Detaljer.) Start Expo på nytt
etter endringen.

## Testbrukere

Samme som backend-seed (`cd ../server && npm run seed`):

| Brukernavn        | Passord    |
| ----------------- | ---------- |
| `ingrid.saether`  | `elev1234` |

> Denne appen er **kun for elever**. Administratorer bruker nettsiden
> (`/admin/`). Logger en admin inn her, blir de avvist.

## Funksjoner

- Innlogging (token lagres i `expo-secure-store`).
- Påtvunget passordbytte ved første innlogging.
- Dashboard med status for brannliste og andakt (dra ned for å oppdatere).
- Brannliste: melder deg til stede med **GPS-sjekk** mot skolens område.
- Andakt: skanner **QR-kode** med kamera + GPS-sjekk, med alle tilstander
  (registrert / for sent / feil kode / utenfor område).
- Historikk.

## Bygge en frittstående app (senere)

Expo Go er fint for testing. For en installerbar app i App Store / Google Play
brukes EAS Build:

```bash
npm install -g eas-cli
eas build --platform ios      # eller android
```

Da må `extra.apiUrl` peke på en offentlig HTTPS-adresse der backend kjører.
