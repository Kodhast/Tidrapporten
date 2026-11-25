# 0006. Inloggning och hosting på Cloudflare

- **Status:** Beslutat
- **Datum:** 2026-11-25

## Sammanhang

Kodhästs appar på `*.kodhast.com` loggar in med Google genom Cloudflare Access (team `kodhast`),
och Husjakt kontrollerar redan Accessens JWT i en Worker. (Först stod det här att Husjakt byter
JWT:n mot en Firebase custom token; Husjakt har ingen Firebase, så den delen är ny här.) Intervjun
(issue 4) sa en separat Worker på `/inloggning`. När planen granskades 2026-11-25 ändrade ägaren
det till en Pages Function, eftersom appen ändå ligger på Pages.

## Beslut

- **Hosting:** Cloudflare Pages på `tid.kodhast.com`, testmiljön på `test.tid.kodhast.com`.
- **Inloggning:** Access står bara framför `/inloggning`. Där kontrollerar en **Pages Function**
  (inte en separat Worker) Access-JWT:n och skapar en Firebase custom token, som klienten loggar in
  med via `signInWithCustomToken`.
- **Nyckeln** som signerar ligger i ett eget tjänstekonto utan andra roller.

## Följder

- Att signera en custom token med WebCrypto provades mot testprojektet i issue 11 och fungerar;
  flödet i detalj står i beslut 0017.
- Allt annat än `/inloggning` är statiska filer; Firestore-reglerna, inte Access, skyddar datan.
