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

Agenten `granskare` kontrollerar höjningen.

## Hur en release går till

- **Kör bara när ägaren ber om en release.** Main går till testmiljön; bara en release går till
  drift, med tagg och version.
- **Ingen fråga om versionsnumret.** Releasen använder versionen som PR:erna redan satt på `main`.
- **Starta först när CI på `main` är grönt** för HEAD.
- **Taggar pushas aldrig från en Claude-session.** Release-workflowen skapar taggen själv.

Stegen, workflowen och hur en release backas skrivs här när driften finns (issue 12).
