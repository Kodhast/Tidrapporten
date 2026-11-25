---
name: implement-issue
description: 'Genomför ett GitHub-issue i Tidrapporten till en mergad PR – stommen i skill android:arbetsflode plus Tidrapportens delar – plan-kontrollen (plan-godkänd, Liten ändring), React och web-ui, versionen och CHANGELOG, npm run verify och e2e, /simplify, agenten granskare, tillåtna actions och konflikter i versionen. Använd när någon säger genomför, implementera, kör #N, fixa buggen, bygg funktionen, eller efter /refine-issue.'
---

# Genomföra ett issue

**Stommen står i skill `android:arbetsflode` → Issue till PR** (förra PR:en, förstå, bygg,
kontroller, granskningsrundor, en push, PR-texten, bevakning, konflikter, merge). Följ den steg för
steg; den här skillen säger vad som gäller i Tidrapporten, under stommens stegnamn. Basgrenen är
`main`, och bara squash-merge är tillåten.

## Före allt – Godkänd plan

Hämta issuets etiketter (`issue_read`, `get_labels`) innan något annat. När en plan krävs står i
skill `android:arbetsregler` och [beslut 0011](../../../docs/beslut/0011-claude-code-och-arbetsflode.md).

- **Liten ändring** → `Liten ändring: <varför>` i PR-texten. Osäker → större.
- **`plan-godkänd` finns, eller ägaren har skrivit "kör" på planen** → fortsätt. Har ägaren
  skrivit "kör", sätt etiketten och kommentera var och när.
- **Större ändring utan godkänd plan, eller inget issue** → stanna och kör `/refine-issue`.
- **Ägaren har uttryckligen sagt att en plan inte behövs** → `Utan plan: <ägarens ord, tid>` i
  PR-texten. Bara ägaren kan ge det undantaget.

Hooken `plan-approved.mjs` och CI-kontrollen **Plan godkänd** stoppar en PR som saknar något av
dem. Gå aldrig runt dem.

## Förstå – Tidrapporten

Läs de ADR:er i `docs/beslut/` som rör området. Krockar arbetet med ett beslut: föreslå en ny
ADR (`/adr`), bygg inte förbi. Mockup: `/mockup`. Slå upp API:er för React, Vite, Firebase och
React Aria i aktuell dokumentation (kopplingen Context7) i stället för att gissa.

## Bygg – Tidrapporten

- React-kod: följ `vercel-react-best-practices` där den gäller en klientapp (inte Next.js eller
  server-rendering). Typerna och referenserna kommer från `typescript-lsp`.
- Utseendet från `@kodhast/web-ui` (`kh-*`) och `src/tema.css`; komponenter från
  web-ui-react när det finns (issue 13).
- **Version:** höjningen och raden i `CHANGELOG.md` står i `/release`.
- **Commit-meddelanden** på svenska, som en rubrik utan prefix (`Skelett: …`, `e2e: …`) –
  repots stil går före stommens `feat(område):`.
- Engelska i koden, svenska i gränssnittet. Testdata påhittad. Ett test hoppas aldrig över med
  `skip` eller `fixme`, och täckningsgränsen i `vite.config.ts` sänks aldrig för att bli grön.
- **Workflows** använder bara actions som organisationen tillåter (CLAUDE.md). Allt annat körs
  som npm-verktyg med `npx`.

## Kontrollerna – Tidrapporten

`npm run verify`, och `npm run test:e2e` om något syns i appen eller bygget ändras. Issuets
**Testplan** är dess Verifiering när issuet saknar en egen rubrik för det. Hooken kör
`npm run verify` före push. Når en molnsession inte Playwrights nedladdning: kör e2e med
`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium`.

## Granska – Tidrapporten

Före granskarens runda: `/simplify` – mindre kod som gör samma jobb. Granskaren är agenten
**`granskare`**. `/code-review` körs också när diffen rör data, regler, inloggning eller
beräkningar. Kör kontrollerna en sista gång efter sista rundan.

## PR och bevakning – Tidrapporten

- PR-texten följer `.github/pull_request_template.md` och säger också avvikelser från issuet.
- Rött CI → agenten **`ci-doktor`**.
- Merga bara när **Plan godkänd** också är grön.

## Konflikter – Tidrapporten

- **Ingen rebase och ingen force-push** för att lösa en konflikt – merga in `origin/main`.
- **Version och `CHANGELOG.md`:** har `main` redan höjt sedan senaste release, flyttas PR:ens rad
  under `main`s rubrik. Ändra versionen med `npm version`, inte för hand i `package-lock.json`.
  Två rubriker med samma version får aldrig finnas.

## Anti-mönster (utöver stommens)

- Issue och PR samtidigt för en större ändring.
- Merga när **Plan godkänd** är röd.
- Två rubriker med samma version i `CHANGELOG.md`.
- En ny tredjeparts-action utan Mats ok och en rad i PR:en.
