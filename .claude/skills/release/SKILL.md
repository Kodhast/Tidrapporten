---
name: release
description: 'Versioner och releaser i Tidrapporten – regeln för versionshöjning i funktions-PR:en (semver i package.json och en rad i CHANGELOG.md) och vad en release till drift är. Kör en release bara när ägaren uttryckligen ber om det. Trigger-ord: release, släpp, ny version, publicera, driftsätt, versionshöjning, semver, CHANGELOG.'
---

# Versioner och release

Anpassad från `release` i VeckansMat. Varför: [beslut 0009](../../../docs/beslut/0009-repo-ci-och-miljoer.md).

## Versionshöjning i funktions-PR:en

Varje PR som ändrar appen höjer versionen i samma ändring, så att ingen release-PR behövs.

| Ändring                                                                  | Höjning                |
| ------------------------------------------------------------------------ | ---------------------- |
| Brytande, borttagen funktion, eller datamigrering som inte går att backa | major (minor före 1.0) |
| Ny funktion – ny vy, ny förmåga                                          | minor                  |
| Fix, beroenden, refaktorering som syns eller kan synas                   | patch                  |

- Ändra `version` i `package.json` och `package-lock.json` med
  `npm version <major|minor|patch> --no-git-tag-version`.
- Skriv raden i `CHANGELOG.md` under den nya versionen: det användaren märker, på vardaglig
  svenska, med `(#NN)`.
- Skriv versionen i PR-beskrivningen.
- Ren dokument-, test-, CI- eller Claude-verktygsändring höjer inte.
- Är versionen redan höjd sedan senaste release, höj bara om denna PR är allvarligare, och skriv
  då om den befintliga rubriken i `CHANGELOG.md`.
- Räkna alltid mot aktuell `origin/main`, inte mot `main` som den var när grenen skapades.

Agenten `tidrapporten-granskare` kontrollerar höjningen.

## Hur en release går till

- **Kör bara när ägaren ber om en release.** Main går till testmiljön; bara en release går till
  drift, med tagg och version.
- **Ingen fråga om versionsnumret.** Releasen använder versionen som PR:erna redan satt på `main`.
- **Starta först när CI på `main` är grönt** för HEAD.
- **Taggar pushas aldrig från en Claude-session.** Release-workflowen skapar taggen själv.

### Stegen

1. Kontrollera att `version` i `package.json` på `main` har en rubrik i `CHANGELOG.md` och att
   taggen inte finns.
2. Actions → **Release** → Run workflow på `main`, först med **Provkör** ikryssad (förval). Den
   bygger med `--mode drift`, provar Firestore-reglerna mot driftprojektet (`--dry-run`) och
   rör inget.
3. Grönt → kör igen utan Provkör. Workflowen driftsätter regler och index till driftprojektet,
   publicerar Pages på produktionsgrenen `produktion` (`tid.kodhast.com`), skapar taggen
   `vX.Y.Z` och en GitHub Release med raderna ur `CHANGELOG.md`.
4. Svara med länken till releasen och `https://tid.kodhast.com`.

Jobbet kör i GitHub-miljön `drift`, som bara får köras från `main` och har driftprojektets
nyckel (`FIREBASE_DEPLOY_DRIFT`). Uppsättningen: [docs/drift.md](../../../docs/drift.md).

### Backa en release

- **Pages:** Cloudflare → Workers & Pages → tidrapporten → Deployments, välj den förra
  produktionspubliceringen → **Rollback**. Påverkar inte Firestore.
- **Regler och index:** en ny PR som återställer `firestore.rules` eller
  `firestore.indexes.json`, och en ny release (patch).
- Taggen och GitHub Release står kvar; nästa release får nästa version.
