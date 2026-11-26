# 0012. Datamodell, låsning och flex

- **Status:** Beslutat; normens avrundning ersatt av 0013; loggade ändringar av inställningar i 0016; arbetsgivare och kunder i 0019
- **Datum:** 2026-11-25

## Sammanhang

Domänmodellen (0003) säger vad appen håller reda på, men inte hur det ligger i Firestore, hur en
skickad vecka skyddas eller exakt hur flexen räknas. Det är dyrt att ändra när riktig data finns,
och både beräkningarna (issue 14) och reglerna (issue 15) bygger på det. Ägarens beslut från
granskningen av planen 2026-11-25 är inskrivna nedan. Underlag: issue 31.

Utgångspunkter som redan är beslutade: Firestore med realtidssynk (0005), tid i UTC som visas i
Europe/Stockholm (0005), bara ägaren läser och skriver (0007), offline bara för timern (0005), och
en ändringslogg som aldrig raderas (0003).

## Beslut

### Grunder

- **Allt under `users/{uid}/…`.** `uid` är det fasta id:t ur inloggningen (issue 11). Ingen data
  ligger utanför ägarens träd.
- **Varje dokument** har `schemaVersion` (heltal, 1 från start), `createdAt` och `updatedAt`
  (servertid). Omvandlingen mellan Firestore och domänen finns på ett ställe (`src/data/`), läser
  okända fält utan fel och fyller i standardvärden för saknade fält.
- **Tidpunkter** sparas som Firestore `Timestamp` (UTC). I domänen är de millisekunder sedan
  epoken (`UtcMillis`), så att domänen inte beror på Firebase.
- **Kalenderdagar** sparas som text `ÅÅÅÅ-MM-DD` och är alltid dagar i svensk tid. **Veckor** är
  ISO-veckor som text `ÅÅÅÅ-Www`, måndag till söndag i svensk tid.
- **Längder** sparas som hela minuter, aldrig som decimaltimmar, så att summor blir exakta.
- **Id:n** skapas av klienten (Firestores slumpade id), utom där ett id av innehållet förhindrar
  dubbletter: rapporter, lediga dagar, pausmarkeringar och intervall från timern.
- **Värden i data är på engelska** som koden. Gränssnittet visar dem på svenska: `draft` =
  utkast, `sent` = skickad, `unlocked` = upplåst.

### Samlingar

| Sökväg                              | Innehåll                                                             | Id                               |
| ----------------------------------- | -------------------------------------------------------------------- | -------------------------------- |
| `assignments/{id}`                  | Uppdrag: namn, villkor över tid, ingående saldo, standarddag, arkiv  | slumpat                          |
| `assignments/{id}/codes/{id}`       | Intern tidkod: namn, debiterbar, arkiv, ordning                      | slumpat                          |
| `assignments/{id}/receivers/{id}`   | Mottagare: namn, plats i kedjan, förslagsläge, egna koder, mappning  | slumpat                          |
| `absenceTypes/{id}`                 | Frånvarotyp: namn, hur den räknas, arkiv, ordning                    | slumpat                          |
| `freeDays/{datum}`                  | Avvikelse från helgdagsreglerna: extra ledig dag eller arbetad afton | datumet                          |
| `entries/{id}`                      | Intervall eller frånvaro en hel dag                                  | slumpat, från timern se nedan    |
| `pauses/{datum}`                    | Markering: dagens luckor är pauser                                   | datumet                          |
| `reports/{uppdrag}_{mottagare}_{v}` | Veckorapport till en mottagare                                       | uppdrag, mottagare och ISO-vecka |
| `changeLog/{id}`                    | Ändringsloggen                                                       | slumpat                          |
| `devices/{id}`                      | Enhet för push: FCM-token, namn                                      | slumpat per installation         |
| `state/timer`                       | Den pågående timern                                                  | fast                             |
| `state/settings`                    | Påminnelser och gränser                                              | fast                             |

`state/` är en samling med två fasta dokument, eftersom Firestore varvar samling och dokument i
sökvägen.

### Domänens typer

Typerna kodas i `src/domain/types.ts` i issue 14. `schemaVersion`, `createdAt` och `updatedAt`
finns bara i lagret i `src/data/`, inte i domänen.

