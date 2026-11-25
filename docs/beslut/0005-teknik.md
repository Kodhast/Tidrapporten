# 0005. Teknik: React, Firebase och PWA

- **Status:** Beslutat
- **Datum:** 2026-11-25

## Sammanhang

Timern ska synkas direkt mellan telefon och dator, påminnelser ska komma som push-notiser, och
appen ska vara lätt att underhålla av Claude. Kodhästs andra webbappar har olika stackar, och en
gemensam standard behövdes. Underlag från issue 4.

## Beslut

- **Frontend:** React 19, Vite och TypeScript, byggt som en PWA. React är ny standard för alla
  Kodhästs webbappar. Komponenterna kommer från repot Kodhast/web-ui-react, som bygger på React
  Aria och web-ui:s `kh.css` och tal. Varken MUI eller shadcn.
- **Backend:** Firebase på Blaze-planen – Firestore för lagring och realtidssynk, Cloud Messaging
  för push och schemalagda Cloud Functions för påminnelser och backup.
- **Offline:** bara timern (start, stopp och intervall). Veckorapporter och inställningar kräver
  nät.
- **Tid:** sparas i UTC och visas i Europe/Stockholm. Svenska helgdagar räknas fram i koden med
  regler, utan externt API. Egna lediga dagar läggs till för hand.

## Följder

- Beräkningarna av tid, helgdagar och flex är ren TypeScript och testas med Vitest.
- web-ui-react måste finnas innan GUI-issuena byggs (issue 13).
- Firestores offline-cache täcker timern; resten av appen visar när nätet saknas.
