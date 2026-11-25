# 0011. Claude Code och arbetsflödet

- **Status:** Beslutat
- **Datum:** 2026-11-25

## Sammanhang

Claude skriver koden, mest från telefonen, och ägaren granskar. Ägarens andra repon har ett
gemensamt arbetsflöde i pluginen `android@claude-android`, och VeckansMat är det webbrepo som
liknar Tidrapporten mest. Underlag från issue 6 (punkt 3), issue 8 och issue 9.

## Beslut

- **Arbetsflödets stomme** kommer från pluginen: `android:arbetsflode` (issue till PR, granskning i
  rundor, en push, bevakning) och `android:arbetsregler` (när en plan krävs). Repots skills
  `refine-issue` och `implement-issue` lägger Tidrapportens delar ovanpå.
- **Plan före kod för större ändringar:** issue med plan och ägarens ok (`plan-godkänd` eller
  "kör"). Små ändringar går direkt till PR med raden `Liten ändring: <varför>`. Hooken
  `plan-approved.mjs` och CI-kontrollen Plan godkänd spärrar.
- **Kontroll före push:** hooken `verify-before-push.mjs` kör `npm run verify`.
- **Officiella skills först:** Vercels `react-best-practices` som oförändrad kopia; egna skills
  bara där inget finns. Pluginen `typescript-lsp` ger typinformation, och kopplingen Context7
  aktuell dokumentation. När varje del kommer in står i issue 8.
- **Agenter:** `granskare` (Opus) före varje PR och `ci-doktor` (Sonnet) vid rött CI.

## Följder

- Uppsättningen och tabellerna står i `.claude/README.md`, och ett prov håller dem sanna.
- Firebase-kopplingen (MCP) används inte: den skriver med ägarens egen behörighet utan logg, i
  strid med 0009.