```ts
type Id = string;
type UtcMillis = number; // instant, UTC
type IsoDate = string; // 'YYYY-MM-DD', calendar day in Europe/Stockholm
type IsoWeek = string; // 'YYYY-Www', ISO week in Europe/Stockholm
type Minutes = number; // whole minutes
type ClockTime = string; // 'HH:MM', Europe/Stockholm

interface Assignment {
	id: Id;
	name: string;
	startDate: IsoDate; // flex is counted from this day
	endDate: IsoDate | null;
	terms: AssignmentTerms[]; // sorted by `from`, the first one starts at startDate
	openingFlex: Minutes; // signed, balance at startDate
	standardDay: StandardDaySlot[];
	archived: boolean;
	order: number;
}

interface AssignmentTerms {
	from: IsoDate;
	scopePercent: number; // 1–100
	workdayMinutes: Minutes; // full-time workday, 480 by default
}

interface StandardDaySlot {
	start: ClockTime;
	end: ClockTime;
	codeId: Id;
}

interface TimeCode {
	id: Id;
	assignmentId: Id;
	name: string;
	billable: boolean;
	archived: boolean;
	order: number;
}

type SuggestionMode = 'fillNorm' | 'actualQuarter';

interface Receiver {
	id: Id;
	assignmentId: Id;
	name: string;
	position: number; // 1 = first in the chain, counts for flex
	suggestionMode: SuggestionMode;
	codes: ReceiverCode[]; // in the receiver's order
	mapping: Record<Id, Id>; // internal code or absence type id -> receiver code id
	archived: boolean;
}

interface ReceiverCode {
	id: Id;
	name: string;
}

type AbsenceCounting = 'fillsNorm' | 'flexWithdrawal' | 'worked';

interface AbsenceType {
	id: Id;
	name: string;
	counting: AbsenceCounting;
	archived: boolean;
	order: number;
}

interface FreeDay {
	date: IsoDate;
	free: boolean; // true = extra day off, false = a default day off (an eve) is worked
	name: string;
}

type EntrySubject = { kind: 'code'; codeId: Id } | { kind: 'absence'; absenceTypeId: Id };

type EntryTime =
	| { kind: 'interval'; start: UtcMillis; end: UtcMillis } // end > start, at most 24 h
	| { kind: 'allDay'; date: IsoDate }; // only for absence

interface Entry {
	id: Id;
	assignmentId: Id;
	subject: EntrySubject;
	time: EntryTime;
	note: string; // at most 500 characters
}

interface Timer {
	assignmentId: Id;
	subject: EntrySubject;
	start: UtcMillis;
}

interface PauseMark {
	date: IsoDate;
}

type ReportStatus = 'draft' | 'sent' | 'unlocked';

interface ReportLine {
	receiverCodeId: Id;
	minutesPerDay: [Minutes, Minutes, Minutes, Minutes, Minutes, Minutes, Minutes]; // Mon–Sun
}

interface ReportSnapshot {
	sentAt: UtcMillis;
	assignmentName: string;
	receiverName: string;
	codeNames: Record<Id, string>;
	actualMinutes: Minutes; // actual time for the week when it was sent
}

interface Report {
	id: Id; // `${assignmentId}_${receiverId}_${week}`
	assignmentId: Id;
	receiverId: Id;
	week: IsoWeek;
	status: ReportStatus;
	mode: SuggestionMode;
	lines: ReportLine[];
	snapshot: ReportSnapshot | null; // set when sent
	lastChangeId: Id | null; // the changeLog entry written with the latest locked change
}

type ChangeAction = 'create' | 'update' | 'delete' | 'send' | 'unlock';

interface ChangeLogEntry {
	id: Id;
	at: UtcMillis;
	path: string; // e.g. 'reports/a1_r1_2026-W48'
	action: ChangeAction;
	week: IsoWeek | null;
	before: Record<string, unknown> | null;
	after: Record<string, unknown> | null;
	reason: string;
	by: 'app' | 'claude';
}

interface Settings {
	noTimerBy: ClockTime | null; // reminder: no timer running, default '09:30'
	timerRunningAt: ClockTime | null; // reminder: timer still running, default '19:00'
	remindEmptyDay: boolean;
	reportReminderFridayAt: ClockTime | null; // default '15:00'
	flexWarning: Minutes; // default 1200 (±20 h)
}

interface Device {
	id: Id;
	fcmToken: string;
	label: string;
}
```

### Uppdrag, norm och lediga dagar

- **Villkoren gäller från ett datum.** Omfattning och arbetsdag ligger i `terms` med ett
  startdatum, så att en ändrad omfattning inte skriver om flexen bakåt. Normen för en dag tas från
  de villkor som gällde den dagen.
- **Normen** för en dag är `workdayMinutes × scopePercent / 100`, avrundat till hel minut, och 0 på
  lördag, söndag, helgdag, ledig dag och dagar utanför uppdragets start och slut.
