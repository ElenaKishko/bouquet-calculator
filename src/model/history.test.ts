import { describe, expect, it } from 'vitest';
import type { BouquetTotal } from './bouquet';
import { addToHistory, MAX_HISTORY, todaySummary, toBouquet } from './history';

const priced = (total: number): BouquetTotal => ({
  lines: [{ itemId: 'hydrangea', quantity: 3, unit: 'stem', item: undefined, unitPrice: 90, total: 270 }],
  subtotal: total,
  total,
  unpricedCount: 0,
});
const bouquet = { lines: [{ itemId: 'hydrangea', quantity: 3 }], lumps: [{ label: 'greenery' as const, amount: 40 }] };

describe('history', () => {
  it('numbers bouquets within a day and starts again the next day', () => {
    const day1 = new Date(2026, 9, 1, 10, 0);
    const day1Later = new Date(2026, 9, 1, 12, 0);
    const day2 = new Date(2026, 9, 2, 9, 0);
    let history = addToHistory([], bouquet, priced(310), day1);
    history = addToHistory(history, bouquet, priced(188), day1Later);
    history = addToHistory(history, bouquet, priced(99), day2);
    expect(history.map((entry) => entry.number)).toEqual([1, 2, 1]);
    expect(todaySummary(history, day1Later)).toEqual({ count: 2, total: 498 });
  });

  it('never repeats a number when a bouquet is brought back', () => {
    const now = new Date(2026, 9, 1, 10, 0);
    let history = addToHistory([], bouquet, priced(1), now);
    history = addToHistory(history, bouquet, priced(2), now);
    // Bringing back bouquet 2: the bouquet on screen is saved first (as 3), then 2 leaves the list.
    history = addToHistory(history, bouquet, priced(3), now).filter((entry) => entry.number !== 2);
    expect(history.map((entry) => entry.number)).toEqual([3, 1]);
    // Bouquet 2 saved again keeps its number; the next new one is 4.
    history = addToHistory(history, bouquet, priced(4), now, 2);
    history = addToHistory(history, bouquet, priced(5), now);
    expect(history.map((entry) => entry.number)).toEqual([4, 2, 3, 1]);
  });

  it('keeps only the most recent bouquets', () => {
    let history = addToHistory([], bouquet, priced(1));
    for (let i = 0; i < MAX_HISTORY + 5; i++) history = addToHistory(history, bouquet, priced(i));
    expect(history).toHaveLength(MAX_HISTORY);
  });

  it('brings a saved bouquet back to the calculator', () => {
    const [entry] = addToHistory([], bouquet, priced(310));
    expect(toBouquet(entry)).toEqual({
      lines: [{ itemId: 'hydrangea', quantity: 3, unit: 'stem' }],
      lumps: [{ label: 'greenery', amount: 40 }],
    });
  });
});
