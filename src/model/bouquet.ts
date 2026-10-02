// The bouquet being priced: item lines plus lump-sum lines ("all greenery 40").

import type { BouquetOp, LumpLabel } from './parseBouquet';
import { roundUpToShekel, salePricePerPack, salePricePerStem } from './pricing';
import type { Item, Settings } from './types';

/** Stems, or whole packs as bought from the supplier ("חבילה"). */
export type LineUnit = 'stem' | 'pack';

export interface BouquetLine {
  itemId: string;
  quantity: number;
  /** Missing in bouquets saved by older versions: stems. */
  unit?: LineUnit;
}

export const lineUnit = (line: BouquetLine): LineUnit => line.unit ?? 'stem';

const sameLine = (line: BouquetLine, itemId: string, unit: LineUnit) => line.itemId === itemId && lineUnit(line) === unit;

export interface LumpLine {
  label: LumpLabel;
  amount: number;
}

export interface Bouquet {
  lines: BouquetLine[];
  lumps: LumpLine[];
}

export const EMPTY_BOUQUET: Bouquet = { lines: [], lumps: [] };

/** Applies spoken operations in order. Repeating an item replaces its quantity; "more" adds. */
export function applyOps(bouquet: Bouquet, ops: readonly BouquetOp[]): Bouquet {
  let lines = [...bouquet.lines];
  let lumps = [...bouquet.lumps];
  for (const op of ops) {
    if (op.kind === 'lump') {
      lumps = [...lumps.filter((lump) => lump.label !== op.label), { label: op.label, amount: op.amount }];
    } else if (op.kind === 'remove') {
      lines = lines.filter((line) => line.itemId !== op.itemId);
    } else {
      const unit = op.unit ?? 'stem';
      const existing = lines.find((line) => sameLine(line, op.itemId, unit));
      const quantity = op.kind === 'add' && existing ? existing.quantity + op.quantity : op.quantity;
      lines = existing
        ? lines.map((line) => (sameLine(line, op.itemId, unit) ? { ...line, quantity } : line))
        : [...lines, { itemId: op.itemId, quantity, unit }];
    }
  }
  return { lines: lines.filter((line) => line.quantity > 0), lumps };
}

export function setQuantity(bouquet: Bouquet, itemId: string, quantity: number, unit: LineUnit = 'stem'): Bouquet {
  if (quantity > 0) return applyOps(bouquet, [{ kind: 'set', itemId, quantity, unit }]);
  return { ...bouquet, lines: bouquet.lines.filter((line) => !sameLine(line, itemId, unit)) };
}

/** Switches a line between stems and packs, keeping the number. */
export function switchUnit(bouquet: Bouquet, itemId: string, from: LineUnit): Bouquet {
  const to: LineUnit = from === 'stem' ? 'pack' : 'stem';
  if (bouquet.lines.some((line) => sameLine(line, itemId, to))) return bouquet;
  return {
    ...bouquet,
    lines: bouquet.lines.map((line) => (sameLine(line, itemId, from) ? { ...line, unit: to } : line)),
  };
}

export function removeLump(bouquet: Bouquet, label: LumpLabel): Bouquet {
  return { ...bouquet, lumps: bouquet.lumps.filter((lump) => lump.label !== label) };
}

export interface PricedLine extends BouquetLine {
  item: Item | undefined;
  /** Sale price per stem or per pack (see unit); null when the item has no price yet. */
  unitPrice: number | null;
  total: number | null;
}

export interface BouquetTotal {
  lines: PricedLine[];
  /** Exact sum of everything that has a price. */
  subtotal: number;
  /** What the customer pays: rounded up to a whole shekel. */
  total: number;
  /** Lines left out of the total because the item has no price. */
  unpricedCount: number;
}

export function priceBouquet(bouquet: Bouquet, items: readonly Item[], settings: Settings): BouquetTotal {
  const byId = new Map(items.map((item) => [item.id, item]));
  const lines = bouquet.lines.map((line): PricedLine => {
    const item = byId.get(line.itemId);
    const pricePerUnit = lineUnit(line) === 'pack' ? salePricePerPack : salePricePerStem;
    const unitPrice = item ? pricePerUnit(item, items, settings) : null;
    return { ...line, item, unitPrice, total: unitPrice == null ? null : unitPrice * line.quantity };
  });
  const subtotal =
    lines.reduce((sum, line) => sum + (line.total ?? 0), 0) + bouquet.lumps.reduce((sum, lump) => sum + lump.amount, 0);
  return {
    lines,
    subtotal,
    total: subtotal > 0 ? roundUpToShekel(subtotal) : 0,
    unpricedCount: lines.filter((line) => line.total == null).length,
  };
}
