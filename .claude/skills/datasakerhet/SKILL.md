---
name: datasakerhet
description: 'Datasäkerheten i Tidrapporten – ingen data får tappas. Vad som ska med när ett fält, en samling eller ett dokument läggs till eller ändras i Firestore: kodaren i src/data/dokument.ts, fixturen och rundturen, reglerna och deras prov, JSON-exporten, ändringsloggen och den dagliga backupen. Ladda när data under users/{uid} läggs till, ändras eller tas bort, och när granskaren ser en sådan diff. Trigger-ord: fält, samling, dokument, datamodell, schemaVersion, codec, kodare, firestore.rules, export, JSON-export, backup, säkerhetskopia, återställ, rundtur, ändringslogg, changeLog, dataförlust.'
---

# Datasäkerhet

Ingen data får tappas: inte i appen, inte i exporten och inte i en återställning. Beslutet bakom
datamodellen: [ADR 0012](../../../docs/beslut/0012-datamodell.md); backupen: issue 21 och
[docs/drift.md](../../../docs/drift.md). Som `data-safety-backup` i Android-repona.

## Ett nytt eller ändrat fält

Allt i samma PR:

1. **Domänen:** typen i `src/domain/types.ts`.
2. **Kodaren** i `src/data/dokument.ts`: `toData` skriver fältet, `fromData` läser det tolerant med
   ett standardvärde när det saknas eller är fel (äldre dokument har det inte).
3. **Fixturen** i `src/data/fixturer.ts` sätter fältet till ett värde som inte är standardvärdet,
   så att rundturen i `dokument.test.ts` och `export.test.ts` visar att det överlever.
4. **Reglerna** i `firestore.rules` tillåter fältet med typ och gränser (`hasOnly` eller
   motsvarande), med prov i `test/emulator/`.
5. **Ändringsloggen:** ändrar fältet flexen för en räknad vecka eller en skickad rapport ska
   ändringen loggas (ADR 0016), och reglerna kräver loggposten.
6. Kräver ändringen att gamla dokument skrivs om: höj `SCHEMA_VERSION` i `src/data/kodning.ts`
   med en migrering. Aldrig tyst.

## En ny samling eller ett nytt dokument

Som ett fält, och dessutom:

- **JSON-exporten** i `src/data/exportformat.ts`: samlingen i `USER_COLLECTIONS` (eller
  `ASSIGNMENT_COLLECTIONS` under ett uppdrag), ett dokument under `state` i `STATE_DOCUMENTS`.
  Provet i `export.test.ts` jämför listorna med `firestore.rules` och fäller en samling som saknas.
- **Playwright:** `test/e2e/export.e2e.ts` får ett dokument i den nya samlingen.
- **Undantag:** härledd data som bara en funktion skriver och som klienten inte når hålls
  utanför exporten och reglerna, med skälet i en kommentar och i `docs/drift.md`. Ett:
  `state/reminders`, påminnelsefunktionens minne av vad som är skickat (issue 22).
- **Den dagliga backupen** (beslut 0018) tar hela databasen och behöver ingen ändring. Lägg
  samlingen i `collections` i `scripts/backup.sh`, som räknar dokumenten i återställningsprovet.

## Exportfilen

- `schemaVersion` i filen är `EXPORT_VERSION`. Ändras formatet höjs den, och läsaren ska klara
  de äldre versionerna.
- Tider skrivs som `{ "$timestamp": "…Z" }` med nio decimaler; inget fältnamn i appen får börja
  med `$`. Nycklar som användaren väljer (kod-id:n i `mapping` och `codeNames`) begränsas inte;
  en karta med bara nyckeln `$timestamp` och ett värde som inte är en tid ger ett fel vid
  inläsningen, aldrig en tyst förlust.
- JSON skiljer inte på heltal och decimaltal. Appen lagrar bara heltal, så en återställning
  skriver tillbaka samma typ.
- `toJson` vägrar värden appen inte lagrar (`Date`, `NaN`, `undefined`, referenser) hellre än att
  tappa dem. Lagras en ny sorts värde ska `toJson`, `fromJson` och `toValue` i
  `scripts/aterstall.mjs` lära sig den, med prov.
- **Återställningen i appen** (funktionen `aterstall`, issue 57) vägrar sökvägar som
  `isUserPath` i `src/data/exportformat.ts` inte känner igen. En ny samling ska in där, annars
  går den inte att återställa.
- Återställningen provas i varje PR: `test/e2e/export.e2e.ts` exporterar, återställer till en ny
  användare och jämför varje dokument.

## Radering

- Klienten får inte radera uppdrag, koder, mottagare, arbetsgivare, kunder eller frånvarotyper
  (reglerna nekar). Det går genom funktionerna i `firebase-functions/src/radering.ts`:
  `raderaUppdrag` (issue 26) och `raderaDel` (issue 80). De skriver en post i `changeLog` med
  dokumentet som det var, och vägrar det som används (tid, timer, standarddag, uppdrag, skickade
  veckor). Det som används arkiveras i stället.
- Pekar ett nytt fält eller en ny samling på en del (ett id), ska `deletePart` antingen vägra när
  den används eller rensa pekaren i samma skrivning – annars blir id:t hängande.

## Aldrig

- Radera eller ändra en post i `changeLog` (reglerna nekar det också).
- Ta bort ett fält ur kodaren för att det inte används längre: gamla dokument och exporter har det.
- Riktig data i fixturer eller prov. Allt är påhittat (CLAUDE.md).
