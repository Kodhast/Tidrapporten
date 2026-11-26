# 0020. Tömning av kontot raderar allt, också ändringsloggen

- **Status:** Beslutat
- **Datum:** 2026-11-26

## Sammanhang

Ändringsloggen sparas för alltid (0008, 0012), och reglerna låter ingen klient radera något i den.
Ägaren vill kunna tömma hela sin data och börja om från tomt, flera gånger, till exempel för att
prova startflödet (issue 64). Han valde att det görs i appen och inte med ett skript, och att
ändringsloggen ska följa med när han tömmer (2026-11-26, issue 26). Backup före gäller fortfarande
(0009).

Vägt: att behålla loggen vid tömning (då är kontot inte tomt, och startflödet går inte att prova
från början), ett skript med tjänstekontot (ägaren ville ha det i appen) och att radera
Firebase-användaren (onödigt: inloggningen går genom Access och ger samma uid igen, 0017).

## Beslut

- **Töm kontot** i Inställningar raderar allt under `users/{uid}`, ändringsloggen inräknad. Det är
  det enda som får radera ändringsloggen.
- Raderingen görs av en callable Cloud Function med Admin SDK (`recursiveDelete`), bara för den
  inloggades eget uid. Reglerna ändras inte: ingen klient får radera i loggen.
- **Backup före:** appen laddar ner JSON-exporten först, och funktionen anropas bara när
  nedladdningen är klar. Ägaren bekräftar i en dialog genom att skriva `TÖM`. I drift finns dessutom
  Firestores dagliga backup och PITR (0018).
- Firebase-användaren och inloggningen ligger kvar. Efter tömningen är appen som vid första start,
  och det går att tömma igen hur många gånger som helst.
- Driftloggen får `{ event: 'tomning', uid, dokument: <antal> }`, inga data.
- Att radera **ett uppdrag** (issue 26) behåller ändringsloggen; undantaget gäller bara hela kontot.

## Följder

- Regeln "Ändringsloggen raderas aldrig" i `CLAUDE.md`, 0008 och 0012 får tillägget "utom när
  ägaren tömmer hela kontot (0020)".
- Det som tömts går bara att få tillbaka från exporten (Återställ från fil) eller i drift från
  Firestores backup.
- Funktionen och dialogen byggs i issue 26, med prov i emulatorn för att allt försvinner och att
  någon annans uid inte går att tömma.
