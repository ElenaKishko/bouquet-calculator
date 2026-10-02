import { useI18n, type UiLocale } from './i18n';
import { useAppStore } from './store/AppStore';

/** Switches the interface language and, with it, the language the florist dictates in. */
export function useChangeLanguage(): (locale: UiLocale) => void {
  const { setLocale } = useI18n();
  const { updateSettings } = useAppStore();
  return (locale) => {
    setLocale(locale);
    // Speak in the interface language by default; it can still be changed in Settings.
    updateSettings({ whisperLanguage: locale });
  };
}
