# Drift och miljöer

Varför det ser ut så här: [beslut 0009](beslut/0009-repo-ci-och-miljoer.md),
[0010](beslut/0010-kostnadstak.md), [0014](beslut/0014-functions-koden.md) och
[0015](beslut/0015-firebase-projekt-och-region.md).

## Firebase-projekten

| Alias   | Projekt-id                  | Visningsnamn       | Används av                                |
| ------- | --------------------------- | ------------------ | ----------------------------------------- |
| `test`  | `dagboken-497114`           | Tidrapporten test  | `main`, förhandsvisningar och lokala bygg |
| `drift` | `device-streaming-5b35f7b8` | Tidrapporten drift | Releaser (`vite build --mode drift`)      |

- Firestore (Standard) i **europe-west1**, startad i produktionsläge: allt nekas tills reglerna i
  `firestore.rules` driftsätts.
- En webbapp per projekt, "Tidrapporten webb". Webbkonfigurationen står i
  `src/firebase/config.ts`; den är ingen hemlighet.
- Planen är **Blaze** i båda projekten, med budgeten 100 kr i månaden (beslut 0010).
- Ange alltid aliaset, aldrig id:t: `npx firebase deploy --only firestore:rules --project test`.
  Id:t `dagboken-497114` liknar Dagbokens riktiga projekt.