- **Lediga dagar:** helgdagarna och aftnarna (midsommar-, jul- och nyårsafton) räknas fram i
  koden. `freeDays` innehåller bara avvikelserna: `free: true` är en extra ledig dag (klämdag),
  `free: false` gör en afton till arbetsdag. De gäller alla uppdrag.

### Intervall, timer och paus

- **Ett intervall** har start och slut och hör till ett uppdrag och antingen en intern tidkod eller
  en frånvarotyp. Ett intervall är högst 24 timmar; ett intervall över midnatt delas per dag i
  beräkningarna (issue 14).
- **Frånvaro en hel dag** (`allDay`) sparas utan klockslag. Den räknas som dagens norm för
  uppdraget.
- **Timern** ligger bara i `state/timer`, inte som ett intervall utan slut. Alla enheter lyssnar på
  samma dokument, så timern synkas direkt (0004). När timern stoppas skrivs intervallet och
  `state/timer` töms i samma batch. Intervallets id är `timer-<startens millisekunder>`, så att två
  enheter som stoppar samma timer ger ett intervall och inte två.
- **Paus** är en markering per dag (`pauses/{datum}`): finns den är alla luckor den dagen pauser
  och varnar inte. Ingen markering för enskilda luckor.

### Frånvaro

Varje frånvarotyp har en inställning för hur den räknas. Standardvärdena skapas vid första
inloggningen och går att ändra:

| Räknas som       | Faktisk tid                               | Standard för                               |
| ---------------- | ----------------------------------------- | ------------------------------------------ |
| `fillsNorm`      | intervallets längd, hel dag = dagens norm | semester, sjukdom, tjänstledighet, bänktid |
| `flexWithdrawal` | 0 – normen står kvar, så flexen minskar   | komptid                                    |
| `worked`         | intervallets längd, som arbetad tid       | utbildning, interna möten                  |

### Veckorapport och låsning

- **En rapport per uppdrag, mottagare och vecka.** Förslaget räknas fram tills rapporten sparas;
  dokumentet skapas första gången den justeras eller skickas. Raderna är minuter per mottagarkod
  och dag.
- **Status:** `draft` (utkast) kan ändras och raderas fritt. `sent` (skickad) kan inte ändras. Det
  enda som är tillåtet är att låsa upp. `unlocked` (upplåst) kan ändras och skickas igen.
- **Ögonblicksbilden** sparas när rapporten skickas: namnen på uppdrag, mottagare och koder som de
  var då, tidpunkten och veckans faktiska tid. Ett senare namnbyte ändrar inte en skickad rapport.
- **Låst ändring** = upplåsning, varje ändring av en upplåst rapport och att skicka den igen. Varje
  låst ändring skrivs i samma batch som en **ny** post i `changeLog`, och rapportens
  `lastChangeId` pekar på posten. Reglerna kräver att:
  - posten inte fanns före skrivningen (`!exists(changeLog/<lastChangeId>)`),
  - posten finns efter (`existsAfter(…)`) och dess `path` är rapportens sökväg,
  - skälet inte är tomt.

  Därmed går en gammal post inte att återanvända, och ingen låst ändring sker utan logg.

- **En skickad eller upplåst rapport kan inte raderas.**
- **Intervallen i en skickad vecka** går att rätta. Appen skriver en post i ändringsloggen med före
  och efter i samma batch, och ber om ett skäl som får vara tomt. Reglerna håller inte detta: en
  regel för intervallen skulle behöva läsa rapporterna till alla mottagare den veckan vid varje
  skrivning. Rättningen ändrar flexen men inte rapporten.
- **En vecka är skickad för ett uppdrag** när någon av uppdragets rapporter den veckan har status
  `sent` eller `unlocked`.

### Ändringsloggen

- Fälten är tid, sökväg, handling, vecka, före, efter, skäl och vem (`app` eller `claude`).
- Reglerna tillåter bara `create`, aldrig `update` eller `delete`. Tiden måste vara
  `request.time`.
- Klienten får bara skriva `by: 'app'`. Claude rättar med ett eget tjänstekonto (0009), som går
  förbi reglerna; där skriver rättningsverktyget `by: 'claude'` (issue 27).
- Loggen sparas för alltid. Den följer med i backupen och i JSON-exporten.

### Flex

Flexen räknas per uppdrag och vecka, och saldot är `openingFlex` plus summan av veckorna från
uppdragets startdatum. Totalen är summan över uppdragen. Faktisk tid är arbetade intervall plus
frånvaro enligt tabellen ovan.

- **Öppen vecka** (första mottagarens rapport finns inte eller är `draft`): faktisk tid minus
  normen hittills. **Hittills** betyder dagarna före i dag med hela sin norm, och i dag med normen
  bara upp till den faktiska tiden. I dag kan alltså ge plus men inte minus förrän dagen är slut.
