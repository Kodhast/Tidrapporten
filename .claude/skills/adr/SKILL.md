---
name: adr
description: Skriver ett nytt beslut (ADR) i docs/beslut/ för Tidrapporten. Använd när ett tekniskt vägval tas, ändras eller ifrågasätts.
---

# Nytt beslut (ADR)

Ett beslut per fil i `docs/beslut/`, numrerat i ordning: `NNNN-kort-namn.md`. Ett taget beslut
skrivs aldrig om; ett nytt beslut ersätter det gamla, och det gamla får status `Ersatt av NNNN`
(bara den raden ändras).

Följ mallen i `docs/beslut/0000-mall.md`. Håll den kort: sammanhanget som gjorde beslutet
nödvändigt, beslutet i en mening eller två, och följderna, även de dåliga.

Ägaren tar besluten, och en ADR blir beslutad när ägaren mergar PR:en. Skriv den därför som
`Beslutat` med dagens datum, i en egen PR eller i PR:en för ändringen den gäller. Säg i PR-texten
vilka delar ägaren inte redan sagt ja till, så att de granskas. Ett förslag som ska diskuteras
först utan PR får status `Föreslaget`.

Repot är publikt: inga kundnamn, uppdrag, priser eller personuppgifter, inte heller som exempel.

Lägg till raden i listan i `docs/beslut/README.md`.
