// Turns a recognized phrase into bouquet operations (SPEC §7):
//   "שלוש הורטנזיה, ארבע אלסטרומריה" → set hydrangea 3, set alstroemeria 4
//   "עוד שתיים הורטנזיה"            → add 2 hydrangeas
//   "… לא, ארבע"                     → correct the last item to 4
//   "בלי אקליפטוס"                   → remove eucalyptus
//   "כל הירוק ארבעים שקל"            → greenery as one amount: 40 ₪
// Item names are matched by sound (see phonetic.ts), in any catalog language.

import { parseNumber } from './numbers';
import { keysMatch, soundKey } from './phonetic';
import type { LineUnit } from './bouquet';
import type { Item } from './types';

export type LumpLabel = 'greenery' | 'extra';

export type BouquetOp =
  | { kind: 'set' | 'add'; itemId: string; quantity: number; unit?: LineUnit }
  | { kind: 'remove'; itemId: string }
  | { kind: 'lump'; label: LumpLabel; amount: number };

export interface ParseResult {
  ops: BouquetOp[];
  /** Words that matched nothing, grouped into fragments in spoken order. */
  unknown: string[];
}

const MORE_WORDS = new Set(['עוד', 'ועוד', 'ещё', 'еще', 'more', 'another', 'plus', 'плюс']);
const REMOVE_WORDS = new Set([
  'בלי', 'תוריד', 'תורידי', 'להוריד', 'הורד', 'без', 'убери', 'убрать', 'удали', 'remove', 'without',
]);
/** A pack as bought from the supplier: "חבילת לימוניום", "две упаковки", "a pack of". */
export const PACK_WORDS = new Set([
  'חבילה', 'חבילת', 'חבילות', 'צרור', 'צרורות', 'צרורים',
  // Whisper often loses the guttural ח: "אבילה" for "חבילה".
  'אבילה', 'אבילת', 'אבילות', 'הבילה', 'הבילת', 'כבילה',
  'упаковка', 'упаковки', 'упаковку', 'упаковок', 'пачка', 'пачки', 'пачку', 'пачек', 'связка', 'связки', 'связку',
  'pack', 'packs', 'bunch', 'bunches',
]);

/**
 * Russian pack words by sound, for when the recognizer writes them in Hebrew
 * letters ("אופקובקה" for "упаковка"). Only distinctive, long-enough sounds.
 */
const PACK_SOUNDS = new Set(['упаковка', 'связка', 'חבילה'].map(soundKey));

function isPackWord(word: string | undefined): boolean {
  if (word == null) return false;
  if (isKeyword(PACK_WORDS, word)) return true;
  const key = soundKey(word);
  return key.length >= 3 && PACK_SOUNDS.has(key);
}

const CORRECTION_WORDS = new Set(['לא', 'סליחה', 'טעות', 'нет', 'ошибка', 'no', 'sorry']);
const CURRENCY_WORDS = new Set([
  'שקל', 'שקלים', '₪', 'шекель', 'шекеля', 'шекелей', 'шек', 'shekel', 'shekels', 'nis',
  'יורו', 'דולר', 'דולרים', 'евро', 'доллар', 'доллара', 'долларов', 'рубль', 'рубля', 'рублей', 'гривен', 'гривны',
  'euro', 'euros', 'dollar', 'dollars', 'pound', 'pounds', '€', '$', '£', '₽', '₴',
]);
const GREENERY_WORDS = new Set(['ירוק', 'ירוקים', 'ירק', 'зелень', 'зелени', 'зеленью', 'greenery', 'greens', 'green']);
const STOP_WORDS = new Set([
  // Hebrew
  'של', 'את', 'עם', 'גם', 'זה', 'זאת', 'יש', 'פה', 'לי', 'כל', 'ב', 'ל', 'ו', 'ה', 'על', 'אז', 'בערך',
  'ענפים', 'גבעולים', 'גבעול', 'יחידות', 'יחידה', 'פרחים', 'זר', 'בזר', 'סך', 'הכל', 'בסך',
  // Phrases Whisper tends to "hear" in silence
  'תודה', 'רבה', 'שלום', 'להתראות', 'כתוביות', 'צפייה', 'שצפיתם', 'תרגום',
  // Russian
  'и', 'с', 'на', 'в', 'вся', 'всю', 'всё', 'все', 'штук', 'штуки', 'штука', 'шт', 'веток', 'ветки',
  'веточек', 'веточки', 'ветка', 'стеблей', 'стебля', 'букет', 'в букете', 'ну', 'так',
  // English
  'and', 'of', 'the', 'a', 'all', 'with', 'stems', 'stem', 'pieces', 'branches', 'for',
]);

/** Hebrew prefixes ה ("the") and ו ("and") glued to a keyword: "הירוק", "והירוק". */
function bareHebrew(word: string): string {
  return word.replace(/^ו?ה?/, '');
}