- **Skickad vecka** (första mottagarens rapport är `sent` eller `unlocked`): faktisk tid minus
  rapporterad tid.
- **Rapporterad tid tas från den första mottagaren i kedjan** (`position` 1). Summan ska vara
  densamma till alla mottagare (0003). Är någon annan skickad rapport den veckan en annan summa,
  visar appen en varning. Den första mottagaren är oftast arbetsgivaren, som också får frånvaron,
  så summan där är den som stämmer mot normen.

### Offline

Firestores offline-cache (`persistentLocalCache`) är på för läsning. Skrivningar offline är
tillåtna bara för timern och för intervall i veckor som inte är skickade (0005).

- Appen räknar sig som uppkopplad när lyssnaren på `state/timer` har `fromCache == false`.
- Rapporter (spara, skicka, låsa upp) skrivs med `runTransaction`, som kräver kontakt med servern
  och misslyckas offline i stället för att köas.
- Inställningar, uppdrag, koder, mottagare, frånvarotyper och lediga dagar har knapparna
  avstängda offline.
- Intervall i en skickad vecka går inte att rätta offline.

### Räknade exempel

Påhittat uppdrag med 100 % och arbetsdag 8 h, alltså normen 8 h en vanlig vardag. Exemplen blir
tabellprov i issue 14.

**1. Öppen vecka, onsdag kl. 14.** Måndag 8 h 30 min, tisdag 7 h 45 min, onsdag hittills 5 h.

| Dag     | Faktisk | Norm hittills | Flex      |
| ------- | ------- | ------------- | --------- |
| Måndag  | 8:30    | 8:00          | +0:30     |
| Tisdag  | 7:45    | 8:00          | −0:15     |
| Onsdag  | 5:00    | 5:00 (i dag)  | 0:00      |
| **Sum** |         |               | **+0:15** |

**2. Skickad vecka.** Faktisk tid måndag till fredag 8:30, 9:00, 7:30, 8:15, 8:15 = 41:30. Den
första mottagaren fick 40:00 (fyllt mot normen). Flex = 41:30 − 40:00 = **+1:30**. Hade den
andra mottagaren fått 38:00 hade appen visat en varning, men flexen är fortfarande +1:30.

**3. Vecka med frånvaro och helgdag.** Måndag semester hela dagen, tisdag 9:00, onsdag 8:30,
torsdag helgdag, fredag komptid hela dagen.

| Dag     | Norm      | Faktisk                |
| ------- | --------- | ---------------------- |
| Måndag  | 8:00      | 8:00 (semester fyller) |
| Tisdag  | 8:00      | 9:00                   |
| Onsdag  | 8:00      | 8:30                   |
| Torsdag | 0:00      | 0:00 (helgdag)         |
| Fredag  | 8:00      | 0:00 (komptid, uttag)  |
| **Sum** | **32:00** | **25:30**              |

Som öppen vecka efter fredagen: 25:30 − 32:00 = **−6:30**. Som skickad vecka, där den första
mottagaren fick semester 8, tisdag 8, onsdag 8 och komptid 8 = 32:00: 25:30 − 32:00 = **−6:30**.
Komptiden tar 8 h ur flexen och de 1 h 30 min extra på tisdag och onsdag lägger tillbaka.

**4. Saldo.** Ingående saldo +12:00 och veckorna ovan (exempel 2 och 3): 12:00 + 1:30 − 6:30 =
**+7:00**.

## Följder

- Issue 14 kodar typerna och räknereglerna ovan, med exemplen som prov. Issue 15 kodar reglerna,
  omvandlingen och låsningen.
- Reglerna för låsning blir krångliga (`lastChangeId`, `existsAfter`) och måste provas i
  emulatorn för varje fall: upplåsning med och utan logg, ändring av upplåst rapport, återanvänd
  loggpost och radering.
- Rättningar av intervall i en skickad vecka skyddas bara av appen. Skriver en enhet ett intervall
  offline medan en annan skickar veckan, hamnar rättningen utan logg. Det är sällsynt och syns i
  flexen; det accepteras.
- Flyttas en mottagare till plats 1 räknas flexen om för alla skickade veckor bakåt. Appen varnar
  innan ordningen ändras.
- Flexen läser alla intervall sedan uppdragets start, ungefär 1 500 dokument om året.
  Realtidslyssnaren och cachen gör att bara ändringar läses om. Blir det dyrt kan en sammanfattning
  per vecka läggas till senare, i en egen ADR.
- Frånvaro ligger på ett uppdrag. Den som har två uppdrag samtidigt lägger in semester på båda.
