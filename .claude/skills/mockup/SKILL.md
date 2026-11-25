---
name: mockup
description: 'Regeln "mockup före ny GUI" i Tidrapporten – ny vy, ny komponent eller tydligt ändrat utseende visas som en mockup (Design-canvas) och godkänns av ägaren innan någon kod skrivs. Ladda alltid innan något som syns byggs eller ändras. Trigger-ord: ny vy, ny sida, ny komponent, mockup, skiss, design, prototyp, hur ska det se ut, layout, ändra utseendet, ny knapp, nytt kort.'
---

# Mockup före ny GUI

Appen används mest på telefonen, ofta i förbifarten: starta timern, se dagen, skicka veckan. Det
avgörs av hur den ser ut och känns, inte av koden. Därför visas nytt utseende först som en mockup,
och koden skrivs efter ägarens ok.

## När

| Ändring                                                     | Mockup?                          |
| ----------------------------------------------------------- | -------------------------------- |
| Ny vy eller sida                                            | Ja                               |
| Ny delad komponent                                          | Ja                               |
| Tydligt ändrat utseende eller beteende (syns i en tumnagel) | Ja                               |
| Avstånd, ordval, ikonbyte, färg inom temat                  | Nej – skärmdumpen i PR:en räcker |
| Ren logik utan synlig ändring                               | Nej                              |

## Mallen

MVP:ns vyer mockas i issue 16. Den mockupen blir **mallen**: en Design-canvas med de
web-ui-delar (`kh-*`) appen använder, i ljust och mörkt tema, och vyernas tillstånd (laddar, tom,
fel, innehåll). Länken skrivs in här när den finns. Det byggda är facit; mallen uppdateras när en
ny komponent kommer till.

## Så bygger du en mockup

1. En Design-canvas (Artifact-typen "Design") per issue, eller nya ytor i issuets canvas.
2. Telefonyta 390 × 844; ljust tema först, mörkt när färgerna spelar roll.
3. Bygg av element ur mallen och web-ui (`@kodhast/web-ui`, android-ui:s utseende). Stora
   tryckytor och tydlig text.
4. Riktiga svenska texter och **påhittad** data: uppdrag som "Uppdrag A", tidkoder som
   "Utveckling", tider i svenskt format ("08:15–11:45", "7,5 h"). Aldrig riktiga kunder, uppdrag
   eller tider.
5. Finns elementet redan i appen → samma komponent och samma beteende; det är ingen designfråga.
   Bara för något helt nytt med en verklig öppen fråga: två ytor sida vid sida.
6. Det som saknas i web-ui-react och web-ui märks **"NY KOMPONENT"**.
7. Visa de tillstånd som betyder något: tom dag, timer igång, lucka, låst vecka, fel, lång text.

## Visa och vänta

- Gå igenom kompositionsreglerna D-1–D-9 i `android:designregler` och granska med
  `android:ux-granskning` (avsnittet Webbapparna); rätta 🔴 och nämn kvarvarande 🟡.
  Webbläsare och användare: `android:webb`.
- Säg vilken som är vyns primära handling (D-3) och fokuspunkt (D-4).
- Ge länken och en eller två meningar om vad som visas och vilka val som är öppna.
- **Skriv ingen kod innan ägaren godkänt.** Ändringar görs i samma canvas.
- Länken läggs i issuet under **Design**.

## I PR:en

Skärmdumpar av det byggda (Playwright, Pixel 7) bredvid mockup-länken. Avvikelser förklaras.
Mockupens HTML och CSS kopieras aldrig in i appen.