function isKeyword(set: ReadonlySet<string>, word: string | undefined): boolean {
  if (word == null) return false;
  return set.has(word) || set.has(bareHebrew(word)) || set.has(word.replace(/^ו/, ''));
}

/** Token standing for a pause in speech (comma, period…): separates "item number, item number". */
export const BOUNDARY = '|';

/** Lowercase, split digits from letters, turn punctuation into spaces and pauses into BOUNDARY. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/ש["״]ח/g, ' שקל ')
    .replace(/(\d)[.,](\d)/g, '$1\u0000$2') // keep decimal separators
    .replace(/[,.;:!?…\n]+/g, ` ${BOUNDARY} `)
    .replace(/[^\p{Letter}\p{Number}₪€$£₽₴\u0000\s|]+/gu, ' ')
    .replace(/\u0000/g, '.')
    .replace(/(\d)(?=[^\d.\s])|([^\d.\s])(?=\d)/gu, '$1$2 ')
    .split(/\s+/)
    .filter(Boolean);
}

interface NameEntry {
  itemId: string;
  key: string;
  text: string;
}

/** Every name and alias of the visible items, ready for matching. */
export function buildNameIndex(items: readonly Item[]): NameEntry[] {
  const entries: NameEntry[] = [];
  for (const item of items) {
    if (item.hidden) continue;
    const names = [...Object.values(item.names), ...item.aliases].filter((name): name is string => !!name);
    for (const name of names) {
      const text = tokenize(name).join(' ');
      const key = soundKey(text);
      if (key) entries.push({ itemId: item.id, key, text });
    }
  }
  return entries;
}

/** Hebrew plural endings, tried as an alternative spelling: "ורדים" → "ורד". */
function singularVariants(phrase: string): string[] {
  const variants = [phrase];
  const singular = phrase.replace(/(ים|ות)$/, '');
  if (singular !== phrase && singular.length >= 2) variants.push(singular);
  return variants;
}

function script(text: string): 'hebrew' | 'cyrillic' | 'latin' {
  if (/[\u0590-\u05FF]/.test(text)) return 'hebrew';
  if (/[а-яё]/i.test(text)) return 'cyrillic';
  return 'latin';
}

/**
 * Very short names ("ורד" → "rd") carry too little sound to compare loosely:
 * accept them only spelled the same, or with the same sounds in the same alphabet
 * and nearly the same length ("розы" ~ "роза", but not "תודה" ~ "טווידה").
 */
function shortNameMatches(phrase: string, entry: NameEntry, key: string): boolean {
  if (phrase === entry.text || bareHebrew(phrase) === entry.text) return true;
  return key === entry.key && script(phrase) === script(entry.text) && Math.abs(phrase.length - entry.text.length) <= 1;
}

interface ItemMatch {
  itemId: string;
  length: number;
  score: number;
}

const MAX_WINDOW = 3;

function isSpecial(word: string): boolean {
  return (
    word === BOUNDARY ||
    isKeyword(MORE_WORDS, word) ||
    isPackWord(word) ||
    isKeyword(REMOVE_WORDS, word) ||
    isKeyword(CORRECTION_WORDS, word) ||
    isKeyword(CURRENCY_WORDS, word) ||
    /^\d/.test(word.replace(/^ו/, ''))
  );
}

/** Best item name starting at tokens[start], trying windows of 3, 2 and 1 words. */
function matchItem(tokens: readonly string[], start: number, index: readonly NameEntry[]): ItemMatch | null {
  let best: ItemMatch | null = null;
  for (let length = 1; length <= MAX_WINDOW && start + length <= tokens.length; length++) {
    const words = tokens.slice(start, start + length);
    if (words.some((word, offset) => offset > 0 && (isSpecial(word) || parseNumber(words, offset)))) break;
    for (const phrase of singularVariants(words.join(' '))) {
      const key = soundKey(phrase);
      if (!key) continue;
      for (const entry of index) {
        const longest = Math.max(key.length, entry.key.length);
        if (longest <= 2 && !shortNameMatches(phrase, entry, key)) continue;
        const match = keysMatch(key, entry.key);
        if (!match.matches) continue;
        let score = match.score;
        if (phrase === entry.text || bareHebrew(phrase) === entry.text) score += 0.01; // exact spelling wins ties
        // Prefer the longer phrase on ties: it explains more of what was said.
        if (!best || score > best.score || (score === best.score && length > best.length)) {
          best = { itemId: entry.itemId, length, score };
        }
      }
    }
  }
  return best;
}

