# 0009. Repo, CI och miljöer

- **Status:** Beslutat
- **Datum:** 2026-11-25

## Sammanhang

Ändringar ska byggas, testas och levereras förutsägbart, med samma arbetsflöde och CI-budget som
ägarens andra repon. Underlag från issue 7.

## Beslut

- **Två miljöer:** test och drift har var sitt Firebase-projekt. Varje PR får en förhandsvisning i
  Cloudflare mot testprojektet.
- **Deploy:** `main` går till testmiljön. Drift bara vid en release med tagg och version, när
  ägaren ber om det.
- **Repot:** `main` är skyddad och kräver PR och grönt CI. Secret scanning, push protection,
  CodeQL och Dependabot är påslagna. Mallar för issues och PR:er. Bara squash-merge.
- **CI-budget** som i de andra repona: en PR kostar högst ett par Actions-minuter. Bara actions
  som organisationen tillåter.
- **Claude Code och riktig data:** Claude får läsa och rätta riktig data med en nyckel för ett eget
  tjänstekonto som bara har en Firestore-roll, skilt från kontot som skapar custom tokens. Nyckeln
  ligger som hemlighet i Claude Code-miljön. Backup före varje rättning, varje rättning i
  ändringsloggen, och ägarens ok innan något skrivs i drift.

## Följder

- CI har två jobb, `verify` och `e2e`, plus plan-kontrollen. Rulesetet på `main` kräver alla tre.
- Förhandsvisning och release byggs i issue 12; Firebase-projekten i issue 10.
