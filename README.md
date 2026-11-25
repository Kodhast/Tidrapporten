# Tidrapporten

Tidrapportering för en IT-konsult: faktisk tid med timer, veckorapporter per mottagare och flex.
En PWA byggd med React, Vite och TypeScript, med Firebase och Cloudflare Pages.

- Planen för första versionen: issue 8
- Varför den är byggd som den är: [`docs/beslut/`](docs/beslut/README.md)
- Hur Claude styrs i repot: [`CLAUDE.md`](CLAUDE.md) och [`.claude/README.md`](.claude/README.md)
- Versionshistorik: [`CHANGELOG.md`](CHANGELOG.md)

## Komma igång

Kräver Node 22.13 eller senare (CI kör Node 24, se `.nvmrc`).

    npm ci
    npm run dev        # http://localhost:5173
    npm run verify     # typkontroll, lint och enhetstester med täckning
    npm run test:e2e   # Playwright (första gången: npx playwright install chromium)
