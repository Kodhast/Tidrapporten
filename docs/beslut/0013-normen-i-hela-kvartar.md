# 0013. Normen i hela kvartar

- **Status:** Beslutat
- **Datum:** 2026-11-25

## Sammanhang

ADR 0012 avrundar normen till hel minut. Ägaren rapporterar till sina mottagare i steg om 15
minuter. Vid en omfattning där normen inte blir hela kvartar, till exempel 80 % av 8 h = 6:24
eller 90 % = 7:12, blir en dag som fylls mot normen och en hel dags frånvaro 6:24 i
veckoförslaget, vilket inte går att föra in i mottagarens system. Ägaren valde 2026-11-25 att
normen avrundas till hel kvart.

## Beslut

Normen för en dag är `workdayMinutes × scopePercent / 100`, avrundad till närmaste kvart; en halv
kvart avrundas uppåt. Det ersätter avrundningen till hel minut i ADR 0012. Resten av 0012 gäller.

## Följder

- Ett förslag fyllt mot normen och en hel dags frånvaro blir alltid hela kvartar.
- Normen kan skilja upp till 7 minuter per dag från den exakta: 80 % ger 6:30 i stället för 6:24,
  så normen blir 30 minuter mer i veckan. Flexen räknas mot den avrundade normen.
- Faktisk tid räknas fortfarande i hela minuter; den avrundas bara i veckoförslaget.
