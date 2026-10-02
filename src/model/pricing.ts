// Price rules (SPEC §6):
// - sale price per stem = fixed sale price, if the florist set one;
// - otherwise price per stem × multiplier (own, or the category's);
// - items bought by the bunch: price per stem = bunch price / stems per bunch;
// - a plain item with a group rule (e.g. "rose") uses the average purchase price of its group.

import type { Item, Settings } from './types';

/** Purchase price of one stem, or null when it can't be known yet. */
export function purchasePricePerStem(item: Item): number | null {
  if (item.purchasePrice == null) return null;
  if (item.boughtAs === 'bunch') {
    return item.stemsPerBunch ? item.purchasePrice / item.stemsPerBunch : null;
  }
  return item.purchasePrice;
}

/** True when a bunch price is known but the stems per bunch are not, so no price per stem can be worked out. */
export function needsStemsPerBunch(item: Item): boolean {
  return item.boughtAs === 'bunch' && item.purchasePrice != null && !item.stemsPerBunch && item.fixedSalePrice == null;
}

/** Average purchase price per stem of a group's items that have a price. */
export function groupAveragePerStem(group: string, items: readonly Item[]): number | null {
  const prices = items
    .filter((item) => item.group === group)
    .map(purchasePricePerStem)
    .filter((price): price is number => price != null);
  if (prices.length === 0) return null;
  return prices.reduce((sum, price) => sum + price, 0) / prices.length;
}

/** The base price per stem the multiplier applies to. */
export function basePricePerStem(item: Item, items: readonly Item[]): number | null {
  if (item.priceRule) return groupAveragePerStem(item.priceRule.averageOfGroup, items);
  return purchasePricePerStem(item);
}

export function effectiveMultiplier(item: Item, settings: Settings): number {
  if (item.multiplier != null) return item.multiplier;
  return item.category === 'greenery' ? settings.greeneryMultiplier : settings.flowerMultiplier;
}

/** Sale price of one stem, or null when the item has no price yet. */
export function salePricePerStem(item: Item, items: readonly Item[], settings: Settings): number | null {
  if (item.fixedSalePrice != null) return item.fixedSalePrice;
  const base = basePricePerStem(item, items);
  return base == null ? null : base * effectiveMultiplier(item, settings);
}

/**
 * Sale price of a whole pack ("חבילה"), for items said by the pack:
 * pack purchase price × multiplier, no stems-per-pack needed. Otherwise
 * price per stem × stems per pack when both are known.
 */
export function salePricePerPack(item: Item, items: readonly Item[], settings: Settings): number | null {
  if (item.boughtAs === 'bunch' && item.purchasePrice != null && item.fixedSalePrice == null) {
    return item.purchasePrice * effectiveMultiplier(item, settings);
  }
  const perStem = salePricePerStem(item, items, settings);
  return perStem != null && item.stemsPerBunch ? perStem * item.stemsPerBunch : null;
}

/** Bouquet totals are rounded up to a whole shekel (SPEC §11). */
export function roundUpToShekel(amount: number): number {
  // Guard against float noise such as 187.00000000001 → 188.
  return Math.ceil(amount - 1e-9);
}

/** Formats a price for display: whole shekels without decimals ("12"), otherwise 2 decimals ("7.50"). */
export function formatPrice(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}
