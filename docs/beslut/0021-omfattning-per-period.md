# 0021. Omfattning per period och flex mot anställningen

- **Status:** Beslutat
- **Datum:** 2026-11-28

## Sammanhang

Uppdragets omfattning sparas redan över tid (`terms` med `from`, beslut 0012), men vyn visar bara
perioden som gäller nu, en period kan inte sluta, och omfattningen måste vara 1–100 %. Arbetsgivaren
(0019) har ingen omfattning alls, och flexen överst på startsidan är summan av uppdragens flex. Den
säger inget om tiden mellan uppdrag eller om ett uppdrag som bara täcker en del av anställningen.
Ägarens val 2026-11-27: egen flex mot anställningen, inga glapp mellan perioder, arbetsdagen på både
anställning och uppdrag, och anställningens flex överst på startsidan. Underlag: issue 99.

## Beslut

Både uppdrag och anställning har en lista med perioder som ligger kant i kant, och anställningen får
en egen flex.

- **Perioder:** `AssignmentTerms` (`from`, `scopePercent`, `workdayMinutes`) används för båda. Varje
  period gäller från `from` till dagen före nästa periods `from`; den sista gäller till `endDate`
  eller tills vidare. Det finns inga glapp: ett uppehåll är en period med 0 %, så `scopePercent` är
  0–100.
- **Uppdraget** behåller `startDate`, `endDate` och `terms`. `terms[0].from` är alltid `startDate`.
- **Arbetsgivaren** får `terms: AssignmentTerms[]`, `endDate: IsoDate | null`,
  `openingFlex: Minutes` och `lastChangeId: Id | null`. Anställningen börjar på `terms[0].from`. En
  arbetsgivare utan `terms` har ingen omfattning angiven och ingen egen flex.
- **Flex mot anställningen**, per vecka från anställningens start: summan av veckoflexen i
  arbetsgivarens uppdrag (som i 0012) minus den **otäckta normen**, där otäckt norm är
  anställningens norm minus uppdragens norm samma dagar, med samma "hittills"-regel som en öppen
  vecka. Saldot är anställningens `openingFlex` plus veckorna; uppdragens ingående saldon ingår inte.
  Exempel: anställning 100 %, uppdrag A 50 % rapporterat 20 h och faktiskt 22 h (+2), internt
  uppdrag 0 % faktiskt 19 h (+19), otäckt norm 40 − 20 = 20, veckan blir +1 h.
- **Startsidans flex** är summan av anställningarnas flex. En arbetsgivare utan omfattning och ett
  uppdrag utan arbetsgivare bidrar med uppdragens saldo som tidigare.
- **Loggen (0016):** en ändring av arbetsgivarens `terms`, `endDate` eller `openingFlex` kräver en ny
  post i ändringsloggen, som för uppdragen.

```ts
// Added to Employer
terms: AssignmentTerms[]; // sorted by `from`, edge to edge, may be empty for old data
endDate: IsoDate | null;
openingFlex: Minutes; // signed, balance at terms[0].from
lastChangeId: Id | null;
```

## Följder

- En gammal vecka räknas med omfattningen som gällde då, både i uppdraget och i anställningen.
- Med anställning och uppdrag på samma omfattning blir anställningens flex densamma som summan av
  uppdragens, utom de ingående saldona. Med bänktid eller ett deltidsuppdrag syns skillnaden: tid
  som inte ligger i något uppdrag måste läggas i ett internt uppdrag eller som frånvaro.
- Två flexsaldon finns sida vid sida, och de kan skilja sig. Flexarket visar båda.
- Ingen migrering: uppdragens data är oförändrad, och arbetsgivare utan de nya fälten läses som
  tomma. Fälten ska in i reglerna, exporten, återställningen och rundturstestet (skill
  `datasakerhet`).
- En anställning per arbetsgivare. Flera anställningar hos samma arbetsgivare blir ett nytt beslut.
