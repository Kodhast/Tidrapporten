# 0007. Säkerhet och integritet

- **Status:** Beslutat, backupen ersatt av 0018
- **Datum:** 2026-11-25

## Sammanhang

Appen innehåller uppgifter om kunder, uppdrag och arbetad tid, och repot är publikt. Underlag från
issue 5.

## Beslut

- **Publikt repo** med secret scanning och push protection påslagna. Tester och fixturer
  innehåller aldrig riktiga data eller kundnamn.
- **Firestore-regler:** bara ägaren, identifierad med sitt uid, läser och skriver sin data. En
  låst vecka ändras bara efter en upplåsning, som loggas med tid och skäl.
- **Backup:** en schemalagd export av Firestore till Cloud Storage varje dag med 30 dagars
  historik, och en knapp i appen som exporterar all egen data som JSON.
- **Hemligheter** bara i Cloudflare secrets, Firebase och GitHub Actions secrets, aldrig i repot.
  Firebase webbkonfiguration är inte hemlig och får ligga i koden.
- **Kryptering:** ingen extra; Googles standardkryptering och ägarreglerna räcker.
- **Lagringstid:** data sparas tills vidare. Användaren kan själv radera ett uppdrag eller hela
  kontot.

## Följder

- Reglerna testas i Firebase-emulatorn.
- Claude Code nekas läsa `.env*` och tjänstekontonas JSON (`.claude/settings.json`).
