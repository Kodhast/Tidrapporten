# Versionshistorik

Det användaren märker, en rad per ändring. Versionen höjs i PR:en som gör ändringen (se
`.claude/skills/release/SKILL.md`).

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
