// Builds the Whisper hint from the florist's catalog (SPEC §4): names the model
// should prefer when unsure. Whisper only reads ~200 tokens of hint, so the most
// useful names come first: Hebrew names and aliases of priced items, then the rest.

import { salePricePerPack, salePricePerStem } from '../model/pricing';
import type { Item, Settings } from '../model/types';

const HEBREW = /[֐-׿]/;

export function buildHints(items: readonly Item[], settings: Settings): string[] {
  const visible = items.filter((item) => !item.hidden);
  const hasPrice = (item: Item) =>
    salePricePerStem(item, items, settings) != null || salePricePerPack(item, items, settings) != null;
  const priced = visible.filter(hasPrice);
  const unpriced = visible.filter((item) => !hasPrice(item));

  const hints: string[] = [];
  const add = (name: string | undefined) => {
    const trimmed = name?.trim();
    if (trimmed && !hints.includes(trimmed)) hints.push(trimmed);
  };
  const hebrewNames = (item: Item) => [item.names.he, ...item.aliases.filter((alias) => HEBREW.test(alias))];
  const otherNames = (item: Item) => [item.names.ru, ...item.aliases.filter((alias) => !HEBREW.test(alias))];

  // Pack words first: Whisper reads only the start of a long hint.
  ['חבילה', 'חבילת', 'упаковка'].forEach(add);
  for (const item of priced) hebrewNames(item).forEach(add);
  for (const item of unpriced) hebrewNames(item).forEach(add);
  for (const item of priced) otherNames(item).forEach(add);
  return hints;
}
