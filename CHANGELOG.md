# Versionshistorik

Det användaren märker, en rad per ändring. Versionen höjs i PR:en som gör ändringen (se
`.claude/skills/release/SKILL.md`).

## 1.0.0

- Första versionen i drift på tid.kodhast.com: timer, dagvy, startsida med flex, veckorapporter
  per mottagare med avskrift och låsning, inställningar, export och återställning från fil, och
  genvägar på appikonen (#8).

## 0.13.0

- Genvägar på appikonen: en lång tryckning ger "Starta timern", "Stoppa timern" och "Idag".
  Starta och stoppa gör samma sak som huvudknappen, en gång (#59).

## 0.12.0

- Inställningar: "Återställ från fil" läser en export och lägger tillbaka det som saknas, med
  tider och ändringslogg som de var. Inget som finns skrivs över, och återställningen loggas
  (#57).

## 0.11.0

- Inställningar: "Exportera all data" laddar ner all din data som en JSON-fil, med uppdrag, tid,
  rapporter och ändringsloggen. Exporten läser från servern och kräver nätet (#21).

## 0.10.0

- Veckan: en ny flik med veckans faktiska tid, norm och flex och en rapport per mottagare i
  kedjans ordning. Rapporten föreslås fylld mot normen eller som faktisk tid per kvart, timmarna
  per kod justeras i kvartar, och avskriften visar mottagarens koder med timmar per dag.
  "Markera som skickad" låser rapporten som den ser ut då; den låses upp med ett skäl, och
  upplåsningen och den nya sändningen loggas (#20).

## 0.9.0

- Startsidan: arbetsdagens hjul 07–19 runt timern med dagens intervall i tidkodens färg, dagens
  tid mot normen, dagens intervall och luckor (nyast först, en lucka blir paus med ett tryck) och
  antalet veckorapporter som inte är skickade. Flexen syns i sidhuvudet och per uppdrag med
  veckan mot normen i ett ark. Appen har fått temat Kanel, ljust och mörkt (#19).

## 0.8.0

- Dagvyn: dagens intervall i tidsordning, med luckorna emellan. Ett intervall rättas, läggs till
  eller raderas i ett ark med start, slut, uppdrag och tidkod, och frånvaro registreras som ett
  intervall eller en hel dag. En lucka fylls eller markeras som paus, och överlappande intervall
  varnar. En rättning i en skickad vecka kräver ett skäl och skrivs i ändringsloggen. Dagvyn nås
  med "Dagens intervall" på startsidan (#29).

## 0.7.0

- Timern finns på startsidan: huvudknappen i flikraden startar och stoppar den, och kodchipet
  visar tidkoden och byter den medan timern går. Timern syns direkt på telefonen och datorn
  samtidigt och går att starta och stoppa utan nät. Har den gått över 10 timmar frågar appen när
  arbetet slutade. Utan nät går den inte att stoppa in i en skickad vecka (#18).

## 0.6.0

- Inställningarna finns: lägg till uppdrag med omfattning, arbetsdag, startdatum och ingående
  flexsaldo, tidkoder som är debiterbara eller inte, och mottagarna i kedjan med egna koder,
  kodmappning och förslagsläge. Frånvarotyperna finns från början och går att ändra, och
  aftnarna och egna lediga dagar ställs in under Frånvaro och lediga dagar. Inget går att spara
  utan nät. En flikrad längst ner leder mellan Idag och Inställningar (#17).

## 0.5.0

- Molnbudgeten bevakas: från 90 % av budgeten visar appen en varning överst, och från 100 %
  stängs betalningen av i testmiljön. Driften stoppas aldrig (#28).

## 0.4.1

- Appen ligger på Cloudflare: varje ändring går att prova på en egen förhandsadress, och
  testmiljön finns på test.tid.kodhast.com (#12).

## 0.4.0

- Inloggningen finns: knappen Logga in på startsidan loggar in med Google genom kodhast.com och
  visar vem du är inloggad som. Den fungerar på riktigt först när appen ligger på Cloudflare
  (#11, beslut 0017).

## 0.3.2

- Startsidan har en knapp från det nya komponentbiblioteket web-ui-react, ännu utan funktion
  (#13).

## 0.3.1

- Reglerna är strängare: bara inloggningen via kodhast.com släpps in, en ändring av saldo,
  startdatum, villkor, lediga dagar, frånvarotypens räkning eller mottagarens plats hamnar alltid
  i ändringsloggen, loggposten för en låst ändring visar före och efter, och tiden en rapport
  skickades är serverns (#39, beslut 0016).

## 0.3.0

- Datan ligger säkert i Firestore: bara du kommer åt den, en skickad veckorapport går bara att
  låsa upp med ett skäl, och varje ändring av en låst vecka hamnar i en ändringslogg som inte
  går att ändra (#15).

## 0.2.0

- Räknereglerna bakom appen: svensk tid och sommartid, helgdagar, norm, flex och förslag till
  veckorapporter. Inget syns ännu, vyerna kommer i senare versioner (#14).
- Normen per dag avrundas till närmaste kvart, så att en ifylld veckorapport alltid går i steg
  om 15 minuter, också vid till exempel 80 % omfattning (beslut 0013).

## 0.1.0

- Första skelettet: en tom startsida med appens namn som går att installera som app på telefonen
  (#9).
