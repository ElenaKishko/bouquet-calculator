// Price table ⇄ Excel. The layout matches private/my-prices.xlsx, so a file
// prepared outside the app (or exported earlier) loads back the same way.

import { readSheet } from 'read-excel-file/browser';
import writeExcelFile, { type SheetData } from 'write-excel-file/browser';
import { newCustomId } from './items';
import { purchasePricePerStem, salePricePerStem } from './pricing';
import type { CatalogItem, Category, Item, ItemOverride, NameLanguage, Settings } from './types';

const SHEET = 'My prices';
const FLOWER_MULTIPLIER_LABEL = 'Multiplier for flowers';
const GREENERY_MULTIPLIER_LABEL = 'Multiplier for greenery';

const COLUMNS = {
  id: 'ID',
  category: 'Category',
  he: 'Hebrew',
  ru: 'Russian',
  en: 'English',
  aliases: 'Other spoken names',
  boughtAs: 'Bought as',
  purchasePrice: 'Purchase price (₪)',
  stemsPerBunch: 'Stems per bunch',
  pricePerStem: 'Price per stem (₪)',
  multiplier: 'Own multiplier',
  fixedSalePrice: 'Fixed sale price per stem (₪)',
  salePrice: 'Sale price per stem (₪)',
  hidden: 'Hidden',
} as const;

const round2 = (value: number | null) => (value == null ? null : Math.round(value * 100) / 100);

export async function exportPricesToExcel(items: readonly Item[], settings: Settings): Promise<Blob> {
  const header = Object.values(COLUMNS).map((title) => ({ value: title, fontWeight: 'bold' as const }));
  const rows = items.map((item) => [
    item.id,
    item.category === 'greenery' ? 'Greenery' : 'Flower',
    item.names.he ?? null,
    item.names.ru ?? null,
    item.names.en ?? null,
    item.aliases.join('; ') || null,
    item.boughtAs,
    item.purchasePrice ?? null,
    item.stemsPerBunch ?? null,
    round2(purchasePricePerStem(item)),
    item.multiplier ?? null,
    item.fixedSalePrice ?? null,
    round2(salePricePerStem(item, items, settings)),
    item.hidden ? 'yes' : null,
  ]);
  const data: SheetData = [
    [{ value: FLOWER_MULTIPLIER_LABEL, fontWeight: 'bold' as const }, settings.flowerMultiplier],
    [{ value: GREENERY_MULTIPLIER_LABEL, fontWeight: 'bold' as const }, settings.greeneryMultiplier],
    [null],
    header,
    ...rows,
  ];
  return writeExcelFile(data, {
    sheet: SHEET,
    columns: [24, 10, 20, 24, 24, 24, 9, 11, 9, 10, 10, 12, 11, 8].map((width) => ({ width })),
  }).toBlob();
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.').replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toText(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

export interface PriceImport {
  overrides: Record<string, ItemOverride>;
  settings: Partial<Settings>;
  itemCount: number;
}

/**
 * Reads a price table. Known items get their prices (and any changed names);
 * rows without an ID become the florist's own items. Photos are kept as they are.
 */
export async function importPricesFromExcel(
  file: Blob,
  catalog: readonly CatalogItem[],
  current: Record<string, ItemOverride>,
): Promise<PriceImport> {
  let rows: unknown[][];
  try {
    rows = (await readSheet(file, SHEET)) as unknown[][];
  } catch {
    rows = (await readSheet(file)) as unknown[][];
  }

  const settings: Partial<Settings> = {};
  const headerIndex = rows.findIndex((row) => toText(row[0]).toLowerCase() === 'id');
  if (headerIndex < 0) throw new Error('No "ID" column found');
  for (const row of rows.slice(0, headerIndex)) {
    const label = toText(row[0]).toLowerCase();
    const value = toNumber(row[1]);
    if (value == null) continue;
    if (label === FLOWER_MULTIPLIER_LABEL.toLowerCase()) settings.flowerMultiplier = value;
    if (label === GREENERY_MULTIPLIER_LABEL.toLowerCase()) settings.greeneryMultiplier = value;
  }

  const header = rows[headerIndex].map((cell) => toText(cell).toLowerCase());
  const columnOf = (title: string) => header.findIndex((cell) => cell === title.toLowerCase());
  const col = Object.fromEntries(Object.entries(COLUMNS).map(([key, title]) => [key, columnOf(title)])) as Record<
    keyof typeof COLUMNS,
    number
  >;
  const cell = (row: unknown[], key: keyof typeof COLUMNS) => (col[key] >= 0 ? row[col[key]] : undefined);

  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const overrides: Record<string, ItemOverride> = { ...current };
  let itemCount = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    const names: Partial<Record<NameLanguage, string>> = {};
    for (const language of ['he', 'ru', 'en'] as const) {
      const name = toText(cell(row, language));
      if (name) names[language] = name;
    }
    let id = toText(cell(row, 'id'));
    const base = id ? catalogById.get(id) : undefined;
    // Notes and empty rows: not a known item and no name to create one from.
    if (!base && !names.he && !names.ru && !names.en) continue;
    if (!id) id = newCustomId();

    const categoryText = toText(cell(row, 'category')).toLowerCase();
    const category: Category | undefined = categoryText
      ? /green|зел|ירוק/.test(categoryText) ? 'greenery' : 'flower'
      : undefined;
    const boughtAsText = toText(cell(row, 'boughtAs')).toLowerCase();
    const boughtAs = boughtAsText ? (/bunch|pack|пуч|упаков|צרור|חביל/.test(boughtAsText) ? 'bunch' : 'stem') : undefined;
    const aliasesText = toText(cell(row, 'aliases'));
    const aliases = aliasesText ? aliasesText.split(/[;,]/).map((alias) => alias.trim()).filter(Boolean) : undefined;

    const next: ItemOverride = {
      id,
      photoId: current[id]?.photoId,
      hidden: /^(yes|да|כן|true|1)$/i.test(toText(cell(row, 'hidden'))) || undefined,
      purchasePrice: toNumber(cell(row, 'purchasePrice')),
      stemsPerBunch: toNumber(cell(row, 'stemsPerBunch')),
      multiplier: toNumber(cell(row, 'multiplier')),
      fixedSalePrice: toNumber(cell(row, 'fixedSalePrice')),
    };
    if (base) {
      // Keep only what differs from the built-in catalog.
      const changedNames = Object.fromEntries(
        Object.entries(names).filter(([language, name]) => base.names[language as NameLanguage] !== name),
      );
      if (Object.keys(changedNames).length) next.names = changedNames;
      if (category && category !== base.category) next.category = category;
      if (boughtAs && boughtAs !== base.boughtAs) next.boughtAs = boughtAs;
      if (aliases && aliases.join('|') !== base.aliases.join('|')) next.aliases = aliases;
    } else {
      Object.assign(next, { custom: true, names, category: category ?? 'flower', boughtAs: boughtAs ?? 'stem', aliases });
    }
    for (const key of Object.keys(next) as (keyof ItemOverride)[]) if (next[key] === undefined) delete next[key];
    overrides[id] = next;
    itemCount++;
  }
  return { overrides, settings, itemCount };
}
