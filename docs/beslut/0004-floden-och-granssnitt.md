# 0004. Flöden och gränssnitt

- **Status:** Beslutat
- **Datum:** 2026-11-25

## Sammanhang

Appen ska användas löpande under dagen och en gång i veckan för rapporterna, på både telefon och
dator. Underlag från issue 3.

## Beslut

- **Telefon och dator** är lika viktiga, med samma funktioner. Timern synkas direkt mellan dem.
- **Glömd timer och luckor:** en timer över cirka 10 timmar frågar när arbetet slutade. Luckor
  syns och kan fyllas eller markeras som paus. Överlappande intervall varnar men förbjuds inte.
  Appen känner inte av inaktivitet.
- **Veckoförslag** per uppdrag och mottagare: fyllt mot normen, eller faktisk tid avrundad till
  närmaste kvart. Avvikelsen går till flexen.
- **Påminnelser** som push-notiser med inställbara tider: ingen timer igång på morgonen, timer igång
  sent, dag utan tid, veckorapport inte skickad på fredagen, flex över en gräns.
- **Överföring** till mottagarens system görs för hand från en avskriftsvy per mottagare. När
  veckan markeras som skickad låses den. Ingen export eller integration.
- **Startsidan** visar timern, dagens intervall och luckor, veckan mot normen per uppdrag, och små
  statusikoner för oskickade rapporter, debiteringsgrad och flex.
- **Underlag** för en period (lägre prioritet): intervall per dag, faktisk mot rapporterad tid per
  mottagare och ändringsloggen, på skärmen och som PDF via webbläsarens utskrift.

## Följder

- Synk mellan enheter kräver en server med realtidsdata (0005).
- Vyerna mockas innan de byggs (issue 16).
