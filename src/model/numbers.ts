// Spoken numbers in Hebrew, Russian and English (both genders in Hebrew and Russian).

const UNITS: Record<string, number> = {
  // Hebrew
  אחד: 1, אחת: 1, שניים: 2, שנים: 2, שתיים: 2, שתים: 2, שני: 2, שתי: 2,
  שלוש: 3, שלושה: 3, שלושת: 3, ארבע: 4, ארבעה: 4, ארבעת: 4, חמש: 5, חמישה: 5, חמשת: 5,
  שש: 6, שישה: 6, ששת: 6, שבע: 7, שבעה: 7, שבעת: 7, שמונה: 8, שמונת: 8,
  תשע: 9, תשעה: 9, תשעת: 9,
  // Russian
  один: 1, одна: 1, одну: 1, одно: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5,
  шесть: 6, семь: 7, восемь: 8, девять: 9,
  // English
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
};

const TEENS: Record<string, number> = {
  // Hebrew: "עשר" / "עשרה" alone mean 10; 11–19 are "<unit> עשר/עשרה" (handled in parse).
  עשר: 10, עשרה: 10, עשרת: 10,
  // Russian
  десять: 10, одиннадцать: 11, двенадцать: 12, тринадцать: 13, четырнадцать: 14,
  пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18, девятнадцать: 19,
  // English
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};

const TENS: Record<string, number> = {
  עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60, שבעים: 70, שמונים: 80, תשעים: 90,
  двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70,
  восемьдесят: 80, девяносто: 90,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const HUNDREDS: Record<string, number> = {
  מאה: 100, מאתיים: 200, сто: 100, двести: 200, триста: 300, hundred: 100,
};

/** Hebrew conjunction "ו" ("and") glued to the next word: "וחמש" → "חמש". */
function withoutVav(word: string): string | null {
  return word.length > 1 && word.startsWith('ו') ? word.slice(1) : null;
}

function wordValue(table: Record<string, number>, word: string): number | undefined {
  if (word in table) return table[word];
  const bare = withoutVav(word);
  return bare != null && bare in table ? table[bare] : undefined;
}

export interface ParsedNumber {
  value: number;
  /** How many tokens the number used. */
  length: number;
}

/**
 * Reads a number starting at tokens[start]: digits ("40", "2.5"), single words
 * ("שלוש", "три") or compounds ("עשרים וחמש", "двадцать пять", "twenty five",
 * "חמש עשרה"). Returns null if tokens[start] is not a number.
 */
export function parseNumber(tokens: readonly string[], start: number): ParsedNumber | null {
  const first = tokens[start];
  if (first == null) return null;

  const digits = first.replace(/^ו/, '');
  if (/^\d+([.,]\d+)?$/.test(digits)) return { value: Number(digits.replace(',', '.')), length: 1 };

  let value = 0;
  let index = start;
  const hundreds = wordValue(HUNDREDS, tokens[index] ?? '');
  if (hundreds != null) {
    value += hundreds;
    index++;
  }
  const tens = wordValue(TENS, tokens[index] ?? '');
  if (tens != null) {
    value += tens;
    index++;
  }
  const teen = tens == null ? wordValue(TEENS, tokens[index] ?? '') : undefined;
  if (teen != null) {
    value += teen;
    index++;
  } else {
    const unit = wordValue(UNITS, tokens[index] ?? '');
    if (unit != null) {
      value += unit;
      index++;
      // Hebrew 11–19: "חמש עשרה", "שלושה עשר".
      const next = tokens[index];
      if (tens == null && (next === 'עשר' || next === 'עשרה')) {
        value += 10;
        index++;
      }
    }
  }
  return index > start ? { value, length: index - start } : null;
}
