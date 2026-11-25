---
name: refine-issue
description: Gör en idé, en bugg eller ett önskemål till ett planerat GitHub-issue i Tidrapporten – stommen i skill android:arbetsflode plus Tidrapportens delar – ADR:erna, datamodell och Firestore-regler, tid och helgdagar, publikt repo, Vitest och Playwright, Definition of Done, modelltabellen och etiketten plan-godkänd. Använd före varje större ändring (nytt beteende, flera lager, datamodell, vägval), och när någon säger skapa issue, planera, förfina, skriv upp en bugg, idé, önskemål.
---

# Förfina och planera ett issue

**Stommen står i skill `android:arbetsflode` → Idé till issue** (fånga och klassa, klargör,
undersök, mockup, mallen, stoppet för ok). Den här skillen säger vad Tidrapporten lägger till. När
en plan krävs: skill `android:arbetsregler` och [beslut
0011](../../../docs/beslut/0011-claude-code-och-arbetsflode.md). Undersöka koden får du, ändra den
får du inte.

Har du ett nummer: hämta issuet **och kommentarerna**, förfina och skriv om det i sin helhet.
Planen för första versionen och ordningen står i issue 8.

Bugg: fråga efter steg, förväntat, faktiskt, telefon eller dator.

## Undersök koden – Tidrapporten

- Vilka vyer, komponenter och moduler i `src/` berörs?
- **Beslut:** vilka ADR:er i `docs/beslut/` rör området? Krockar idén med ett beslut → säg det
  och föreslå en ny ADR (`/adr`), bygg inte förbi.
- **Återbruk:** finns det redan en komponent i web-ui-react eller web-ui, eller en funktion i
  `src/`, som gör jobbet?
- **Data:** nytt fält eller ny samling i Firestore → reglerna, provet i emulatorn och JSON-exporten.
  Låsta veckor och ändringsloggen får aldrig kringgås.
- **Tid:** UTC i lagringen, Europe/Stockholm i visningen, sommartid, helgdagar och egna lediga
  dagar. Beräkningar får räknade exempel i Vitest.
- **Publikt repo:** behövs testdata? Den är påhittad, utan kundnamn och priser.
- **Tester:** vilka finns, vilka nivåer berörs (Vitest, regler i emulatorn, Playwright)?
- **Version:** ändras appen? Vilken höjning (`/release`)?

Mockup: `/mockup`.

## Definition of Done – Tidrapporten

Tester på varje berörd nivå (bugg → regressionstest som faller först), inga riktiga data i repot,
svenska texter i gränssnittet, `npm run verify` och `npm run test:e2e` gröna, mockup godkänd för
ny GUI. Gäller en punkt inte, skriv varför. Testplanen delas i **Vitest**, **Regler** (när
Firestore finns) och **Playwright**, och dess kommandon är issuets Verifiering. Omfånget skrivs
både som **Inom omfång** (i Föreslaget upplägg) och **Utanför omfång**.

**Agent · modell · effort** efter uppgiftens komplexitet, Opus 5.5 som standard (CLAUDE.md →
Modellval, skill `android:ai-model-choice`):

| Uppgift                                                      | Modell                  |
| ------------------------------------------------------------ | ----------------------- |
| Uppslag, läsning, loggar                                     | Haiku                   |
| Små avgränsade ändringar – en fil, en komponent, en enkel vy | Sonnet                  |
| Flera lager, datamodell, regler, beräkningar, granskning     | Opus                    |
| Väldigt komplexa issues – skälet och effort i issuet         | Fable 5.2 · medium/high |

Titel: `<område>: <sammanfattning>`. Planen visas och godkänns i issuet, inte som ett utkast i
chatten.

## Efter ägarens ok

Uppdatera issuet med svaren på de öppna frågorna, sätt etiketten `plan-godkänd` och skriv en
kommentar: var och när ägaren godkände, med ägarens ord. Finns redan en PR, kör om kontrollen
**Plan godkänd** efteråt; den läser etiketten när den körs. Erbjud sedan `/implement-issue`.
