import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type Messages } from './en';
import { he } from './he';
import { ru } from './ru';

export const UI_LOCALES = ['en', 'he', 'ru'] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

const MESSAGES: Record<UiLocale, Messages> = { en, he, ru };

/** Each locale's own name, shown in the language switcher. */
export const LOCALE_NAMES: Record<UiLocale, string> = {
  en: 'English',
  he: 'עברית',
  ru: 'Русский',
};

const RTL_LOCALES: ReadonlySet<UiLocale> = new Set(['he']);
const STORAGE_KEY = 'ui-locale';

function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === 'string' && (UI_LOCALES as readonly string[]).includes(value);
}

/** The app opens in Hebrew until the florist picks another language (globe button in the header). */
export const DEFAULT_LOCALE: UiLocale = 'he';

function detectInitialLocale(): UiLocale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isUiLocale(saved)) return saved;
  } catch {
    // Storage may be unavailable (private mode): use the default.
  }
  return DEFAULT_LOCALE;
}

interface I18nValue {
  locale: UiLocale;
  setLocale: (locale: UiLocale) => void;
  t: Messages;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<UiLocale>(detectInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
  }, [locale]);

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      t: MESSAGES[locale],
      setLocale: (next) => {
        setLocaleState(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Not critical: the choice just won't be remembered.
        }
      },
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
