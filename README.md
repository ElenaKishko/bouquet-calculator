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
- `private/` — the florist's own prices and invoices. Git-ignored; never bundled or published.
  Prices get into the app through **Prices → Load from Excel** on the phone.

## Testing on real phones

Microphone access requires HTTPS, so phones can't use the plain local address.
Serve the production build and open a temporary HTTPS tunnel (free, no account):

```bash
npm run build && npm run preview -- --port 4173
cloudflared tunnel --url http://localhost:4173
```

`cloudflared` prints a `https://….trycloudflare.com` link that works while the
Mac and the tunnel are running. Install `cloudflared` with `brew install cloudflared`.

## Project layout

- `src/model/` — data model, pricing rules, phrase parsing (`parseBouquet.ts`), sound-alike matching, Excel.
- `src/store/` — on-device storage (IndexedDB), photos, backup.
- `src/speech/` — Whisper (on-device recognition) worker and client, audio recording, hints.
- `src/screens/` — Calculator, Catalog, Prices (+ item editor), Settings (+ speech diagnostics).
- `src/i18n/` — UI translations (English, Hebrew, Russian). Add a language by adding a file.
- `src/platform.ts`, `src/pwaUpdate.ts` — install hints, update prompt.
