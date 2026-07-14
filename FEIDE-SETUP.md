# Feide-innlogging – oppsett

Med Feide logger elever og ansatte inn med **samme konto som Itslearning**, og
dere slipper å dele ut passord i det hele tatt. Integrasjonen er ferdig kodet i
appen – den venter bare på at skolen registrerer tjenesten og fyller inn to
verdier i `server/.env`.

> Inntil dette er gjort er «Logg inn med Feide»-knappen skjult, og innlogging med
> brukernavn/passord fungerer som før.

## Slik gjør skolens Feide-ansvarlige det

1. **Logg inn i Feide Kundeportal** – <https://kunde.feide.no> (krever at du er
   registrert som tjenesteansvarlig for Kongshaug).

2. **Registrer en ny tjeneste / OIDC-klient.** Velg «OpenID Connect».

3. **Redirect URI (callback):** legg inn adressen appen kjører på, med stien
   `/api/auth/feide/callback`. Eksempler:
   - Test lokalt:  `http://localhost:3000/api/auth/feide/callback`
   - I drift:      `https://<din-adresse>/api/auth/feide/callback`
   (Feide tillater `localhost` for testklienter, så dere kan teste før utrulling.)

4. **Be om disse brukeropplysningene (scopes/claims):** `openid`, `profile`,
   `email`, `userid`. Det holder for å kjenne igjen brukeren.

5. **Kopiér `Client ID` og `Client secret`** dere får, og lim dem inn i
   `server/.env`:

   ```env
   FEIDE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   FEIDE_CLIENT_SECRET=din-hemmelige-nokkel
   FEIDE_REDIRECT_URI=http://localhost:3000/api/auth/feide/callback
   ```

6. **Start serveren på nytt.** «Logg inn med Feide» dukker nå opp automatisk på
   både elevappen og admin-siden.

## Hvordan brukere kobles

- Ingen kontoer opprettes automatisk av Feide. **Admin oppretter fortsatt
  brukerne** (ingen selvregistrering), akkurat som før.
- Når en person logger inn med Feide, kobles Feide-kontoen til den lokale
  brukeren ved å sammenligne **delen før `@` i Feide-e-posten** med brukernavnet
  i systemet. Eksempel: `ingrid.saether@kongshaug.no` → brukernavn
  `ingrid.saether`.
- Opprett derfor elevene med brukernavn som matcher skole-e-posten deres.
- Vil dere koble på et annet felt (f.eks. Feide-id), endre `FEIDE_MATCH_CLAIM`
  i `.env`. Si fra hvis attributtene fra deres Feide-oppsett ser annerledes ut,
  så justerer vi koblingen.

## Merk

- Denne flyten er implementert etter OpenID Connect-standarden (authorization
  code + PKCE), men er **ikke sluttestet mot et ekte Feide-miljø** ennå, siden
  det krever klient-ID/secret fra skolen. Test gjerne med en testklient først.
- Elever som logger inn med Feide trenger ikke bytte passord (det håndteres av
  Feide), så «bytt passord ved første innlogging» gjelder bare lokale kontoer.
