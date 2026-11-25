# 0003. Domänmodell

- **Status:** Beslutat
- **Datum:** 2026-11-24

## Sammanhang

En konsult kan rapportera samma tid till flera led – arbetsgivare, mellanhand och kund – och
kedjan skiljer sig mellan parallella uppdrag. Varje led har sitt eget system och sina egna koder.
Underlag från issue 2. Själva datamodellen i Firestore bestäms i en egen ADR (issue 31).

## Beslut

- **Uppdrag** är det faktiska jobbet, med egna interna tidkoder och en norm (omfattning i
  procent). Varje tidkod har en flagga för debiterbar ja/nej. Appen har inga timpriser.
- **Rapportkedja:** ett uppdrag har 1..n mottagare. Varje mottagare har egen veckorapport och egna
  koder, och de interna koderna mappas mot mottagarens. Samma veckosumma går till alla, men
  rapporterna sparas per mottagare.
- **Tidpost** är ett intervall (start, slut, tidkod), skapat med timer och rättat för hand. Pauser
  är luckor mellan intervallen.
- **Flex:** per uppdrag och totalt, mot normen, med svenska helgdagar bortraknade och ett ingående
  saldo per uppdrag.
- **Frånvaro och intern tid** är konfigurerbara listor. Från start: semester, sjukdom,
  tjänstledighet, komptid (uttag ur flex), utbildning, bänktid och interna möten (arbetad tid).
- **Låsning:** en inskickad vecka låses som en ögonblicksbild. Den kan låsas upp, men varje
  ändring loggas med tid och skäl.

## Följder

- Mappningen mellan interna koder och mottagarens koder är en egen del av modellen.
- Ändringsloggen är ett krav från start, inte en senare funktion.
