// Settings (SPEC §10): interface language, speech recognition, backup.

import { useState } from 'react';
import { pickFile, saveFile } from '../files';
import { LOCALE_NAMES, UI_LOCALES, useI18n } from '../i18n';
import { CURRENCIES, currencyName } from '../model/currency';
import type { Settings } from '../model/types';
import { useRecognition } from '../speech/RecognitionProvider';
import { useAppStore } from '../store/AppStore';
import { backupFileName, createBackup, readBackup } from '../store/backup';
import { APP_VERSION } from '../version';
import { SpeechTest } from './SpeechTest';

export function SettingsScreen() {
  const { t, locale, setLocale } = useI18n();
  const { settings, overrides, updateSettings, replaceAll } = useAppStore();
  const recognition = useRecognition();
  const [message, setMessage] = useState<{ text: string; danger?: boolean } | null>(null);
  const [diagnostics, setDiagnostics] = useState(false);

  const statusText = {
    ready: t.settings.statusReady,
    'not-downloaded': t.settings.statusNotDownloaded,
    loading: t.settings.statusLoading,
    error: t.settings.statusError,
  }[recognition.status];

  const saveBackup = async () => {
    await saveFile(await createBackup(overrides, settings), backupFileName());
  };

  const restoreBackup = async () => {
    const file = await pickFile('.json,application/json');
    if (!file || !window.confirm(t.settings.restoreConfirm)) return;
    try {
      const backup = await readBackup(file);
      replaceAll(backup.overrides, backup.settings);
      setMessage({ text: t.settings.restored });
    } catch (error) {
      setMessage({ text: t.settings.restoreFailed(error instanceof Error ? error.message : String(error)), danger: true });
    }
  };

  return (
    <div className="screen settings">
      <section className="card">
        <h2 className="card-title">{t.settings.language}</h2>
        <div className="segmented" role="group">
          {UI_LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              lang={code}
              aria-pressed={code === locale}
              onClick={() => {
                setLocale(code);
                // Speak in the interface language by default; it can still be changed below.
                updateSettings({ whisperLanguage: code });
              }}
            >
              {LOCALE_NAMES[code]}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">{t.settings.currency}</h2>
        <select
          value={settings.currency}
          onChange={(event) => updateSettings({ currency: event.target.value as Settings['currency'] })}
        >
          {CURRENCIES.map(({ code, symbol }) => (
            <option key={code} value={code}>
              {symbol} {currencyName(code, locale)}
            </option>
          ))}
        </select>
        <p className="muted small">{t.settings.currencyHint}</p>
      </section>

      <section className="card">
        <h2 className="card-title">{t.settings.recognition}</h2>
        <label className="field">
          <span className="field-label">{t.settings.spokenLanguage}</span>
          <select
            value={settings.whisperLanguage}
            onChange={(event) => updateSettings({ whisperLanguage: event.target.value as Settings['whisperLanguage'] })}
          >
            <option value="he">עברית</option>
            <option value="ru">Русский</option>
            <option value="en">English</option>
            <option value="auto">{t.settings.languageAuto}</option>
          </select>
        </label>
        <label className="field">
          <span className="field-label">{t.settings.model}</span>
          <select
            value={settings.whisperModel}
            disabled={recognition.status === 'loading'}
            onChange={(event) => updateSettings({ whisperModel: event.target.value as Settings['whisperModel'] })}
          >
            <option value="small">{t.settings.modelSmall}</option>
            <option value="base">{t.settings.modelBase}</option>
          </select>
        </label>
        <p className="status-line">
          <span className="muted">{t.settings.status}:</span> {statusText}
          {recognition.status === 'loading' && recognition.progress > 0 && recognition.progress < 1
            ? ` ${Math.round(recognition.progress * 100)}%`
            : ''}
        </p>
        {(recognition.status === 'not-downloaded' || recognition.status === 'error') && (
          <button type="button" className="primary-button" onClick={() => void recognition.load()}>
            {t.calculator.download}
          </button>
        )}
        {recognition.error && <p className="notice notice-danger">{t.calculator.modelError(recognition.error)}</p>}
      </section>

      <section className="card">
        <h2 className="card-title">{t.settings.backup}</h2>
        <p className="muted small">{t.settings.backupHint}</p>
        <div className="actions-row">
          <button type="button" onClick={() => void saveBackup()}>
            {t.settings.saveBackup}
          </button>
          <button type="button" onClick={() => void restoreBackup()}>
            {t.settings.restoreBackup}
          </button>
        </div>
        {message && <p className={message.danger ? 'notice notice-danger' : 'notice'}>{message.text}</p>}
      </section>

      <button type="button" className="link-button" onClick={() => setDiagnostics(!diagnostics)}>
        {diagnostics ? t.settings.hideDiagnostics : t.settings.diagnostics}
      </button>
      {diagnostics && <SpeechTest />}

      <p className="muted small version">{t.settings.version(APP_VERSION)}</p>
    </div>
  );
}
