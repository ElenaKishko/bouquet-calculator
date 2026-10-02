// Combines the built-in catalog with the florist's changes into the items the app shows.

import type { CatalogItem, Item, ItemOverride, NameLanguage } from './types';

export function mergeItem(base: CatalogItem | undefined, override: ItemOverride | undefined): Item | null {
  if (!base && !override) return null;
  const id = base?.id ?? override!.id;
  return {
    id,
    custom: !base,
    category: override?.category ?? base?.category ?? 'flower',
    names: { ...base?.names, ...override?.names },
    aliases: override?.aliases ?? base?.aliases ?? [],
    boughtAs: override?.boughtAs ?? base?.boughtAs ?? 'stem',
    // The florist's prices, else the default prices shipped with the catalog.
    stemsPerBunch: override?.stemsPerBunch ?? base?.stemsPerBunch,
    purchasePrice: override?.purchasePrice ?? base?.purchasePrice,
    multiplier: override?.multiplier ?? base?.multiplier,
    fixedSalePrice: override?.fixedSalePrice ?? base?.fixedSalePrice,
    hidden: override?.hidden ?? false,
    photoId: override?.photoId,
    group: base?.group,
    priceRule: base?.priceRule,
  };
}

/** Catalog order first, then the florist's own items in the order they were added. */
export function mergeItems(catalog: readonly CatalogItem[], overrides: Record<string, ItemOverride>): Item[] {
  const items: Item[] = [];
  const catalogIds = new Set<string>();
  for (const base of catalog) {
    catalogIds.add(base.id);
    const item = mergeItem(base, overrides[base.id]);
    if (item) items.push(item);
  }
  for (const override of Object.values(overrides)) {
    if (catalogIds.has(override.id) || !override.custom) continue;
    const item = mergeItem(undefined, override);
    if (item) items.push(item);
  }
  return items;
}

/** Name in the interface language, falling back to Hebrew, then English, then Russian. */
export function displayName(item: Item, language: string): string {
  const preferred = item.names[language as NameLanguage];
  return preferred || item.names.he || item.names.en || item.names.ru || item.id;
}

/** Text used to search items: all names and aliases. */
export function searchText(item: Item): string {
  return [...Object.values(item.names), ...item.aliases].join(' ').toLowerCase();
}

export function newCustomId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
