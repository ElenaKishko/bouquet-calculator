// Converts the reviewed catalog spreadsheet (and the default price table) into the
// app's built-in catalog.
//
//   npm run catalog [catalog.xlsx] [prices.xlsx]
//     defaults: data/catalog-draft.xlsx and private/my-prices.xlsx → src/data/catalog.json
//
// Catalog sheet "Catalog" (by header name):
//   ID, Category, Hebrew, Russian, English, Other spoken names, Bought as
// Rows without an ID get one generated from the English (or Russian / Hebrew) name.
//
// Price sheet "My prices" (header row starts with "ID"; same layout as the app's
// Excel export): Purchase price (₪), Stems per bunch, Own multiplier,
// Fixed sale price per stem (₪). These become the default prices every new
// florist starts with; a florist's own prices always win in the app.
// Note: the built catalog is public (it ships in the app and in the repository).

import { readSheet } from 'read-excel-file/node';
import { existsSync, writeFileSync } from 'node:fs';

const INPUT = process.argv[2] ?? 'data/catalog-draft.xlsx';
const PRICES = process.argv[3] ?? 'private/my-prices.xlsx';
const OUTPUT = 'src/data/catalog.json';

/** Standard rose varieties: a plain "rose" is priced at their average. */
const GROUPS = {
  rose: ['rose-avalanche', 'rose-revival', 'rose-milva', 'rose-cool-water'],
};
const AVERAGE_ITEMS = { rose: 'rose' };

const GREENERY_WORDS = ['greenery', 'green', 'зелень', 'ירוק', 'ירק'];

function text(value) {
  return value == null ? '' : String(value).trim();
}

function slug(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

const rows = await readSheet(INPUT, 'Catalog');
const header = rows[0].map(text);
const column = (name) => {
  const index = header.findIndex((title) => title.toLowerCase() === name.toLowerCase());
  if (index < 0) throw new Error(`Missing column "${name}"`);
  return index;
};
const col = {
  id: column('ID'),
  category: column('Category'),
  he: column('Hebrew'),
  ru: column('Russian'),
  en: column('English'),
  aliases: column('Other spoken names'),
  boughtAs: header.findIndex((title) => /^(bought as|unit)$/i.test(title)),
};

function number(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(text(value).replace(',', '.'));
  return text(value) && Number.isFinite(parsed) ? parsed : undefined;
}

/** Default prices by item ID, from the price table (if there is one). */
async function readDefaultPrices(path) {
  if (!existsSync(path)) return new Map();
  const sheet = await readSheet(path, 'My prices');
  const headerRow = sheet.findIndex((row) => text(row[0]).toLowerCase() === 'id');
  if (headerRow < 0) throw new Error(`No "ID" header in ${path}`);
  const titles = sheet[headerRow].map((cell) => text(cell).toLowerCase());
  const at = (title) => titles.indexOf(title.toLowerCase());
  const columns = {
    purchasePrice: at('Purchase price (₪)'),
    stemsPerBunch: at('Stems per bunch'),
    multiplier: at('Own multiplier'),
    fixedSalePrice: at('Fixed sale price per stem (₪)'),
  };
  const prices = new Map();
  for (const row of sheet.slice(headerRow + 1)) {
    const id = text(row[0]);
    if (!id) continue;
    const entry = {};
    for (const [field, index] of Object.entries(columns)) {
      const value = index >= 0 ? number(row[index]) : undefined;
      if (value != null) entry[field] = value;
    }
    if (Object.keys(entry).length) prices.set(id, entry);
  }
  return prices;
}

const defaultPrices = await readDefaultPrices(PRICES);
const groupOf = new Map(Object.entries(GROUPS).flatMap(([group, ids]) => ids.map((id) => [id, group])));
const items = [];
const seen = new Set();

for (const row of rows.slice(1)) {
  const names = {};
  for (const language of ['he', 'ru', 'en']) {
    const value = text(row[col[language]]);
    if (value) names[language] = value;
  }
  if (!names.he && !names.ru && !names.en) continue;

  let id = text(row[col.id]) || slug(names.en ?? names.ru ?? names.he);
  while (seen.has(id)) id += '-2';
  seen.add(id);

  const category = GREENERY_WORDS.some((word) => text(row[col.category]).toLowerCase().includes(word))
    ? 'greenery'
    : 'flower';
  const boughtAsText = col.boughtAs >= 0 ? text(row[col.boughtAs]).toLowerCase() : '';
  const aliases = text(row[col.aliases])
    .split(/[;,]/)
    .map((alias) => alias.trim())
    .filter(Boolean);

  const item = {
    id,
    category,
    names,
    aliases,
    boughtAs: /bunch|pack|пуч|упаков|צרור|חביל/.test(boughtAsText) ? 'bunch' : 'stem',
  };
  if (groupOf.has(id)) item.group = groupOf.get(id);
  const averaged = Object.entries(AVERAGE_ITEMS).find(([, itemId]) => itemId === id);
  if (averaged) item.priceRule = { averageOfGroup: averaged[0] };
  Object.assign(item, defaultPrices.get(id));
  items.push(item);
}

writeFileSync(OUTPUT, JSON.stringify(items, null, 2) + '\n');
const priced = items.filter((item) => item.purchasePrice != null || item.fixedSalePrice != null).length;
console.log(`${items.length} items (${priced} with default prices) → ${OUTPUT}`);
