# 0017. Inloggningen: Access-JWT till Firebase custom token

- **Status:** Beslutat
- **Datum:** 2026-11-25

## Sammanhang

Beslut 0006 säger att Cloudflare Access står framför `/inloggning` och att en Pages Function där
byter Accessens JWT mot en Firebase custom token. Det var inte provat att signera en custom token
med WebCrypto, och flera detaljer var öppna: hur klienten når funktionen när Access först skickar
webbläsaren till Google, var uid kommer ifrån, vilka roller tjänstekontot behöver och var
funktionen ligger i repot (issue 11).

## Beslut

- **Inloggningen är en sidnavigering.** Appen går till `/inloggning`; Access loggar in vid behov
  och funktionen svarar `302` till `/#token=<custom token>` på samma ursprung. En `fetch` går inte,
  eftersom Accessens omdirigering till `kodhast.cloudflareaccess.com` har ett annat ursprung.
  Fragmentet når aldrig någon server; appen läser det, tar bort det med `history.replaceState` och
  loggar in med `signInWithCustomToken`. Det finns ingen `tillbaka`-parameter och därmed ingen
  öppen omdirigering.
- **Bara den signerade JWT:n litas på.** Funktionen kontrollerar `Cf-Access-Jwt-Assertion` mot
  teamets nycklar (RS256, `kid`, `aud`, `iss`, `exp` och `nbf` med 60 s klockskillnad) och
  använder aldrig de osignerade huvudena. Kontrollen är portad från Husjakt.
- **uid kommer ur hemligheten `ANVANDARE`** (JSON, e-postadress till uid), inte ur Accessens
  `sub`. Byts Google-kontot byts adressen i hemligheten, och uid och datan står kvar. En adress
  som saknas där får 403.
- **Signeringen sker lokalt** med WebCrypto (`pkcs8`, `RSASSA-PKCS1-v1_5`) och nyckeln ur
  hemligheten `FIREBASE_SIGNER` (Googles JSON-nyckelfil). Inga claims utöver uid; reglerna kräver
  bara `sign_in_provider == 'custom'`.
- **Tjänstekontot har inga roller.** Provat 2026-11-25 mot testprojektet med
  `scripts/prova-custom-token.mjs`: Firebase Auth godtog token från kontot
  `tidrapporten-inloggning` utan roller. Ett eget konto per Firebase-projekt.
- **Pages får `functions/`.** Cloudflare Pages läser sina funktioner ur `functions/` i roten, så
  Firebase Cloud Functions flyttades till `firebase-functions/` (beslut 0014). Delad kod ligger i
  `functions/_lib/`, som inte blir rutter.
- **Service workern** svarar aldrig på `/inloggning` eller `/cdn-cgi/` ur cachen.
- **Loggarna** har händelse och uid, aldrig e-postadress, JWT eller token (beslut 0008).

## Följder

- Firebase Auth behåller sessionen i IndexedDB, så Access behövs bara vid en ny inloggning.
- Hemligheterna `ACCESS_AUD`, `ANVANDARE` och `FIREBASE_SIGNER` sätts i Pages-projektet, och
  provet bakom riktig Access görs när Pages-projektet finns (issue 12).
- En läckt signeringsnyckel ger inloggning som vem som helst; den finns bara som hemlighet, och
  testnyckeln dessutom i Claude-miljön (`FIREBASE_SIGNER_TEST`), aldrig drift-nyckeln.
- Provet `node scripts/prova-custom-token.mjs` skapar användaren `prov-inloggning` i
  testprojektets Authentication. Skriptet vägrar drift-projektet.
