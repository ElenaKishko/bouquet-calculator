// Globe button in the header: anyone can switch the app to a language they read,
// even without knowing the current one. Uses the phone's own picker (native <select>).

import { LOCALE_NAMES, UI_LOCALES, useI18n, type UiLocale } from '../i18n';
import { useChangeLanguage } from '../useChangeLanguage';

export function LanguageButton() {
  const { t, locale } = useI18n();
  const changeLanguage = useChangeLanguage();

  return (
    <label className="language-button">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
      </svg>
      <span>{LOCALE_NAMES[locale]}</span>
      <select
        value={locale}
        aria-label={t.settings.language}
        onChange={(event) => changeLanguage(event.target.value as UiLocale)}
      >
        {UI_LOCALES.map((code) => (
          <option key={code} value={code} lang={code}>
            {LOCALE_NAMES[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
