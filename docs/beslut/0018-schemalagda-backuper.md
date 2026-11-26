# 0018. Daglig backup med Firestores schemalagda backuper

- **Status:** Beslutat
- **Datum:** 2026-11-26

## Sammanhang

Beslut 0007 säger att Firestore ska exporteras till Cloud Storage varje dag, med 30 dagars
historik. Issue 21 planerade det som en schemalagd Cloud Function som anropar export-API:t, en
bucket med en livscykelregel, ett eget tjänstekonto med exportrollen och deployrätt för
funktionen. Tidrapporten har en användare och några megabyte data.

Firestore har numera egna schemalagda backuper: en per dag, med en lagringstid på upp till 14
veckor, som Google tar och gallrar själv. En backup återställs till en ny databas i samma
projekt. [Googles beskrivning](https://firebase.google.com/docs/firestore/backups).

## Beslut

Beslutet ersätter punkten om den schemalagda exporten i beslut 0007.

- **Firestores schemalagda backuper** i både test och drift: dagligen, med 30 dagars
  lagringstid. Det sätts upp en gång med `scripts/backup.sh` och kräver ingen kod, ingen bucket,
  ingen funktion och inget eget tjänstekonto.
- **Point-in-time recovery** (7 dagar) slås på i drift som komplement. Med det kan ett misstag
  återställas till en minut, inte bara till senaste natten.
- **JSON-exporten i appen** (issue 21, PR 55) är kvar. Den är det enda som ger filer utanför
  Google.
- **Återställningen** provas i testprojektet, och stegen står i `docs/drift.md`.

## Följder

- Ingen kod att underhålla och inga deployroller att lägga till. Kostnaden för backuplagringen
  och PITR är några öre i månaden vid Tidrapportens datamängd. Det är räknat på storleken och
  inte mätt.
- En backup ligger i samma projekt som databasen. Raderas projektet försvinner backuperna, och
  det hade en bucket i samma projekt också gjort. JSON-exporten är skyddet mot det.
- En backup kan inte importeras i ett annat projekt, till exempel från drift till test. Behövs
  det görs en engångsexport med `gcloud firestore export` vid tillfället.
- Klockslaget för backupen går inte att välja; Google tar den någon gång under dygnet.
- Det finns inget larm när en backup misslyckas. `docs/drift.md` har kommandot som listar de
  senaste backuperna, och listan kontrolleras vid varje release.
