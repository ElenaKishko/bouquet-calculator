// Converts the reviewed catalog spreadsheet into the app's built-in catalog.
//
//   npm run catalog            (reads data/catalog-draft.xlsx → src/data/catalog.json)
//
// Expected columns on the "Catalog" sheet (by header name):
//   ID, Category, Hebrew, Russian, English, Other spoken names, Bought as
// Rows without an ID get one generated from the English (or Russian / Hebrew) name.

import { readSheet } from 'read-excel-file/node';
import { writeFileSync } from 'node:fs';

const INPUT = process.argv[2] ?? 'data/catalog-draft.xlsx';
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
  items.push(item);
}

writeFileSync(OUTPUT, JSON.stringify(items, null, 2) + '\n');
console.log(`${items.length} items → ${OUTPUT}`);
