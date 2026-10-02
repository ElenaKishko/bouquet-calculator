// Sound-alike matching across Hebrew, Russian and English spellings.
//
// The recognizer often writes a word in the "wrong" script or slightly off
// ("אורטנזיה" for "הורטנזיה", "אוקליפט" for "эвкалипт"). To compare such
// spellings, every word is reduced to a consonant skeleton in Latin letters:
// vowels and Hebrew vowel letters (א ה ו י ע) are dropped, and consonants that
// sound alike or share a Hebrew letter are merged (b/v, p/f, s/sh, k/q, …).

const HEBREW: Record<string, string> = {
  א: '', ב: 'b', ג: 'g', ד: 'd', ה: '', ו: '', ז: 'z', ח: 'x', ט: 't', י: '',
  כ: 'k', ך: 'k', ל: 'l', מ: 'm', ם: 'm', נ: 'n', ן: 'n', ס: 's', ע: '', פ: 'p',
  ף: 'p', צ: 'c', ץ: 'c', ק: 'k', ר: 'r', ש: 's', ת: 't',
};

const RUSSIAN: Record<string, string> = {
  а: '', б: 'b', в: 'b', г: 'g', д: 'd', е: '', ё: '', ж: 'z', з: 'z', и: '', й: '',
  к: 'k', л: 'l', м: 'm', н: 'n', о: '', п: 'p', р: 'r', с: 's', т: 't', у: '',
  ф: 'p', х: 'x', ц: 'c', ч: 'c', ш: 's', щ: 's', ъ: '', ы: '', ь: '', э: '', ю: '', я: '',
};

/** Multi-letter English spellings, applied before single letters. */
const ENGLISH_PAIRS: [RegExp, string][] = [
  [/sch/g, 's'],
  [/sh/g, 's'],
  [/ch/g, 'c'],
  [/ts|tz/g, 'c'],
  [/ph/g, 'p'],
  [/th/g, 't'],
  [/ck/g, 'k'],
  [/qu/g, 'k'],
  [/kh/g, 'x'],
  [/c(?=[eiy])/g, 's'],
  [/x/g, 'ks'],
];

const ENGLISH: Record<string, string> = {
  a: '', b: 'b', c: 'k', d: 'd', e: '', f: 'p', g: 'g', h: '', i: '', j: 'z', k: 'k',
  l: 'l', m: 'm', n: 'n', o: '', p: 'p', q: 'k', r: 'r', s: 's', t: 't', u: '', v: 'b',
  w: 'b', y: '', z: 'z',
};

/** Consonant skeleton of a word or phrase, e.g. "הורטנזיה" → "rtnz", "Гортензия" → "grtnz". */
export function soundKey(text: string): string {
  let latin = text.toLowerCase();
  for (const [pattern, replacement] of ENGLISH_PAIRS) latin = latin.replace(pattern, replacement);
  let key = '';
  for (const char of latin) {
    const mapped = HEBREW[char] ?? RUSSIAN[char] ?? ENGLISH[char];
    if (mapped === undefined) continue; // digits, spaces, punctuation
    for (const letter of mapped) {
      if (key.at(-1) !== letter) key += letter; // collapse doubled consonants
    }
  }
  return key;
}

/** Edit distance between two strings. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
    }
    previous = current;
  }
  return previous[b.length];
}

/** Similarity 0…1 of two sound keys. */
export function keySimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/**
 * Minimum similarity to accept a match. Short keys need to match almost exactly,
 * otherwise everyday words would be mistaken for flowers.
 */
export function matchThreshold(keyLength: number): number {
  if (keyLength <= 2) return 1;
  if (keyLength <= 4) return 0.75;
  return 0.6;
}

/**
 * Whether two sound keys are similar enough to be the same name. A much shorter
 * word must match more closely: "ערבת" (rbt) is not "כרבולת" (krblt).
 */
export function keysMatch(a: string, b: string): { matches: boolean; score: number } {
  const longest = Math.max(a.length, b.length);
  const score = keySimilarity(a, b);
  const lengthRatio = Math.min(a.length, b.length) / longest;
  const threshold = lengthRatio < 0.7 ? Math.max(0.75, matchThreshold(longest)) : matchThreshold(longest);
  return { matches: score >= threshold, score };
}
