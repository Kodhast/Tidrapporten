# 0010. Kostnadstak

- **Status:** Beslutat
- **Datum:** 2026-11-25

## Sammanhang

Firebase Blaze-planen debiteras efter användning, och en bugg (till exempel en loop som skriver
till Firestore) kan kosta mycket innan någon märker det. Intervjun (issue 7) sa budgetlarm på 50,
90 och 100 procent och att betalningen stoppas automatiskt vid 100 procent. När planen granskades
2026-11-25 ändrade ägaren det: ett stopp i drift gör att appen slutar fungera, och det är värre än
en kostnad som syns i tid.

## Beslut

- **Budget:** 100 kr i månaden totalt för test- och driftprojektet tillsammans.
- **Testprojektet:** betalningen stoppas automatiskt vid 100 procent.
- **Driftprojektet:** inget automatiskt stopp. Larm vid 50, 90, 100 och 150 procent, och en
  varning som banderoll i appen (en funktion skriver ett dokument som appen läser).

## Följder

- Eftersom budgeten är gemensam kan en kostnad i drift stoppa testprojektet.
- Larmen, stoppet och banderollen byggs i issue 28.
