import { useCallback, useRef, useState, type ReactNode } from 'react';
import { LanguageButton } from './components/LanguageButton';
import { useI18n } from './i18n';
import { isInAppBrowser, isIos, isStandalone, useInstallPrompt } from './platform';
import { reloadWithUpdate, useUpdateState } from './pwaUpdate';
import { CalculatorScreen } from './screens/CalculatorScreen';
import { CatalogScreen } from './screens/CatalogScreen';
import { PricesScreen } from './screens/PricesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { useAppStore } from './store/AppStore';
import { useSwipe } from './useSwipe';

type Tab = 'calculator' | 'catalog' | 'prices' | 'settings';

const TAB_ORDER: Tab[] = ['calculator', 'catalog', 'prices', 'settings'];

// The open tab survives a reload (e.g. an automatic update while the app is in the background).
const TAB_KEY = 'open-tab';

function loadTab(): Tab {
  try {
    const saved = sessionStorage.getItem(TAB_KEY) as Tab | null;
    return saved && TAB_ORDER.includes(saved) ? saved : 'calculator';
  } catch {
    return 'calculator';
  }
}

function saveTab(tab: Tab): void {
  try {
    sessionStorage.setItem(TAB_KEY, tab);
  } catch {
    // Not critical: after a reload the app just opens on the calculator.
  }
}

const TAB_ICONS: Record<Tab, ReactNode> = {
  calculator: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  catalog: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  prices: (
    <>
      <path d="M3 12V4h8l9 9-8 8-9-9z" />
      <circle cx="7.5" cy="8.5" r="1.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
};

export function App() {
  const { t } = useI18n();
  const { ready } = useAppStore();
  const [tab, setTab] = useState<Tab>(loadTab);
  /** Which way the new screen slides in: from the next tab's side or the previous one's. */
  const [slide, setSlide] = useState<'next' | 'prev' | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  const openTab = useCallback(
    (next: Tab) => {
      if (next === tab) return;
      setSlide(TAB_ORDER.indexOf(next) > TAB_ORDER.indexOf(tab) ? 'next' : 'prev');
      setTab(next);
      saveTab(next);
      window.scrollTo(0, 0);
    },
    [tab],
  );

  // Swipe to the neighbouring tab. In Hebrew the tabs run right to left, so the directions flip.
  const onSwipe = useCallback(
    (direction: 'left' | 'right') => {
      const rtl = document.documentElement.dir === 'rtl';
      const forward = rtl ? direction === 'right' : direction === 'left';
      const next = TAB_ORDER[TAB_ORDER.indexOf(tab) + (forward ? 1 : -1)];
      if (next) openTab(next);
    },
    [tab, openTab],
  );
  const currentScreen = useCallback(() => mainRef.current?.querySelector<HTMLElement>('.screen-slide') ?? null, []);
  useSwipe(mainRef, onSwipe, currentScreen);
  const update = useUpdateState();
  const install = useInstallPrompt();
  const showIosInstallHint = isIos() && !isStandalone() && !isInAppBrowser();

  const tabs: [Tab, string][] = [
    ['calculator', t.nav.calculator],
    ['catalog', t.nav.catalog],
    ['prices', t.nav.prices],
    ['settings', t.nav.settings],
  ];

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">{t.appName}</h1>
        <LanguageButton />
      </header>

      <main className="app-main" ref={mainRef}>
        {update !== 'none' && (
          <div className="notice update-banner">
            <span>{update === 'stuck' ? t.update.stuck : t.update.available}</span>
            <button type="button" onClick={reloadWithUpdate}>
              {t.update.reload}
            </button>
          </div>
        )}
        {isInAppBrowser() && <p className="notice notice-warning">{t.inAppBrowser}</p>}
        {tab === 'calculator' && showIosInstallHint && <p className="notice">{t.installIos}</p>}
        {tab === 'calculator' && install && (
          <button type="button" className="primary-button" onClick={install}>
            {t.installApp}
          </button>
        )}

        {ready && (
          <div key={tab} className={slide ? `screen-slide slide-${slide}` : 'screen-slide'}>
            {tab === 'calculator' && <CalculatorScreen onOpenPrices={() => openTab('prices')} />}
            {tab === 'catalog' && <CatalogScreen />}
            {tab === 'prices' && <PricesScreen />}
            {tab === 'settings' && <SettingsScreen />}
          </div>
        )}
      </main>

      <nav className="tab-bar" aria-label={t.appName}>
        {tabs.map(([id, label]) => (
          <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => openTab(id)}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              {TAB_ICONS[id]}
            </svg>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
