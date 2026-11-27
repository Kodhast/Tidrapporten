---
name: db-access
description: 'Läsa och rätta riktig data i Tidrapportens Firestore från en Claude-session med tools/db (issue 27). Ladda när Mats frågar vad som finns i databasen, vill felsöka data, ber om en rättning i test eller drift, eller när TIDRAPPORTEN_CLAUDE_KEY nämns. Trigger-ord: databasen, riktig data, drift, vad finns, hur många, felsök data, rätta data, rättning, stats, query, export, fix, tools/db, tjänstekonto, TIDRAPPORTEN_CLAUDE_KEY.'
---

# Riktig data

Claude läser och rättar riktig data med `tools/db/db.ts` och ett eget tjänstekonto
(`tidrapporten-claude`, bara Cloud Datastore User) vars nyckel ligger som `TIDRAPPORTEN_CLAUDE_KEY`
i Claude-miljön. Besluten: [0009](../../../docs/beslut/0009-repo-ci-och-miljoer.md) och
[0012](../../../docs/beslut/0012-datamodell.md) (ändringsloggen). Hur kontot skapas:
[docs/drift.md](../../../docs/drift.md) → Claudes tjänstekonto.

## Reglerna

- **Läs bara med Mats ok**, per fråga. Riktig data är hans kunder, uppdrag och tider.
- **Skriv aldrig utan att Mats bett om just den ändringen.** Visa förslaget (kör `fix` utan
  `--skriv`) och vänta på hans ja. I drift krävs dessutom `--drift`.
- **Riktig data stannar i sessionen.** Aldrig i repot, ett issue, en PR, en commit, projektminnet
  eller ett svar mer än vad frågan kräver. Svara med antal och id:n när det räcker.
- **Frågor om innehåll går till agenten `tidrapporten-db-inspektor`**, så att dokumenten stannar
  i agenten och bara svaret når huvudsessionen. Agenten skriver aldrig.
- Be aldrig Mats klistra in nyckeln i chatten. Saknas den: hänvisa till docs/drift.md.

## Kommandon

    node tools/db/db.ts stats [--miljo test|drift]           # användare och antal per samling
    node tools/db/db.ts query <samling> [--where fält==värde] [--limit n]
    node tools/db/db.ts export [--ut fil]                    # appens exportformat
    node tools/db/db.ts fix <ändring.json> --skal "…" [--skriv] [--drift] [--backup katalog]

`--miljo` är `test` som standard. `--uid` behövs bara om projektet har flera användare. Med
`FIRESTORE_EMULATOR_HOST` satt går allt mot emulatorn och nyckeln läses inte.

## En rättning

1. Läs det som ska rättas (`query`) och skriv ändringsfilen utanför repot, till exempel i
   scratchpad: `{ "path": "entries/<id>", "set": { …hela dokumentets nya data… } }` eller
   `{ "path": "…", "delete": true }`. Tider skrivs som i exporten: `{"$timestamp": "2026-11-16T07:00:00.000000000Z"}`.
   `changeLog` och `state/reminders` går inte att rätta.
2. Kör `fix` utan `--skriv` och visa Mats före och efter.
3. Efter hans ja: samma kommando med `--skriv` (och `--drift --miljo drift` i drift). Verktyget
   - tar en backup av hela användaren till `~/tidrapporten-backup/` (utanför repot) innan något skrivs,
   - skriver ändringen och en post i `changeLog` med `by: 'claude'`, skälet och veckan i samma
     transaktion, och vägrar om dokumentet ändrats under tiden,
   - pekar en rapports `lastChangeId` på posten, som när appen ändrar en låst vecka.
4. Säg vad som skrevs: sökväg, loggpostens id och var backupen ligger. Backupen kan läsas tillbaka
   med Återställ i appen eller `scripts/aterstall.mjs`.

Verktyget går förbi Firestore-reglerna. Att en rättning håller domänens regler (en låst vecka
ändras bara med en upplåsning, kvartar, flexen) är Claudes ansvar: läs ADR 0012 och skill
`tidsregler` innan du rättar tid eller rapporter.

## Prov

`test/db.spec.ts` (argument, nyckel, ändringsfil, vecka) och `test/emulator/db.emulator.ts`
(backup, loggpost, spärrar, export) – bara påhittad data.
