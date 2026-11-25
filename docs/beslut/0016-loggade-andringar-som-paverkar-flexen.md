# 0016. Loggade ändringar som påverkar flexen

- **Status:** Beslutat
- **Datum:** 2026-11-25

## Sammanhang

ADR 0012 låser veckorapporterna: en skickad rapport ändras bara via en upplåsning, och reglerna
kräver en ny post i ändringsloggen för varje låst ändring. Men flexen för en skickad vecka beror
också på inställningar som ligger utanför rapporten, och de ändras fritt utan spår:

- uppdragets `openingFlex` och `startDate` avgör saldot och från vilken vecka det räknas,
- uppdragets `terms` och `endDate` och de lediga dagarna (`freeDays`) avgör normen, och därmed vad
  en heldagsfrånvaro (`allDay`) är värd som faktisk tid,
- frånvarotypens `counting` avgör hur frånvaron räknas som faktisk tid,
- mottagarens `position` avgör vilken rapport som är den första och alltså ger den rapporterade
  tiden.

En granskning av reglerna 2026-11-25 (issue 39) visade luckan. Det går att ändra flexen bakåt utan
att det syns i loggen, vilket strider mot "låst + ändringslogg" (0003). Intervallen i en skickad
vecka loggas av appen men inte av reglerna (0012). För de här dokumenten går det att kräva logg i
reglerna utan extra läsningar, eftersom skrivningen gäller ett enda dokument.

## Beslut

Varje ändring av ett fält som påverkar flexen för redan räknade veckor skrivs i samma batch som en
**ny** post i `changeLog`, och reglerna kräver det, med samma mönster som för rapporterna:

- `assignments`, `absenceTypes`, `receivers` och `freeDays` får fältet `lastChangeId: Id | null`.
- Reglerna kräver en ny loggpost (`!exists`, `existsAfter`, `path` = dokumentets sökväg,
  `action`, `before` och `after` satta, `week == null`) när
  - ett uppdrags `openingFlex`, `startDate`, `endDate` eller `terms` ändras,
  - en frånvarotyps `counting` ändras,
  - en mottagare skapas eller dess `position` ändras,
  - en ledig dag skapas eller ändras.
- Skälet får vara tomt, som vid rättning av intervall. Det är inställningar, inte en vecka som
  öppnas.
- Övriga fält (namn, arkiv, ordning, debiterbar, mappning m.m.) ändras utan logg.
- Loggen krävs alltid, inte bara när en skickad vecka berörs. Reglerna kan inte avgöra det billigt,
  och ändringarna är sällsynta.
- **Undantag:** en radering av en ledig dag kan reglerna inte koppla till en loggpost, eftersom en
  radering inte har några nya fält. Den loggas av appen, som intervallen.

## Följder

- Flexen för en skickad vecka kan inte längre ändras via inställningarna utan att det står i
  loggen. Intervallen och raderade lediga dagar är de kvarvarande luckorna, och de skyddas bara av
  appen.
- Skrivarna för uppdrag, frånvarotyper, mottagare och lediga dagar (kommande vyer) måste skriva
  med `runTransaction` eller en batch med loggposten, och fungerar därför inte offline. Det
  stämmer med 0012, där knapparna redan är avstängda offline.
- Fler loggposter, men bara vid sällsynta ändringar av inställningar.
- Gamla dokument utan `lastChangeId` läses som `null` av `src/data/`. Det finns ingen riktig data
  ännu.
- Reglerna och emulatorproven ändras i issue 39.
