# 0015. Firebase-projekten och regionen

- **Status:** Beslutat
- **Datum:** 2026-11-25

## Sammanhang

Beslut 0009 säger två Firebase-projekt, test och drift. Planen (issue 10) sa europe-north1 om
Firestore, schemalagda funktioner och export finns där, annars europe-west1. Cloud Scheduler, som
schemalagda funktioner bygger på, finns inte i europe-north1. Google-kontot hade dessutom nått
taket för antal projekt, så inga nya projekt gick att skapa.

## Beslut

- **Region:** europe-west1 (Belgien) för Firestore i båda projekten. Den går inte att ändra.
- **Projekten återanvänds** (ägarens val 2026-11-25): test är `dagboken-497114` med visningsnamnet
  "Tidrapporten test", drift är `device-streaming-5b35f7b8` med visningsnamnet "Tidrapporten
  drift" och miljötypen Production. Båda var tomma. Id:na går inte att byta.
- Koden och `.firebaserc` använder aliasen `test` och `drift`; id:na står bara i `.firebaserc` och
  `src/firebase/config.ts`.
- **Spark tills vidare** (ägaren: slå inte på något som kostar). Blaze kopplas när något kräver det,
  först funktionerna i issue 21, 22 och 28.

## Följder

- Id:t `dagboken-497114` är lätt att blanda ihop med Dagbokens riktiga projekt. Kommandon mot
  Firebase ges därför alltid med alias (`--project test`), aldrig med id.
- Android Studios strömning av enheter kan inte längre använda `device-streaming-5b35f7b8`.
