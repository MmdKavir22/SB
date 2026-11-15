# SkyBlock Flip Scanner (static)

A 100% static Hypixel SkyBlock flip scanner: HTML, CSS, vanilla JS and Chart.js. No backend, no Python, no Node at runtime. It runs from GitHub Pages and talks directly to Hypixel's public API from your browser.

## Deploy to GitHub Pages (Windows friendly)
1. Create a GitHub repo named `SkyBlockFlipScanner` and push this folder to the `main` branch (GitHub Desktop works, or `git init`, `git add .`, `git commit`, `git remote add origin ...`, `git push -u origin main`).
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` runs the tests and publishes. Your site: `https://USERNAME.github.io/SkyBlockFlipScanner/`.

Local preview: opening `index.html` by double-click will fail (ES modules need http). Use any static server, e.g. `python -m http.server` (only for local preview) or the VS Code Live Server extension.

## Tests
`npm test` (Node 20+, no dependencies). Tests use mocked responses; they cover profit/ROI, Bazaar and AH fees, stale/missing/invalid data, duplicates, Bits math, simulator limits, and API failure/retry. The UI itself has no automated tests.

## Data sources and limitations
- **Bazaar** `api.hypixel.net/v2/skyblock/bazaar` and **Auctions** `.../auctions`: public, keyless. Whether the browser can read them depends on Hypixel's CORS headers, which I could not verify from the build environment (no network). If requests are blocked, the app shows "Network/CORS error" per source and does not invent data. No private API key is ever used or needed.
- **Auction House** downloads all pages (a large download); it is off by default (Settings). Item NBT (enchants, attributes, exact reforge) is not decoded, so comparisons group by name, tier, stars and pet level, plus enchanted-book lore. Reforge prefixes are stripped using a built-in list that may miss new reforges. Every AH row is labelled low/medium confidence. Treat as leads, verify in-game.
- **Bits**: skyblock.finance has no documented public API and its page is not safely scrapable from a static site, so it is not integrated. The Bits scanner uses your editable list (Settings) with Bazaar sale prices. The three seed entries (Booster Cookie 4800, Kismet Feather 1350, Hyper Catalyst 300 Bits) are from memory: verify them. Bits ROI means coins earned per Bit spent.
- Hypixel API data is itself cached for about a minute; the app labels data as live only when it was just fetched, cached when reused from its own cache, stale when older than your threshold.

## Fee assumptions (all editable in Settings, verify on wiki.hypixel.net)
Bazaar sell tax 1.25%. Auction House listing fee 1% (<10M), 2% (10M to 100M), 2.5% (>100M) plus a 1% claim fee capped at 1M. These are defaults, not guarantees; they change with updates and upgrades.

## Browser storage
Settings and market history live in LocalStorage of the current browser. They are not synced across devices and vanish if site data is cleared. History only contains scans made while the page was open, and only the top rows per scan.

## Structure
`index.html`, `assets/css/style.css`, `assets/js/{app,api,bazaar,auction,bits,calculator,simulator,storage,charts,settings}.js`, `tests/`, `.github/workflows/deploy.yml`.
