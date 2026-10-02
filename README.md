# Bouquet Calculator

A Progressive Web App for florists: dictate a bouquet, get its sale price.
See [SPEC.md](SPEC.md) for requirements and decisions.

Current stage: **core app** (roadmap step 3): calculator with on-device Whisper, catalog, price table, settings.

## Development

```bash
npm install
npm run dev        # dev server
npm run build      # type-check and production build (includes the service worker)
npm run preview    # serve the production build on http://localhost:4173
npm run icons      # regenerate PNG icons from public/favicon.svg
npm test           # unit tests (phrase parsing, pricing)
npm run catalog    # rebuild src/data/catalog.json from data/catalog-draft.xlsx
```

## Data

- `data/catalog-draft.xlsx` — built-in catalog (names in he/ru/en, no prices). Edit it, then run `npm run catalog`.
- `private/my-prices.xlsx` — the price table used as **default prices** in the app
  (`npm run catalog` builds them into `src/data/catalog.json`, which is public).
  The folder itself (invoices, working copies) is git-ignored.

## Publishing

The app is published on GitHub Pages: **https://elenakishko.github.io/bouquet-calculator/**

Every push to `main` runs `.github/workflows/deploy.yml`: tests, build (with the
repository path as the base URL), deploy. Installed apps then show
"A new version is ready" and update when the florist taps it.

## Testing a build on a phone before publishing

Microphone access requires HTTPS. For a quick check of unpublished changes,
serve the build and open a temporary tunnel (free, no account; the link changes
every time and app data is stored per address):

```bash
npm run build && npm run preview -- --port 4173
cloudflared tunnel --url http://localhost:4173
```

## Project layout

- `src/model/` — data model, pricing rules, phrase parsing (`parseBouquet.ts`), sound-alike matching, Excel.
- `src/store/` — on-device storage (IndexedDB), photos, backup.
- `src/speech/` — Whisper (on-device recognition) worker and client, audio recording, hints.
- `src/screens/` — Calculator, Catalog, Prices (+ item editor), Settings (+ speech diagnostics).
- `src/i18n/` — UI translations (English, Hebrew, Russian). Add a language by adding a file.
- `src/platform.ts`, `src/pwaUpdate.ts` — install hints, update prompt.
