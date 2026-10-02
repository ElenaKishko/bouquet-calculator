// Currency shown next to prices. Only the sign changes; amounts are not converted.

import { formatPrice } from './pricing';

export const CURRENCIES = [
  { code: 'ILS', symbol: '₪', before: false },
  { code: 'EUR', symbol: '€', before: false },
  { code: 'USD', symbol: '$', before: true },
  { code: 'GBP', symbol: '£', before: true },
  { code: 'RUB', symbol: '₽', before: false },
  { code: 'UAH', symbol: '₴', before: false },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];

export const DEFAULT_CURRENCY: CurrencyCode = 'ILS';

function currency(code: CurrencyCode) {
  return CURRENCIES.find((entry) => entry.code === code) ?? CURRENCIES[0];
}

export function currencySymbol(code: CurrencyCode): string {
  return currency(code).symbol;
}

/** "270 ₪", "87.50 €", "$12". */
export function formatMoney(amount: number, code: CurrencyCode): string {
  const { symbol, before } = currency(code);
  return before ? `${symbol}${formatPrice(amount)}` : `${formatPrice(amount)} ${symbol}`;
}

/** The currency's name in the interface language, e.g. "שקל חדש", "евро". */
export function currencyName(code: CurrencyCode, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
}