Konsolen: [test](https://console.firebase.google.com/project/dagboken-497114/overview) ·
[drift](https://console.firebase.google.com/project/device-streaming-5b35f7b8/overview).

## Emulatorerna

Firestore- och Auth-emulatorn kör projektet `demo-tidrapporten`. Prefixet `demo-` gör att varken
SDK:n eller emulatorerna når något riktigt projekt. Emulatorerna kräver Java 21 eller senare.

    npm run test:rules        # startar emulatorerna, kör test/emulator/ och stänger dem
    npx firebase emulators:start --only auth,firestore --project demo-tidrapporten

Appen mot emulatorerna: `VITE_FIREBASE_EMULATOR=true npm run dev`. Då finns
`window.testSignIn(uid)`, som loggar in med en osignerad custom token som bara Auth-emulatorn
godtar. Ingenting av det finns i ett bygge utan variabeln, och `test/drift-bygge.spec.ts`
kontrollerar att driftbygget saknar det.

## Inloggningen

`/inloggning` är en Pages Function (`functions/inloggning.ts`, beslut 0017) bakom Cloudflare
Access. Den behöver tre hemligheter per Pages-miljö (Preview och Production):

| Hemlighet         | Innehåll                                                                            |
| ----------------- | ----------------------------------------------------------------------------------- |
| `ACCESS_AUD`      | Access-applikationernas audience-taggar, kommaseparerade                            |
| `ANVANDARE`       | JSON, e-postadress till uid; uid står kvar om adressen byts                         |
| `FIREBASE_SIGNER` | JSON-nyckeln för `tidrapporten-inloggning` (inga roller) i miljöns Firebase-projekt |

Alla adresser ligger bakom samma Access-applikation, så båda miljöerna har samma tagg. Listan
finns för att en andra applikation ska kunna läggas till utan kodändring.

Provet mot testprojektet, med nyckeln i miljövariabeln `FIREBASE_SIGNER_TEST`:

    node scripts/prova-custom-token.mjs

## Pages och Access

Pages-projektet heter `tidrapporten` och publiceras bara från Actions (Direct Upload, ingen
Git-integration). `scripts/pages-projekt.sh` skapar det första gången.

| Adress                          | Pages-gren          | Firebase | Publiceras av                      |
| ------------------------------- | ------------------- | -------- | ---------------------------------- |
| `tid.kodhast.com`               | `produktion`        | drift    | `release.yml`                      |
| `test.tid.kodhast.com`          | `main` (förhand)    | test     | `ci.yml` på main                   |
| `<gren>.tidrapporten.pages.dev` | PR-grenen (förhand) | test     | `ci.yml` på en PR, utom Dependabot |

`test.tid.kodhast.com` är en egen domän på aliaset `main.tidrapporten.pages.dev`.

**Access** (team `kodhast`, Google, _Instant authentication_):

- `Tidrapporten inloggning`, self-hosted: `tid.kodhast.com/inloggning`,
  `test.tid.kodhast.com/inloggning` och `*.tidrapporten.pages.dev/inloggning`. Resten av
  adresserna är öppna. Pages-projektet måste finnas innan `tidrapporten.pages.dev` går att
  välja som domän i Access.

Vem som får logga in avgör `ANVANDARE`, inte Access.

**Webbnyckeln** i testprojektet tillåter `https://*.tidrapporten.pages.dev/*` utöver
`*.kodhast.com` och localhost.

## Hemligheter i GitHub

| Hemlighet               | Var            | Innehåll                                                  |
| ----------------------- | -------------- | --------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | repot          | token `Tidrapporten Pages`: bara _Cloudflare Pages: Edit_ |
| `FIREBASE_DEPLOY_TEST`  | repot          | nyckel för `tidrapporten-deploy` i testprojektet          |
| `FIREBASE_DEPLOY_DRIFT` | miljön `drift` | nyckel för `tidrapporten-deploy` i driftprojektet         |

`tidrapporten-deploy` har rollerna Firebase Rules Admin, Cloud Datastore Index Admin och
Service Usage Consumer. I driftprojektet har det dessutom Cloud Functions Admin och Service
Account User på `tidrapporten-budget` (issue 28), för att driftsätta budgetfunktionen. Miljön `drift` får bara köras från `main`. Kontots id står i
workflowen; det är ingen hemlighet.

## Funktionerna

Koden ligger i `firebase-functions/src/` och buntas med `npm run build:functions` till `firebase-functions/lib/`
(beslut 0014). Paketen den använder står i `firebase-functions/package.json` med en egen
låsfil; `release.yml` installerar dem (`npm ci --prefix firebase-functions`), eftersom
Firebase CLI läser funktionerna ur koden före driftsättningen. Funktionerna driftsätts bara
till drift, av `release.yml`.

## Budgeten och stoppet i test

Beslut 0010 och issue 28. Budgeten **Tidrapporten 100 kr** gäller hela betalkontot, alltså båda
projekten, med e-postlarm vid 50, 90, 100 och 150 % av faktisk kostnad.

```
Cloud Billing ──(var 20–30 min)──▶ Pub/Sub-ämnet budget (drift)
                                        │
                                        ▼
                         funktionen budget (drift, europe-west1)
                         körs som tidrapporten-budget
                          ├─ från 90 %: skriver system/budget i driftens Firestore
                          │             → banderollen överst i appen
                          └─ från 100 %: stänger av betalningen i testprojektet
```

- **Drift stoppas aldrig.** Testprojektets id är det enda funktionen accepterar
  (`TEST_PROJECT` i `firebase-functions/src/budget.ts`), och `tidrapporten-budget` har ingen
  betalroll i drift. Provet `test/budget.spec.ts` läser id:na ur `.firebaserc`.
- **`tidrapporten-budget`** finns bara i driftprojektet och har två roller: Cloud Datastore User
  i drift och Project Billing Manager i testprojektet. Funktionen pekar ut kontot med
  `tidrapporten-budget@`, så en driftsättning till test misslyckas.
- **Fördröjning:** budgetdatan kommer flera timmar sent (Google: ibland över ett dygn), så stoppet
  är inget exakt tak.
- **En kostnad i drift kan stoppa test.** Budgeten är gemensam, och det är avsiktligt (beslut 0010).
- Banderollen visas från 90 % så länge `month` i dokumentet är innevarande månad i svensk tid.
  Funktionen skriver inget under 90 %, så ett gammalt dokument blir liggande men syns inte.

**Slå på betalningen i test igen** när orsaken är åtgärdad eller en ny månad börjat:
[Billing → Account management](https://console.cloud.google.com/billing/01194F-1763BE-26DBAE/manage)
→ _Link a project_ → `dagboken-497114`. Funktionen slår aldrig på den själv.

**Loggar:** funktionen loggar `budget: hanterat` (info, procent och åtgärd) per meddelande och
`budget: avstängningen misslyckades` eller `budget: vägrar stänga av betalningen` (error). Ett
loggbaserat larm på error-raderna läggs i Cloud Monitoring i driftprojektet.
