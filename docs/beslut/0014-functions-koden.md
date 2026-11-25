# 0014. Var Functions-koden bor

- **Status:** Beslutat
- **Datum:** 2026-11-25, katalogen flyttad 2026-11-25 (beslut 0017)

## Sammanhang

Cloud Functions kommer i issue 21 (backup), 22 (påminnelser) och 28 (budget), och de behöver
samma beräkningar som appen i `src/domain/`. När en funktion driftsätts laddar Firebase bara upp
katalogen som `source` i `firebase.json` pekar på och installerar dess `package.json` i molnet, så en import av `../src/`
fungerar inte rakt av. Alternativen var npm workspaces med `src/domain/` som eget paket, ett
publicerat paket, eller att bunta funktionerna före uppladdningen.

## Beslut

- Funktionerna ligger i `firebase-functions/src/` och importerar `src/domain/` med relativa sökvägar.
- `npm run build:functions` buntar dem med Vite (redan ett beroende) till `firebase-functions/lib/`.
  Koden från `src/domain/` kommer med i bunten; npm-paketen står i `firebase-functions/package.json` och
  installeras i molnet.
- `firebase.json` kör bygget före varje driftsättning av funktionerna.
- Ingen workspace och inget eget paket.

## Följder

- `src/domain/` får inte använda webbläsarens API:er, eftersom samma kod körs i Node.
- Funktionernas egna npm-paket installeras i `firebase-functions/` och följer inte med rotens
  `package-lock.json`.
- Typkontrollen täcker `firebase-functions/src/` via `tsconfig.functions.json`.
- Kräver Blaze-planen när den första funktionen driftsätts; i dag är ingen driftsatt.

## Ändring 2026-11-25

Katalogen hette först `functions/`. Cloudflare Pages läser sina funktioner ur `functions/` i
roten, så Firebase-koden flyttades till `firebase-functions/` när inloggningen byggdes (issue 11,
beslut 0017). Inget annat i beslutet ändrades.
