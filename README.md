# SkyBlock Flip Scanner (static)

A 100% static Hypixel SkyBlock flip scanner: HTML, CSS and vanilla JS. No backend, no Python/Node at runtime. It runs on GitHub Pages and reads Hypixel's public API from the browser.

## Pages
Dashboard (status + guide on how profit is calculated), Best Opportunities, Bazaar (choose Buy instant / Buy order and Sell instant / Sell offer), Most traded, Auction House, Bits Shop, Settings, Admin.

## Deploy
1. Push to the `main` branch of your repo.
2. Repo **Settings → Pages → Source: GitHub Actions**. The workflow runs the tests and publishes `index.html`, `assets/` and `config/`.
3. Local preview needs a static server (ES modules do not work from `file://`), e.g. VS Code Live Server.

## Admin panel (hide/show items, edit the Bits list)
Open **Admin**, paste a GitHub token that can write to the repo (classic: `repo`; fine-grained: Contents read and write), check owner/repo/branch, log in. Toggle items, edit Bits items, then **Publish to GitHub**: this commits `config/items.json`. Visitors load that file from raw.githubusercontent.com (falling back to the copy on the site), so changes reach them after a few minutes (CDN cache plus a redeploy).
Security: the token stays in that browser tab (sessionStorage) and is only sent to api.github.com. The real protection is GitHub itself: only a token with push access can change the file. The UI is not a security boundary.

## Data and limits
- Bazaar and Auctions: public Hypixel endpoints, no key. Whether browsers may read them depends on Hypixel's CORS headers, which I could not test from the build environment. On failure each source shows its error and no data is invented.
- Hourly volume / Coins per hour are estimates (weekly moving volume ÷ 168). "Most traded" uses the same weekly figures.
- Auction House scan is large and off by default (Settings). It compares by name, tier, stars and pet level only; enchants, attributes and reforge are not compared.
- Bits Shop: Bazaar items are priced from the Bazaar; most Bits items are Auction House items and are priced from the median of the 3 lowest BINs (needs the Auction scan). Items marked (?) have a Bits cost not confirmed by several sources: verify in game. skyblock.finance / skyblock.bz have no documented public API, so they are not called.
- Item images use a community renderer URL template (admin-editable, `{id}` placeholder). It is unverified; when an image fails a letter is shown.

## Fees (Settings, verify in game)
Bazaar tax default 1.25% (it can change, e.g. with mayor perks). AH: listing fee 1% (<10M), 2% (10M to 100M), 2.5% (>100M) plus 1% claim fee capped at 1M.

## Tests
`npm test` (Node 20+, mocked responses): profit/ROI, fees, stale/missing/invalid data, duplicates, all four Bazaar strategies, Bits (Bazaar and AH sources), filters, sorting, popular items, config loading, admin login/publish (mocked GitHub API), translations. The UI itself has no automated tests.
