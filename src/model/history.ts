// Recently priced bouquets: saved when the florist starts a new one, so several
// bouquets made in a row can be checked afterwards.

import type { Bouquet, BouquetTotal, LineUnit, LumpLine } from './bouquet';
import { lineUnit } from './bouquet';

export interface HistoryLine {
  itemId: string;
  quantity: number;
  unit: LineUnit;
  /** Prices as they were when the bouquet was priced. */
  unitPrice: number | null;
  total: number | null;
}

export interface HistoryEntry {
  id: string;
  /** ISO time the bouquet was saved. */
  savedAt: string;
  /** Number within its day: "Bouquet 3". */
  number: number;
  lines: HistoryLine[];
  lumps: LumpLine[];
  /** What the customer paid (rounded). */
  total: number;
}

export const MAX_HISTORY = 30;

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * Adds a priced bouquet at the top of the history. It gets the next free number of
 * the day, or keeps its own number when it was brought back from the history.
 */
export function addToHistory(
  history: readonly HistoryEntry[],
  bouquet: Bouquet,
  priced: BouquetTotal,
  now = new Date(),
  number?: number,
): HistoryEntry[] {
  const todayNumbers = history.filter((entry) => sameDay(new Date(entry.savedAt), now)).map((entry) => entry.number);
  const entry: HistoryEntry = {
    id: `${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    savedAt: now.toISOString(),
    number: number ?? Math.max(0, ...todayNumbers) + 1,
    lines: priced.lines.map((line) => ({
      itemId: line.itemId,
      quantity: line.quantity,
      unit: lineUnit(line),
      unitPrice: line.unitPrice,
      total: line.total,
    })),
    lumps: bouquet.lumps,
    total: priced.total,
  };
  return [entry, ...history].slice(0, MAX_HISTORY);
}

/** Bouquets saved today and what they add up to. */
export function todaySummary(history: readonly HistoryEntry[], now = new Date()): { count: number; total: number } {
  const today = history.filter((entry) => sameDay(new Date(entry.savedAt), now));
  return { count: today.length, total: today.reduce((sum, entry) => sum + entry.total, 0) };
}

export function isToday(entry: HistoryEntry, now = new Date()): boolean {
  return sameDay(new Date(entry.savedAt), now);
}

/** The saved bouquet back in calculator form (it is priced again at current prices). */
export function toBouquet(entry: HistoryEntry): Bouquet {
  return {
    lines: entry.lines.map(({ itemId, quantity, unit }) => ({ itemId, quantity, unit })),
    lumps: entry.lumps,
  };
}

const HISTORY_KEY = 'bouquet-history';

export function loadHistory(): HistoryEntry[] {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) return JSON.parse(saved) as HistoryEntry[];
  } catch {
    // Start with an empty history.
  }
  return [];
}

export function saveHistory(history: readonly HistoryEntry[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Not critical: the history just won't survive a restart.
  }
}
