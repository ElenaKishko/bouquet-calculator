# Bouquet Calculator — Product Specification

Status: draft, requirements gathering in progress.

## 1. Purpose

A mobile app for florists. The florist looks at a bouquet, dictates its contents
("3 hydrangeas, 2 spray chrysanthemums, 4 lisianthus, greenery 40"), and the app
calculates the sale price of the bouquet from the florist's own price table.

## 2. Hard constraints

- **Completely free** — no paid services, no paid developer accounts, no subscriptions.
- **All project files, code, and comments are in English.**
- Must run on both Android and iPhone.

## 3. Platform decision

**Progressive Web App (PWA).**

- Distributed as a link (e.g. shared in WhatsApp). Installed via
  "Install app" (Android / Chrome) or "Share → Add to Home Screen" (iPhone / Safari).
- Hosted on GitHub Pages (free): https://bouquetprice.github.io/ — a free GitHub
  organization `bouquetprice` (owned by the user), so the address carries no
  personal name. Deployed automatically on every push to `main`.
- No backend, no user accounts. All data is stored locally on the device.
- Works offline after first load (except speech recognition, which may need internet).
- On iPhone, show a one-time illustrated hint explaining how to install.
- Detect in-app browsers (e.g. WhatsApp's) and tell the user to open the link in
  Chrome / Safari.
- Can be wrapped later into native store apps (Capacitor) without a rewrite, if ever needed.
- Updates: the app checks for a new version on launch and whenever it returns to
  the screen. The prototype reloads itself immediately; the real app must not
  reload mid-dictation — show "New version available" and apply it when idle.
- The "Update" button must never do nothing (v0.7.4). iPhone home-screen apps
  don't always report that the new version took over, so the app reloads as soon
  as the new version is active, or after 2.5 s at the latest. If the new version
  is still waiting after that reload, the banner asks the florist to close the
  app completely and open it again.
- The installed icon is tied to the app's address. A permanent address is needed
  before florists install it (temporary test links change).

## 4. Speech recognition

- Engine: the browser's built-in Web Speech API (free; Google on Android, Apple on iPhone).
- **Recognition language for v1: Hebrew (`he-IL`).**
- The recognition language is a setting, so more languages can be added later
  without architectural changes.
- Flower names must be understood in **any catalog language** (English, Hebrew,
  Russian) even when the recognizer is set to Hebrew. Example: the florist speaks
  Hebrew but says "эвкалипт" or "lisianthus".
- Approach (to be validated with a prototype):
  - Normalize recognized text and all catalog names into a common phonetic form
    (transliteration to a Latin consonant skeleton), then fuzzy-match.
  - "Learned aliases": when a word is misrecognized, the florist links it to the
    correct item once, and the app remembers it.
- Number words must be parsed (Hebrew in v1, including masculine/feminine forms),
  as well as digits.
- **iPhone limitation (confirmed on a real device, 2026-10-01):** in an app added
  to the Home Screen, the Web Speech API does not work and microphone access is
  denied (`getUserMedia` → `NotAllowedError`, permission `denied`). Known WebKit
  issue (bugs 225298, 268643). Therefore on iPhone:
  - Primary input in the installed app: **keyboard dictation** — a text field the
    florist dictates into with the iOS keyboard microphone; the app parses the
    text live as it appears.
  - The microphone button is still offered when the app runs in a Safari tab,
    if it works there (to be confirmed).
  - Android keeps the microphone button as primary input.
  - Keyboard dictation (Apple) recognizes Hebrew flower names poorly (user report).
  - Microphone recording itself (`getUserMedia`) **does** work in the installed
    iPhone app once Safari → Microphone is set to Allow.
- **On-device Whisper (candidate, being tested):** record audio in the app and
  recognize it with Whisper via transformers.js (WASM, 8-bit weights), models
  downloaded once from Hugging Face. Flower names are passed as a decoder prompt
  ("previous text"), which strongly biases recognition toward them.
  Desktop test with synthesized Hebrew speech:
  - without hints: "שלוש העידר נגעה, 4 אלי הזה נתוס…" (base)
  - with hints: "שלושה ידרנגאה, ארבעה ליזינטוס, חמישה אקליפטוס" (small)
  - Sizes: base ≈ 80 MB, small ≈ 250 MB.
  - **Real iPhone test (installed app, small, Hebrew, hints), 2026-10-01:**
    14.1 s of speech recognized in 8.5 s:
    "שלוש אורטנזיה, ארבע אלסטרומריה, שלוש אקליפטוס, ושני ענפים של אופרים."
    Same kind of phrase via Apple: "שלוש אורט זה", "אסטר מדיה". Whisper is far better.
  - Decision: **Whisper small + flower-name hints is the primary engine on all
    platforms (iPhone and Android)** — identical results for every florist, the
    same hints, works offline, no dependence on Apple / Google.
    Pending: speed test on a real Android phone. The built-in recognizer
    (Web Speech API) stays as a fallback for phones too weak for Whisper.
  - Hints are limited to ~200 tokens, so the full catalog won't fit: build the
    hint from the florist's active items, most-used first.
  - Speed ideas: WebGPU (several times faster where available); recognize
    phrase by phrase at pauses while the florist keeps talking, so the list
    updates almost live instead of only after "Stop".
- Hebrew colloquial names matter: florists say "הורטנזיה" for hydrangea.
  The catalog must include such everyday names as aliases.

## 5. Flower catalog

- The app ships with a **built-in catalog** of common flowers and greenery.
- Each item has names in up to three languages: English, Hebrew, Russian.
  Not every item has a name in every language.
- The catalog data model supports adding more languages later.
- After installing, the florist only needs to enter prices — not names.
- The florist can:
  - edit any item: add a name, rename, add alternative names (aliases);
  - add new items that are not in the built-in catalog;
  - hide items they never use.
- Built-in catalog updates (new app versions) must merge with the florist's data
  without overwriting their edits. Each item has a stable ID; user changes are
  stored separately from built-in data.
- Hebrew trade names used by Israeli florists need review by a native speaker /
  florist before release.
- Draft: `data/catalog-draft.xlsx` — 45 items from the user's supplier delivery
  notes (16–23 June 2026) + 39 common items. Under review by the user.
- **Default prices ship with the app** (decision 2026-10-02): every new florist
  starts with ready prices, so the app is usable immediately; florists then
  adjust them. Source: the user's price table (`private/my-prices.xlsx`), built
  into `src/data/catalog.json` by `npm run catalog`. The user knowingly accepted
  that these prices are public (in the app and the public repository) — easier
  onboarding matters more. A florist's own price always wins over the default;
  florists who didn't change a price receive updated defaults automatically.
- A one-time welcome card explains that the prices are samples and opens the
  Prices tab.

## 6. Pricing

Each item has:

| Field | Description |
|---|---|
| Name(s) | Per language, see §5 |
| Purchase price | Price the florist pays per unit (stem / branch), in ₪ |
| Multiplier | Purchase price × multiplier = sale price per unit |

- **Global multipliers by category:** flowers ×3, greenery ×2 (the user's defaults).
- **Per-item multiplier** overrides the category one. An item can be reset back
  to the category multiplier.
- Changing a category multiplier affects only items without an override.
- **Fixed sale price (optional):** the florist may enter the sale price per stem
  directly, e.g. when the purchase price is unknown. If set, it is used as is and
  the purchase price / multiplier are ignored; the purchase price may stay empty.
  The app never invents a purchase price from it. Clearing the fixed price
  returns the item to purchase price × multiplier.
- **Bought by the bunch, counted by the stem:** some items ("ענן", limonium, "עופרים")
  are bought per bunch. The item stores "stems per bunch"; price per stem =
  bunch price / stems per bunch. Bouquets are always counted in stems.
- **Packs in a bouquet:** the florist may say a whole pack ("חבילת לימוניום",
  "упаковка лимониума", "two packs of …"). Such a line is priced per pack =
  pack purchase price × multiplier (no stems-per-pack needed). A line can be
  switched between stems and packs with one tap.
- **Varieties with a default:**
  - Chrysanthemums: spoken Hebrew distinguishes spray ("חרצית", default = the
    "extra" item) from single-head ("חרצית ראש").
  - Roses: the florist names the variety (e.g. "ורד אנגלי" has its own price).
    A plain "ורד" without a variety is priced at the **average purchase price of
    the standard rose varieties** (not spray rose, not English rose).
- Lump-sum lines (e.g. "all greenery 40") are added as-is, without a multiplier.

## 7. Counting flow

- Large microphone button starts listening. The bouquet list updates live while
  the florist speaks.
- Repeating an item **replaces** its quantity ("3 hydrangeas" … "4 hydrangeas" → 4).
- "More" words (e.g. "עוד") **add** to the existing quantity.
- Lump-sum phrases ("greenery 40") add a fixed-amount line.
- Finishing: an on-screen "Done" button (primary) and optionally a stop word.
  The stop word must not be easily confused with normal dictation.
- Every line can be corrected manually (+ / − / remove), and items can be added by hand.
- The recognizer stops on silence on some devices; the app restarts it
  automatically while in listening mode.
- **Recent bouquets:** "New bouquet" saves the current one to a list under the
  calculator ("Bouquet 3 · 14:32 · 188 ₪", numbered within the day, with a
  "Today: N bouquets · total" line). A saved bouquet can be expanded, brought
  back to the calculator (keeping its number), or deleted. Last 30 are kept on
  the device.
- Tapping an item's name or photo in the bouquet opens its price card over the
  calculator, to fix a price on the fly; Save / Cancel return to the calculator.

## 8. Backup and import

- **Export the price table to Excel (.xlsx)** for backup (important on iPhone:
  removing the home screen icon deletes the app's data).
- **Import from Excel** to restore a backup or load prices prepared elsewhere.
- **Save everything** (Settings) writes one file with prices, names, own items
  and photos; **Restore from file** brings it back.
- Removing the app from the home screen deletes its data (always on iPhone), and
  the app can't tell when that happens. So (v0.7.3):
  - Settings → Backup always says so, and shows the date of the last saved copy.
  - When the florist has changes (prices, names, items, photos, Excel import)
    that no saved copy holds, the Prices screen shows a card "Save a copy of your
    changes" with **Save a copy** and **Later** (hides it for a week). Saving or
    restoring a copy hides it until the next change.
- Later: paste text copied from Google Lens (photo of a price list) and parse it.

## 9. Interface language

- **v1 ships with three UI languages — English, Hebrew, Russian — with a switcher.**
- **Hebrew is the default** for the interface and dictation on first launch,
  whatever the phone's language.
- A globe button in the header (every screen) switches the language; each
  option is written in its own language, so people who don't read Hebrew can
  find theirs. Switching the interface also switches the dictation language
  (it can be changed separately in Settings).
- All UI strings are externalized (i18n) from day one.
- Right-to-left layout support (Hebrew) from day one.
- Additional UI languages can be added later by adding a translation file.

## 10. Screens and visibility

- **Calculator** (opens on launch): microphone, bouquet list, total.
  Shows **sale prices only** — the customer may see the screen.
  No purchase prices, multipliers, or the full catalog here.
- **Catalog** (separate tab, view only): every item with its **photo** and
  **sale price** (per stem), with search and a flowers / greenery filter, so
  anyone in the shop can quickly look up a price. No purchase prices or
  multipliers here.
- **Price table** (separate tab, editing): purchase prices, bought as stem /
  bunch, stems per bunch, multipliers, fixed sale prices, names in every
  language, photos, adding / hiding items, Excel export / import.
- **Settings**: UI language, category multipliers, backup / restore.
- Tabs can also be switched by a sideways swipe (mirrored in Hebrew). Swipes
  are ignored while a panel is open, while recording, in input fields, and at
  the screen edges (system gestures).

## 10b. Visual design (planned)

- Light, pleasant, neutral tones. Two themes — light and dark — following the
  phone's setting.
- App icon (done, 2026-10-03, v0.7.2): a flower whose five petals are gold
  coins, a dark green centre with a dollar sign, on a pale sage background.
  Designed by the user in Claude Design; the source is `public/favicon.svg`
  (full-bleed square, artwork inside the maskable safe zone), and `npm run icons`
  makes every size from it with no extra padding.
- Still to do: the app's colours in the same style.
- Process: the user sends 2–4 references → a page with 2–3 design directions
  → the user picks → implemented across the app.

## 10a. Photos

- Photos are required (catalog screen). Each item can have one photo.
- The florist adds a photo from the item card: take a picture with the camera
  or pick one from the gallery. Photos are resized/compressed on the device
  (~400 px) and stored locally.
- Full backup must include photos (Excel holds prices only) — a separate
  backup file that restores everything.
- Built-in default photos only from legal sources: the florist's own photos,
  freely licensed images (Wikimedia Commons with attribution, Unsplash, Pexels),
  or a supplier's **written** permission. Never copy photos from supplier
  websites without permission (copyright; Israeli law allows statutory damages
  per photo).

## 11. Decisions

- Total is **rounded up to a whole shekel** (e.g. 187.40 → 188 ₪).
- **Currency** is a setting (default ₪; also €, $, £, ₽, ₴). Only the sign
  changes — amounts are not converted.
- Lump-sum lines ("all greenery 40") are the **final sale amount** — no multiplier.
- Test devices: iPhone (Safari) and Android (Chrome).

## 12. Open questions

- Extra costs: labor, packaging, VAT.

## 13. Roadmap

1. ✅ Speech prototype — done; decision: on-device Whisper with hints.
2. ✅ Built-in catalog draft (en / he / ru) — under review by the user.
3. 🔄 Core app (v0.3.0): calculator (Whisper, parsing, total, corrections,
   teaching unknown words), catalog with photos and sale prices, price table
   with item editor and Excel import/export, settings with backup.
   Next: test on the user's iPhone and Android; permanent free hosting
   (data is stored per web address, so the address must stop changing).
4. Excel export / import, learned aliases.
5. Extras: history, sharing a quote to WhatsApp, extra costs, more languages.

## 14. Proposed tech stack

- TypeScript, React, Vite, `vite-plugin-pwa`.
- Local storage: IndexedDB.
- Excel: an open-source, free library for reading/writing .xlsx.
- Hosting: Cloudflare Pages or GitHub Pages (free).
