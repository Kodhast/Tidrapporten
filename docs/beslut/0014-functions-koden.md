# 0014. Var Functions-koden bor

- **Status:** Beslutat
- **Datum:** 2026-11-25

## Sammanhang

Cloud Functions kommer i issue 21 (backup), 22 (påminnelser) och 28 (budget), och de behöver
samma beräkningar som appen i `src/domain/`. När en funktion driftsätts laddar Firebase bara upp
katalogen `functions/` och installerar dess `package.json` i molnet, så en import av `../src/`
fungerar inte rakt av. Alternativen var npm workspaces med `src/domain/` som eget paket, ett
publicerat paket, eller att bunta funktionerna före uppladdningen.

## Beslut

- Funktionerna ligger i `functions/src/` och importerar `src/domain/` med relativa sökvägar.
- `npm run build:functions` buntar dem med Vite (redan ett beroende) till `functions/lib/`.
  Koden från `src/domain/` kommer med i bunten; npm-paketen står i `functions/package.json` och
  installeras i molnet.
- `firebase.json` kör bygget före varje driftsättning av funktionerna.
- Ingen workspace och inget eget paket.

## Följder

- `src/domain/` får inte använda webbläsarens API:er, eftersom samma kod körs i Node.
- Funktionernas egna npm-paket installeras i `functions/` och följer inte med rotens
  `package-lock.json`.
- Typkontrollen täcker `functions/src/` via `tsconfig.functions.json`.
- Kräver Blaze-planen när den första funktionen driftsätts; i dag är ingen driftsatt.
