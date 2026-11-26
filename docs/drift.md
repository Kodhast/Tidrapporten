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
Service Usage Consumer. I driftprojektet har det dessutom, för att driftsätta funktionerna,
Cloud Functions Admin, Firebase Viewer, Cloud Run Admin och Pub/Sub Editor, och Service
Account User på `tidrapporten-budget` (issue 28), `tidrapporten-aterstall` (issue 57),
standardkontot `device-streaming-5b35f7b8@appspot.gserviceaccount.com` och standardkontot för
Compute `324013256111-compute@developer.gserviceaccount.com` (Firebase CLI kräver dem även när
funktionerna har egna konton). Miljön `drift` får bara köras från `main`. Kontots id står i
workflowen; det är ingen hemlighet.

## Funktionerna

Koden ligger i `firebase-functions/src/` och buntas med `npm run build:functions` till `firebase-functions/lib/`
(beslut 0014). Paketen den använder står i `firebase-functions/package.json` med en egen
låsfil; `release.yml` installerar dem (`npm ci --prefix firebase-functions`), eftersom
Firebase CLI läser funktionerna ur koden före driftsättningen. Funktionerna driftsätts bara
till drift, av `release.yml`. I e2e körs de i Functions-emulatorn; `npm run test:e2e` buntar dem
först, och paketen installeras med `npm ci --prefix firebase-functions`.

**`aterstall`** (issue 57) är en anropbar funktion som lägger tillbaka det som saknas från en
JSON-export, bara för den inloggade. Den körs som **`tidrapporten-aterstall`**, med bara rollen
Cloud Datastore User i drift. Kontot och rätten för `tidrapporten-deploy` att driftsätta
funktionen som det skapas av projektets ägare före första releasen med funktionen:

    gcloud iam service-accounts create tidrapporten-aterstall --project=device-streaming-5b35f7b8
    gcloud projects add-iam-policy-binding device-streaming-5b35f7b8 \
      --member=serviceAccount:tidrapporten-aterstall@device-streaming-5b35f7b8.iam.gserviceaccount.com \
      --role=roles/datastore.user
    gcloud iam service-accounts add-iam-policy-binding \
      tidrapporten-aterstall@device-streaming-5b35f7b8.iam.gserviceaccount.com \
      --project=device-streaming-5b35f7b8 \
      --member=serviceAccount:tidrapporten-deploy@device-streaming-5b35f7b8.iam.gserviceaccount.com \
      --role=roles/iam.serviceAccountUser

En anropbar funktion ska kunna anropas av alla (den kontrollerar själv inloggningen). Om
`tidrapporten-deploy` får sätta det på Cloud Run-tjänsten är inte provat, och en körning med
_dry_run_ prövar inte rättigheterna. Fallerar första driftsättningen på anroparen behöver kontot
rollen Cloud Run Admin. I testmiljön finns funktionen inte, så återställningen ger där "Det gick inte
att återställa".

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
[Billing → Account management](https://console.cloud.google.com/billing)
→ _Link a project_ → `dagboken-497114`. Funktionen slår aldrig på den själv.

**Loggar** (beslut 0008): funktionen loggar `budget: betalningen avstängd` (info) när den
stänger av, och `budget: avstängningen misslyckades`, `budget: vägrar stänga av betalningen`,
`budget: statusen kunde inte skrivas` eller `budget: okänt meddelande` (error). Meddelanden
under 90 % och upprepade meddelanden efter stoppet loggas inte.

**API:er i drift** (påslagna 2026-11-25): Cloud Functions, Cloud Build, Artifact Registry,
Cloud Run, Eventarc och Cloud Billing.

**Första driftsättningen av funktionerna** (release 1.0, 2026-11-26) krävde också att ägaren gav
Googles tjänstekonton i projektet roller, som Firebase CLI inte får sätta själv: Pub/Sub-agenten
`service-324013256111@gcp-sa-pubsub.iam.gserviceaccount.com` fick Service Account Token
Creator, och standardkontot för Compute `324013256111-compute@developer.gserviceaccount.com`
fick Cloud Run Invoker och Eventarc Event Receiver. Dessutom en engångsinställning som rensar
gamla funktionsbyggen i Artifact Registry, utan vilken Firebase CLI stoppar en deploy utan
`--force`: `npx -y firebase-tools functions:artifacts:setpolicy --project
device-streaming-5b35f7b8 --location europe-west1 --force`. En körning med _dry_run_ prövar
inget av detta; den skarpa körningen skriver ut vad som saknas.

**Authentication** måste vara startat i projektet (Firebase-konsolen → Authentication → Get
started), annars nekar Firebase varje inloggning med `CONFIGURATION_NOT_FOUND` och appen säger
"Inloggningen gick inte". Ingen inloggningsmetod behöver slås på; appen loggar in med custom
token. Startat i test 2026-11-25 och i drift 2026-11-26.

## Backup

**Daglig backup** (beslut 0018): Firestores schemalagda backuper i test och drift, en om dagen
med 30 dagars lagringstid, och point-in-time recovery (7 dagar) i drift. Sätts upp en gång per
projekt i Cloud Shell av projektets ägare:

    bash scripts/backup.sh test
    bash scripts/backup.sh drift

**De senaste backuperna** (kontrolleras vid varje release; det finns inget larm):

    gcloud firestore backups list --location=europe-west1 --project=device-streaming-5b35f7b8

**Återställa** en backup: den blir en ny databas i samma projekt, och appen läser fortfarande
`(default)`. Kontrollera den nya databasen och kopiera tillbaka det som saknas, eller byt namn
genom att radera `(default)` och återställa dit. Det senare stoppar appen under tiden och är inte
provat.

    gcloud firestore databases restore --project=<projekt> \
      --source-backup=projects/<projekt>/locations/europe-west1/backups/<id> \
      --destination-database=<nytt-namn>

**Provet** återställer den senaste backupen i test, jämför antalet dokument per samling och
raderar den återställda databasen:

    bash scripts/backup.sh prova

**Ett misstag de senaste 7 dagarna i drift** återställs med PITR till en viss minut: se
[Googles steg](https://firebase.google.com/docs/firestore/use-pitr).

**JSON-exporten i appen** (Inställningar → Exportera all data) läser varje dokument under
`users/{uid}` från servern, ändringsloggen inräknad, och laddar ner `tidrapporten-<datum>.json`:

```json
{
	"app": "Tidrapporten",
	"schemaVersion": 1,
	"exportedAt": "2026-11-26T09:00:00.000Z",
	"documents": {
		"entries/e1": { "time": { "start": { "$timestamp": "2026-11-16T07:00:00.000000000Z" } } }
	}
}
```

Nycklarna i `documents` är dokumentens sökvägar under användaren. Tider skrivs med nio decimaler
och läses tillbaka exakt med `fromJson` i `src/data/export.ts`.

**Återställa en JSON-export** till en tom användare, i Cloud Shell med projektets ägare
inloggad. Drift kräver dessutom `--drift` och ägarens uttryckliga ok (beslut 0009):

    node scripts/aterstall.mjs tidrapporten-<datum>.json <uid> test

Skriptet vägrar en användare som redan har data. I appen gör knappen **Återställ från fil** samma
sak för den inloggade, men lägger bara tillbaka det som saknas och skriver aldrig över
(funktionen `aterstall` ovan). `test/e2e/export.e2e.ts` exporterar, återställer
till en ny användare och jämför varje dokument mot emulatorerna i varje PR. Vad som ska med när datan ändras:
skill `datasakerhet`.
