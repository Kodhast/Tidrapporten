# Claude Code i Tidrapporten

Varför uppsättningen ser ut så här: [beslut 0011](../docs/beslut/0011-claude-code-och-arbetsflode.md).
Ett prov (`test/claude-config.spec.ts`) håller tabellerna nedan sanna mot katalogerna. När varje
skill, agent och koppling kommer in står i issue 8 under "Skills, agenter och kopplingar".

## Skills

| Skill                         | När                                            | Källa                                            |
| ----------------------------- | ---------------------------------------------- | ------------------------------------------------ |
| `refine-issue`                | Idé eller bugg till ett planerat issue         | Tidrapportens delar ovanpå `android:arbetsflode` |
| `implement-issue`             | Planerat issue till PR                         | Tidrapportens delar ovanpå `android:arbetsflode` |
| `release`                     | Versionshöjning i PR:en och release till drift | Egen, efter VeckansMat                           |
| `adr`                         | Nytt beslut i `docs/beslut/`                   | Egen, efter VeckansMat                           |
| `mockup`                      | Före ny eller ändrad GUI                       | Egen, efter VeckansMat                           |
| `tidsregler`                  | Beräkningar i `src/domain/`: tid, norm, flex   | Egen, som `fondmatematik` i Fonder               |
| `vercel-react-best-practices` | Skriva och granska React-kod                   | Vercel, oförändrad                               |
| `firebase-basics`             | Firebase CLI, projekt och `firebase use`       | Google, oförändrad                               |
| `firebase-auth-basics`        | Firebase Authentication och inloggning         | Google, oförändrad                               |
| `firebase-firestore`          | Firestore: datamodell, frågor, index och SDK   | Google, oförändrad                               |

Oförändrade kopior har `SOURCE.md` och `LICENSE.txt` i sin katalog och formateras inte av
Prettier (`.prettierignore`), så att de kan bytas mot en ny version rakt av.

Arbetsflödets stomme, när en plan krävs, modellvalet, webbreglerna och designreglerna kommer från
pluginen `android@claude-android`: `android:arbetsflode`, `android:arbetsregler`,
`android:ai-model-choice`, `android:webb`, `android:designregler` och `android:ux-granskning`.
Firestore-reglerna skrivs och granskas med pluginens `android:firestore-rules-creation` och
`android:firebase-security-rules-auditor`.

## Agenter

| Agent                    | När                                              | Modell | Källa                  |
| ------------------------ | ------------------------------------------------ | ------ | ---------------------- |
| `tidrapporten-granskare` | Före varje PR: diffen mot reglerna, ändrar inget | Opus   | Egen, efter VeckansMat |
| `tidrapporten-ci-doktor` | Rött CI: läser loggarna, föreslår en fix         | Sonnet | Egen, efter VeckansMat |

## Hooks

| Hook                     | Händelse              | Gör                                                             |
| ------------------------ | --------------------- | --------------------------------------------------------------- |
| `verify-before-push.mjs` | Före `git push`       | Kör `npm run verify`, stoppar pushen om den faller              |
| `format-file.mjs`        | Efter varje skrivning | Prettier på filen                                               |
| `plan-approved.mjs`      | Före en ny PR         | Stoppar PR:en utan godkänd plan eller `Liten ändring:`          |
| `session-start.mjs`      | Ny molnsession        | `typescript-language-server` för LSP:n och Playwrights Chromium |

## Plugins och kopplingar

- **`typescript-lsp`** (Anthropics officiella katalog, `.claude/settings.json`): typinformation,
  definitioner och referenser i stället för textsökning. Servern installeras av `session-start.mjs`
  i molnsessioner; lokalt: `npm install -g typescript-language-server typescript`.
- **Context7** (koppling i claude.ai, slås på av ägaren): aktuell dokumentation för React 19,
  Vite, Firebase och React Aria.

## Behörigheter

`deny` för `.env*`, `.dev.vars*`, tjänstekontonas JSON och `wrangler secret`; `ask` för
driftsättning med wrangler och firebase. Hemligheter ligger bara i Cloudflare, Firebase och GitHub
(beslut 0007).

## I projekttrådar

Projekttrådar startar ovanför repot och läser då inte `.claude/settings.json`.

- **Skills och agenter** hittar Claude Code själv i `.claude/`. Skillsen heter `<namn>`, eller
  `Tidrapporten:<namn>` när ett annat repo i tråden har en skill med samma namn (VeckansMat har
  `refine-issue`, `implement-issue`, `mockup`, `release` och `adr`). Agenter får aldrig prefix,
  så en agent som finns i flera repon heter `<repo>-<namn>` (regeln i claude-android, #37):
  `tidrapporten-granskare` och `tidrapporten-ci-doktor`. Med bara `granskare` laddades
  VeckansMats agent i en tråd med båda repona.
- **Hookarna** bärs av miljöns setup-skript (`scripts/repo-plugins.mjs` i `Kodhast/claude-android`),
  som gör varje repos hookar till en lokal plugin. Det gäller Tidrapporten utan ändring där.
- **Spärrarna är stängda:** `verify-before-push` och `plan-approved` har `onFailure: "block"`.
  Ett nätfel mot GitHub i `plan-approved` släpper igenom med en varning, eftersom CI-kontrollen
  Plan godkänd avgör.
- **Plugins** i `enabledPlugins` följer inte med till projekttrådar; där installeras
  `typescript-lsp` i miljön om den behövs.