export function parseBouquet(text: string, index: readonly NameEntry[]): ParseResult {
  const tokens = tokenize(text);
  const ops: BouquetOp[] = [];
  const unknown: string[] = [];
  let unknownRun: string[] = [];

  let pendingQuantity: number | null = null;
  let pendingAdd = false;
  let pendingRemove = false;
  let pendingCorrection = false;
  let pendingPack = false;
  let greeneryMentioned = false;
  let lastItemId: string | null = null;

  const flushUnknown = () => {
    if (unknownRun.length) unknown.push(unknownRun.join(' '));
    unknownRun = [];
  };

  /** A number that wasn't followed by an item: a correction / addition to the last item, or noise. */
  const flushPendingNumber = () => {
    if (pendingQuantity == null) return;
    if (lastItemId && (pendingCorrection || pendingAdd)) {
      ops.push({ kind: pendingAdd ? 'add' : 'set', itemId: lastItemId, quantity: pendingQuantity });
    } else {
      unknown.push(String(pendingQuantity));
    }
    pendingQuantity = null;
    pendingAdd = false;
    pendingCorrection = false;
  };

  let i = 0;
  while (i < tokens.length) {
    const word = tokens[i];

    if (word === BOUNDARY) {
      flushUnknown();
      i++;
      continue;
    }

    if (isKeyword(MORE_WORDS, word)) {
      flushUnknown();
      pendingAdd = true;
      i++;
      continue;
    }
    if (isKeyword(REMOVE_WORDS, word)) {
      flushUnknown();
      pendingRemove = true;
      i++;
      continue;
    }
    if (isPackWord(word)) {
      flushUnknown();
      pendingPack = true;
      i++;
      continue;
    }
    if (isKeyword(CORRECTION_WORDS, word)) {
      flushUnknown();
      pendingCorrection = true;
      i++;
      continue;
    }

    const number = parseNumber(tokens, i);
    if (number) {
      flushUnknown();
      flushPendingNumber();
      const after = i + number.length;
      const currencyAfter = isKeyword(CURRENCY_WORDS, tokens[after]);
      const currencyBefore = isKeyword(CURRENCY_WORDS, tokens[i - 1]);
      const itemFollows = !currencyAfter && matchItem(tokens, after, index) != null;
      if (currencyAfter || currencyBefore || (greeneryMentioned && !itemFollows)) {
        ops.push({ kind: 'lump', label: greeneryMentioned ? 'greenery' : 'extra', amount: number.value });
        greeneryMentioned = false;
        pendingAdd = false;
        pendingCorrection = false;
        i = after + (currencyAfter ? 1 : 0);
        continue;
      }
      pendingQuantity = number.value;
      i = after;
      continue;
    }

    if (isKeyword(GREENERY_WORDS, word)) {
      flushUnknown();
      greeneryMentioned = true;
      i++;
      continue;
    }

    if (isKeyword(STOP_WORDS, word) || isKeyword(CURRENCY_WORDS, word)) {
      i++;
      continue;
    }

    const match = matchItem(tokens, i, index);
    if (match) {
      flushUnknown();
      let next = i + match.length;
      let quantity = pendingQuantity;
      let pack = pendingPack;
      // "לימוניום חבילה", "лимониум упаковка": pack word after the name.
      if (isPackWord(tokens[next])) {
        pack = true;
        next++;
      }
      if (quantity == null && !pendingRemove) {
        // Number after the name ("הורטנזיה שלוש"), unless it starts the next item.
        const trailing = parseNumber(tokens, next);
        if (trailing) {
          const afterTrailing = next + trailing.length;
          // "הורטנזיה שלוש, …": a pause after the number ties it to this item.
          const pauseAfter = afterTrailing >= tokens.length || tokens[afterTrailing] === BOUNDARY;
          const startsNextItem = !pauseAfter && matchItem(tokens, afterTrailing, index) != null;
          const isMoney = isKeyword(CURRENCY_WORDS, tokens[afterTrailing]);
          if (!startsNextItem && !isMoney) {
            quantity = trailing.value;
            next = afterTrailing;
            // "лимониум две упаковки"
            if (isPackWord(tokens[next])) {
              pack = true;
              next++;
            }
          }
        }
      }
      if (pendingRemove) {
        ops.push({ kind: 'remove', itemId: match.itemId });
      } else {
        ops.push({
          kind: pendingAdd ? 'add' : 'set',
          itemId: match.itemId,
          quantity: quantity ?? 1,
          ...(pack ? { unit: 'pack' as const } : {}),
        });
      }
      lastItemId = match.itemId;
      pendingQuantity = null;
      pendingAdd = false;
      pendingRemove = false;
      pendingCorrection = false;
      pendingPack = false;
      greeneryMentioned = false;
      i = next;
      continue;
    }

    if (word.length > 1) unknownRun.push(word);
    i++;
  }
  flushUnknown();
  flushPendingNumber();
  return { ops, unknown };
}
