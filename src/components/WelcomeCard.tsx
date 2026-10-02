// Shown once, on the first start: the prices are samples — check and set your own.

import { useState } from 'react';
import { useI18n } from '../i18n';

const DISMISSED_KEY = 'welcome-dismissed';

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'yes';
  } catch {
    return false;
  }
}

export function WelcomeCard({ onOpenPrices }: { onOpenPrices: () => void }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(() => !wasDismissed());
  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED_KEY, 'yes');
    } catch {
      // Not critical: the welcome just shows again next time.
    }
  };

  return (
    <section className="card welcome">
      <h2 className="welcome-title">{t.welcome.title}</h2>
      <p>{t.welcome.text}</p>
      <div className="welcome-actions">
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            dismiss();
            onOpenPrices();
          }}
        >
          {t.welcome.openPrices}
        </button>
        <button type="button" onClick={dismiss}>
          {t.welcome.dismiss}
        </button>
      </div>
    </section>
  );
}
