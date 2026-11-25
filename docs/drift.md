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
- Planen är **Spark** (gratis). Blaze kopplas av ägaren när funktionerna kommer (issue 21, 22, 28).
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
`window.testinloggning(uid)`, som loggar in med en osignerad custom token som bara Auth-emulatorn
godtar. Ingenting av det finns i ett bygge utan variabeln, och `test/drift-bygge.spec.ts`
kontrollerar att driftbygget saknar det.

## Funktionerna

Koden ligger i `functions/src/` och buntas med `npm run build:functions` till `functions/lib/`
(beslut 0014). Ingen funktion är driftsatt än.
