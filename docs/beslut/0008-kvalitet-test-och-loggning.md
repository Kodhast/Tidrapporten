# 0008. Kvalitet, test och loggning

- **Status:** Beslutat
- **Datum:** 2026-11-25

## Sammanhang

Felen som kostar mest i en tidrapport är fel i beräkningarna – flex, norm, helgdagar, sommartid
och låsning – och de syns inte i gränssnittet. Underlag från issue 6.

## Beslut

- **Testpyramid:** många enhetstester i Vitest för beräkningarna, Firestore-reglerna i emulatorn
  och några Playwright-flöden (timer, veckorapport, låsning). Befintliga tester tas aldrig bort.
- **Webbläsare:** bara Chrome på dator och Android, mest telefon. Ingen särskild hänsyn till
  skärmläsare, men vanlig användbarhet: tryckytor, kontrast och små skärmar.
- **Ändringslogg i datan:** varje ändring av en låst vecka och varje rättning Claude gör loggas
  med tid, vad, skäl och vem. Loggen sparas för alltid.
- **Driftloggar** i Pages Functions och Cloud Functions som strukturerad JSON: `info` för sällsynta
  viktiga händelser, `error` för allt som misslyckas (larmar i Google Cloud), `debug` bara i
  testmiljön. 30 dagars lagring. Bara id:n och händelser – aldrig kundnamn, anteckningar eller
  tider.
- **Webbläsaren** loggar inget till någon extern tjänst; fel visas i appen. Ingen Sentry.

## Följder

- Playwright kör två projekt, Chrome på dator och Pixel 7.
- Vitest har en gräns för provtäckning som CI kontrollerar.
