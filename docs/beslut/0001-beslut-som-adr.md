# 0001. Beslut skrivs som ADR

- **Status:** Beslutat
- **Datum:** 2026-11-25

## Sammanhang

Claude skriver koden och börjar varje session utan minne av tidigare samtal. Intervjun som
bestämde appen (issue 1–7) står i stängda issues, och besluten är utspridda i kommentarer. Ett
beslut som bara finns i en chatt eller ett stängt issue finns inte för nästa session.

## Beslut

Varje arkitekturbeslut får en egen fil i `docs/beslut/` (architecture decision record, enligt
Michael Nygards format): sammanhang, beslut, följder. Ett beslut skrivs inte om; det ersätts av ett
nytt. Intervjuns beslut sammanfattas i 0002–0010, så att ingen behöver leta i issuena.

## Följder

- Claude läser bara de beslut som rör uppgiften.
- `CLAUDE.md` kan hållas kort och peka hit.
- Ägaren tar besluten; Claude föreslår dem (`/adr`).
- Repot är publikt, så en ADR innehåller aldrig kundnamn, uppdrag, priser eller personuppgifter.
