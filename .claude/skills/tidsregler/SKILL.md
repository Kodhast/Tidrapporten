---
name: tidsregler
description: 'Tidrapportens räkneregler – svensk tid och sommartid, ISO-veckor, helgdagar och aftnar, norm, faktisk tid, frånvarons tre sätt att räknas, flex för öppen och skickad vecka, saldo, veckoförslag (fyllt mot normen eller faktisk tid per kvart), luckor, överlapp och glömd timer. Enda källan för formlerna och de räknade exemplen. Ladda när en beräkning i src/domain/ läggs till, ändras eller granskas. Trigger-ord: flex, saldo, norm, omfattning, arbetsdag, helgdag, afton, klämdag, sommartid, midnatt, ISO-vecka, frånvaro, komptid, semester, veckoförslag, avrundning, kvart, lucka, överlapp, timer.'
---

# Tidsregler

Beslutet bakom reglerna: [ADR 0012](../../../docs/beslut/0012-datamodell.md). Koden ligger i
`src/domain/` och har inga beroenden till Firebase eller React. Ändras en regel här ändras koden,
proven och vid behov ADR:en i samma PR – och ett nytt räknat exempel skrivs som tabellprov.

## Tid (`tid.ts`)

- Tidpunkter är millisekunder i UTC (`UtcMillis`). Dagar (`IsoDate`) och veckor (`IsoWeek`)
  gäller alltid `Europe/Stockholm`. Omvandlingen sker bara i `tid.ts`, med `Intl` – inget
  datumbibliotek.
- Ett dygn är 1 440 minuter, men 1 380 när sommartiden börjar och 1 500 när den slutar.
- Ett klockslag som inte finns (02:30 när sommartiden börjar) läses med vintertid och blir 03:30.
  Ett klockslag som finns två gånger (02:30 när sommartiden slutar) blir det första, sommartid.
- ISO-vecka: måndag till söndag, vecka 1 är den som har årets första torsdag.

## Helgdagar och lediga dagar (`helgdagar.ts`)

- Räknas fram, ingen tabell: påsk enligt Meeus/Jones/Butcher, och därifrån långfredag,
  annandag påsk, Kristi himmelsfärd (+39) och pingstdagen (+49). Fasta dagar: nyårsdagen,
  trettondedag jul, första maj, nationaldagen, juldagen och annandag jul. Midsommardagen är
  lördagen 20–26 juni och alla helgons dag lördagen 31 oktober–6 november.
- Aftnarna – midsommarafton (fredagen 19–25 juni), julafton och nyårsafton – är lediga som
  standard.
- Ägarens avvikelser (`freeDays`): `free: true` gör en vardag ledig (klämdag), `free: false` gör
  en afton till arbetsdag. Helgdagar, lördag och söndag är alltid lediga.
- Facit för 2024–2035 står i `helgdagar.test.ts`.

## Norm (`norm.ts`)

- Normen för en dag = `workdayMinutes × scopePercent / 100`, avrundad till hel minut.
- 0 på lediga dagar och utanför uppdragets start- och slutdatum (båda inräknade).
- Villkoren (`terms`) gäller från sitt datum; dagen räknas med de villkor som gällde då, så en
  ändrad omfattning skriver inte om flexen bakåt. Inga villkor än → 0.

## Faktisk tid och frånvaro (`flex.ts`, `timeByDay`)

Ett intervall över midnatt delas per dag (`splitByDay`) och räknas på verklig längd, så en natt
över ett sommartidsbyte blir en timme kortare eller längre. Minuterna räknas på hela
minutgränser så att delarna summerar exakt.

| Räknas som       | Faktisk tid för flexen                    | I rapporten             |
| ---------------- | ----------------------------------------- | ----------------------- |
| intern tidkod    | intervallets längd                        | intervallets längd      |
| `fillsNorm`      | intervallets längd, hel dag = dagens norm | samma                   |
| `flexWithdrawal` | 0 – normen står kvar, så flexen minskar   | längd, hel dag = normen |
| `worked`         | intervallets längd, hel dag = dagens norm | samma                   |

En frånvarotyp som inte finns i listan räknas som `fillsNorm`. Hel dags frånvaro på en ledig
dag ger 0.

## Flex (`flex.ts`)

- **Öppen vecka** (första mottagarens rapport saknas eller är `draft`): faktisk tid minus normen
  hittills. Dagar före i dag har hela sin norm; i dag har normen bara upp till den faktiska
  tiden (`min(norm, faktisk)`), så i dag kan ge plus men inte minus. Dagar efter i dag har ingen
  norm.
- **Skickad vecka** (första mottagarens rapport `sent` eller `unlocked`): faktisk tid minus
  rapporterad tid.
- **Första mottagaren** = mottagaren med lägst `position`, även om den är arkiverad, så att en
  arkivering inte räknar om tidigare veckor.
- **Saldo** = `openingFlex` + varje veckas flex från veckan med `startDate` till i dag eller
  `endDate`. Totalen är summan över uppdragen.
- Har en annan skickad rapport samma vecka en annan summa visar appen en varning
  (`reportsWithOtherSum`); flexen följer ändå den första mottagaren.

## Veckoförslag (`veckoforslag.ts`)

Varje intern kod och frånvarotyp avrundas eller fylls **före** mappningen till mottagarens koder,
så att alla mottagare med samma läge får samma summa.

- **`actualQuarter`:** varje kods och frånvarotyps tid från intervall avrundad till närmaste
  kvart per dag. Minuterna är hela, så 7 min blir 0 och 8 min blir 15. Hel dags frånvaro
  avrundas aldrig – den är exakt dagens norm, också när normen inte är hela kvartar (80 % = 6:24).
- **`fillNorm`:** samma avrundning, sedan görs dagen lika med normen genom att den interna kod
  som har mest tid ändras (lika mycket → lägst id); blir den 0 tas resten från nästa.
  Frånvaro ändras inte. En dag med norm 0 (helg, helgdag) rapporterar inget, så arbete då hamnar
  i flexen. En dag utan intern kod att fylla blir kvar under normen.
- En kod eller frånvarotyp utan mappning rapporteras inte och listas i `unmapped`.

## Luckor, överlapp och glömd timer (`intervall.ts`)

- **Luckor:** mellan dagens första start och sista slut, där inget intervall pågår. Hel dags
  frånvaro räknas inte.
- **Överlapp:** två intervall som delar tid; slut som möter start är inget överlapp.
- **Glömd timer:** har gått mer än 10 timmar. Förslaget på sluttid är starten plus dagens norm
  enligt villkoren (arbetsdag × omfattning, även en ledig dag; 8 h utan villkor), men aldrig efter
  midnatt eller nu.

## Räknade exempel

Ur ADR 0012, uppdrag 100 % och 8 h. Proven: `flex.test.ts` och `veckoforslag.test.ts`.

1. Öppen vecka, onsdag 14:00: mån 8:30, tis 7:45, ons 5:00 → **+0:15**.
2. Skickad vecka: 41:30 faktisk, 40:00 rapporterad → **+1:30**.
3. Semester mån, tis 9:00, ons 8:30, helgdag tors, komptid fre: norm 32:00, faktisk 25:30 →
   **−6:30** både som öppen och som skickad vecka (2026-W20, Kristi himmelsfärd).
4. Ingående +12:00 och exempel 2 och 3 → **+7:00**.
