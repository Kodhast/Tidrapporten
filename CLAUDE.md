# Tidrapporten

PWA för tidrapportering för en IT-konsult: faktisk tid med timer, veckorapporter per mottagare och
flex. React 19 + Vite + TypeScript, Firebase (Firestore, Cloud Messaging, Cloud Functions) och
Cloudflare Pages. Planen för första versionen: issue 8. Varför saker är som de är: `docs/beslut/`
(ett beslut per fil). Bygg inte förbi ett beslut – föreslå en ny ADR i stället (`/adr`).

**Svarslängd:** håll chattsvar minimala. Kod, commits och PR-beskrivningar skrivs normalt.

## Kommandon

    npm run dev        # utvecklingsserver
    npm run verify     # typkontroll + lint + enhetstester med täckning – kör före varje push (en hook spärrar)
    npm run test:e2e   # Playwright mot ett bygge (Chrome på dator och Android)
    npm run format     # Prettier på allt
    npm run icons      # PNG-ikonerna i public/ efter ändrad SVG

Når en molnsession inte Playwrights nedladdning: `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`.

## Regler som aldrig bryts

- **Plan före kod bara för större ändringar:** nytt beteende, flera lager, datamodell eller ett
  vägval → issue med plan (`/refine-issue`) och ägarens ok (`plan-godkänd` eller "kör") före gren,
  kod och PR. Små fixar och dokument går direkt till PR med raden `Liten ändring: <varför>` och
  mergas när CI är grön. Osäker → större. Skill `android:arbetsregler` är enda källan; se
  `docs/beslut/0011-claude-code-och-arbetsflode.md`.
- **Repot är publikt.** Inga kundnamn, uppdrag, priser, tider eller personuppgifter i kod, tester,
  commits, issues eller dokument. Testdata är påhittad. Hemligheter bara i Cloudflare, Firebase och
  GitHub secrets. Se `docs/beslut/0007-sakerhet-och-integritet.md`.
- **Riktig data:** läs bara med ägarens ok, och skriv aldrig i drift utan att ägaren bett om just
  den ändringen – med backup före och en post i ändringsloggen (beslut 0009).
- **En låst vecka ändras bara via en loggad upplåsning.** Ändringsloggen raderas aldrig.
- **Tid sparas i UTC och visas i Europe/Stockholm.** Beräkningar av tid, helgdagar och flex har
  räknade exempel i Vitest.
- **Driftloggar** innehåller bara id:n och händelser, aldrig kundnamn, anteckningar eller tider.
- **Bara tillåtna actions:** organisationen tillåter GitHubs egna actions plus
  `dorny/paths-filter`, `softprops/action-gh-release`, `reactivecircus/android-emulator-runner` och
  `gradle/actions/*`. Allt annat körs som npm-verktyg med `npx`. En ny action kräver ägarens ok.
- **Påstå aldrig att något fungerar innan du kört det.**
- **Ärliga svar:** säg emot när Mats har fel, och säg varför. Inget beröm för frågan, inga
  artighetsfraser, inga ursäkter, ingen utfyllnad. Säg vad som är osäkert eller inte kontrollerat.
  Ett nej mjukas inte upp.

## Webbläsare och användare

Bara Chrome på dator och Android, mest telefon; ingen särskild hänsyn till skärmläsare men vanlig
användbarhet (skill `android:webb`).

## Språk

Engelska i koden: identifierare och kodkommentarer. Svenska i allt annat: gränssnitt, `docs/`,
commit-meddelanden, issues och PR:er.

## Modellval

Skill `android:ai-model-choice` är enda källan: Opus 5.5 som standard för sessionen och varje
agent, Sonnet för enkla vyer och enskilda komponenter, Fable 5.2 bara med skäl och medium eller
high effort. Säg varför innan du byter till Fable 5.2.

## Arbetssätt

- En sak per PR, mot `main`, squash-merge. Tester skrivs i samma PR som koden. Ändras appen höjs
  versionen och `CHANGELOG.md` får en rad (`/release`). Drift bara vid release.
- CI-budget: en PR kostar högst ett par Actions-minuter (`ci.yml`: `verify` och `e2e`).
- Utseendet från `@kodhast/web-ui` och temat i `src/tema.css`; komponenter från web-ui-react
  (issue 13).
- `/refine-issue` planerar, `/implement-issue` genomför, `/mockup` före ny GUI. Före push:
  `/simplify`, agenten `tidrapporten-granskare`, `/code-review`. Allt: `.claude/README.md`.
