// Prototype screen: shows exactly what the speech recognizer hears, so we can
// design flower-name matching around real output from real phones.

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import type { Messages } from '../i18n/en';
import { isStandalone } from '../platform';
import {
  DEFAULT_RECOGNITION_LANGUAGE,
  RECOGNITION_LANGUAGES,
  SpeechListener,
  isSpeechRecognitionSupported,
  type RecognitionAlternative,
  type RecognitionLanguageTag,
} from '../speech/speechListener';
import { APP_VERSION } from '../version';

interface HeardResult {
  id: number;
  /** Web Speech API, the phone keyboard's own dictation, or on-device Whisper. */
  source: 'speech' | 'keyboard' | 'whisper';
  lang: string;
  alternatives: RecognitionAlternative[];
  unconfirmed: boolean;
}

type MicCheck = { ok: true } | { ok: false; reason: string };

/** Keeps the diagnostic log from growing without bound during long sessions. */
const MAX_LOG_LINES = 300;

/** Example phrases to dictate. They stay in Hebrew in every UI language: that's what we're testing. */
const TRY_EXAMPLES: { label: keyof Messages['tryLabels']; example: string }[] = [
  { label: 'hebrewOnly', example: 'שלוש הידרנגאה, שתי חרציות ענף, ארבע ליזיאנטוס' },
  { label: 'russianNames', example: 'חמישה эвкалипт, שלוש гортензии, שתיים эустома' },
  { label: 'englishNames', example: 'שתיים lisianthus, ארבע eucalyptus, שלוש roses' },
  { label: 'lumpSum', example: 'כל הירוק ארבעים שקל' },
  { label: 'correction', example: 'שלוש הידרנגאה… לא, ארבע הידרנגאה' },
];

const RECOGNITION_LANGUAGE_KEY = 'recognition-language';

function loadRecognitionLanguage(): RecognitionLanguageTag {
  try {
    const saved = localStorage.getItem(RECOGNITION_LANGUAGE_KEY);
    const match = RECOGNITION_LANGUAGES.find((language) => language.tag === saved);
    if (match) return match.tag;
  } catch {
    // Storage unavailable: use the default.
  }
  return DEFAULT_RECOGNITION_LANGUAGE;
}

function saveRecognitionLanguage(tag: RecognitionLanguageTag): void {
  try {
    localStorage.setItem(RECOGNITION_LANGUAGE_KEY, tag);
  } catch {
    // Not critical.
  }
}

function errorMessage(code: string, t: Messages): string {
  switch (code) {
    case 'not-allowed':
      return t.errors.notAllowed;
    case 'service-not-allowed':
      return t.errors.serviceNotAllowed;
    case 'network':
      return t.errors.network;
    case 'language-not-supported':
      return t.errors.languageNotSupported;
    case 'audio-capture':
      return t.errors.audioCapture;
    case 'too-many-restarts':
      return t.errors.tooManyRestarts;
    case 'restart-needs-tap':
      return t.errors.restartNeedsTap;
    case 'unsupported':
      return t.unsupported;
    default:
      return t.errors.generic(code);
  }
}

function formatConfidence(confidence: number): string {
  // Some browsers report 0 when they don't provide a confidence score.
  return confidence > 0 ? `${Math.round(confidence * 100)}%` : '—';
}

/** Plain-text report the tester can paste back to the developer. */
function buildReport(results: HeardResult[], log: string[]): string {
  const lines = [
    `Bouquet Calculator speech test ${APP_VERSION}`,
    `Date: ${new Date().toISOString()}`,
    `Installed: ${isStandalone() ? 'yes' : 'no'}`,
    `Device languages: ${(navigator.languages ?? [navigator.language]).join(', ')}`,
    `Device: ${navigator.userAgent}`,
    '',
  ];
  results.forEach((result, index) => {
    const [best, ...others] = result.alternatives;
    const flag = result.unconfirmed ? ' [unfinalized]' : '';
    const tag = result.source === 'keyboard' ? 'keyboard' : result.lang;
    lines.push(`${index + 1}. [${tag}] "${best.transcript}" (${formatConfidence(best.confidence)})${flag}`);
    for (const alt of others) {
      lines.push(`   alt: "${alt.transcript}" (${formatConfidence(alt.confidence)})`);
    }
  });
  lines.push('', 'Log:', ...log);
  return lines.join('\n');
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers: fall back to a temporary text area.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'absolute';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function SpeechTest() {
  const { t } = useI18n();
  const [supported] = useState(isSpeechRecognitionSupported);
  const [recognitionLanguage, setRecognitionLanguage] = useState(loadRecognitionLanguage);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [results, setResults] = useState<HeardResult[]>([]);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [micCheck, setMicCheck] = useState<MicCheck | null>(null);
  const [typed, setTyped] = useState('');
  const listenerRef = useRef<SpeechListener | null>(null);
  const nextIdRef = useRef(1);
  const logStartRef = useRef<number | null>(null);

  const addLog = (message: string) => {
    const now = Date.now();
    logStartRef.current ??= now;
    const line = `${((now - logStartRef.current) / 1000).toFixed(1)}s ${message}`;
    setLog((previous) => [...previous, line].slice(-MAX_LOG_LINES));
  };

  const logMicPermission = () => {
    navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((status) => addLog(`mic permission: ${status.state}`))
      .catch(() => addLog('mic permission: unknown'));
  };

  if (!listenerRef.current) {
    listenerRef.current = new SpeechListener({
      onListeningChange: setListening,
      onInterim: setInterim,
      onFinal: (alternatives, lang, unconfirmed) => {
        const result: HeardResult = { id: nextIdRef.current++, source: 'speech', lang, alternatives, unconfirmed };
        setResults((previous) => [result, ...previous]);
      },
      onError: setErrorCode,
      onDebug: addLog,
    });
  }

  useEffect(() => () => listenerRef.current?.stop(), []);

  const toggleListening = () => {
    if (listening) {
      addLog('tap: stop');
      listenerRef.current?.stop();
    } else {
      addLog(`tap: start ${recognitionLanguage}`);
      logMicPermission();
      setErrorCode(null);
      listenerRef.current?.start(recognitionLanguage);
    }
  };

  /** Tests plain microphone access, separately from the speech recognition service. */
  const checkMicrophone = async () => {
    addLog('tap: mic check');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      addLog('getUserMedia: ok');
      setMicCheck({ ok: true });
    } catch (error) {
      const reason = error instanceof Error ? error.name : String(error);
      addLog(`getUserMedia: ${reason}`);
      setMicCheck({ ok: false, reason });
    }
    logMicPermission();
  };

  const addTyped = () => {
    const text = typed.trim();
    if (!text) return;
    addLog(`keyboard: "${text}"`);
    const result: HeardResult = {
      id: nextIdRef.current++,
      source: 'keyboard',
      lang: 'keyboard',
      alternatives: [{ transcript: text, confidence: 0 }],
      unconfirmed: false,
    };
    setResults((previous) => [result, ...previous]);
    setTyped('');
  };

  const changeRecognitionLanguage = (tag: RecognitionLanguageTag) => {
    setRecognitionLanguage(tag);
    saveRecognitionLanguage(tag);
    if (listening) {
      // Restart with the new language right away: iPhone only allows starting from a user action.
      listenerRef.current?.start(tag);
    }
  };

  // Oldest first in the report, newest first on screen.
  const report = () => buildReport([...results].reverse(), log);

  const clearResults = () => {
    setResults([]);
    setLog([]);
    logStartRef.current = null;
  };

  const sendResults = async () => {
    try {
      await navigator.share({ text: report() });
    } catch {
      // The user closed the share sheet; nothing to do.
    }
  };

  const copyResults = async () => {
    if (await copyText(report())) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!supported) {
    return <p className="notice notice-danger">{t.unsupported}</p>;
  }

  return (
    <div className="speech-test">
      <label className="field">
        <span className="field-label">{t.recognitionLanguage}</span>
        <select
          value={recognitionLanguage}
          onChange={(event) => changeRecognitionLanguage(event.target.value as RecognitionLanguageTag)}
        >
          {RECOGNITION_LANGUAGES.map((language) => (
            <option key={language.tag} value={language.tag}>
              {language.name}
            </option>
          ))}
        </select>
      </label>

      <div className="mic-area">
        <button
          type="button"
          className={`mic-button${listening ? ' is-listening' : ''}`}
          onClick={toggleListening}
          aria-label={listening ? t.stopListening : t.startListening}
          aria-pressed={listening}
        >
          <MicIcon />
        </button>
        <p className="mic-status" aria-live="polite">
          {listening ? t.listening : t.tapToStart}
        </p>
      </div>

      {errorCode && (
        <p className={errorCode === 'restart-needs-tap' ? 'notice' : 'notice notice-danger'}>
          {errorMessage(errorCode, t)}
        </p>
      )}

      <section className="card">
        <h2 className="card-title">{t.keyboardTitle}</h2>
        <p className="muted small">{t.keyboardHint}</p>
        <textarea
          className="typed"
          rows={3}
          dir="auto"
          value={typed}
          placeholder={t.keyboardPlaceholder}
          onChange={(event) => setTyped(event.target.value)}
        />
        <button type="button" onClick={addTyped}>
          {t.add}
        </button>
      </section>

      <section className="card interim" aria-live="polite">
        <h2 className="card-title">{t.hearingNow}</h2>
        <p className="interim-text" dir="auto">
          {interim || '…'}
        </p>
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">{t.results}</h2>
          {(results.length > 0 || log.length > 0) && (
            <div className="card-actions">
              {'share' in navigator && (
                <button type="button" onClick={sendResults}>
                  {t.sendResults}
                </button>
              )}
              <button type="button" onClick={copyResults}>
                {copied ? t.copied : t.copyResults}
              </button>
              <button type="button" onClick={clearResults}>
                {t.clear}
              </button>
            </div>
          )}
        </div>
        {results.length === 0 ? (
          <p className="muted">{t.noResultsYet}</p>
        ) : (
          <ol className="results">
            {results.map((result) => {
              const [best, ...others] = result.alternatives;
              return (
                <li key={result.id} className="result">
                  <p className="result-main" dir="auto">
                    {best.transcript}
                    <span className="confidence">
                      {result.source === 'keyboard'
                        ? t.keyboardSource
                        : result.source === 'whisper'
                          ? result.lang
                          : result.unconfirmed
                          ? t.unfinalized
                          : formatConfidence(best.confidence)}
                    </span>
                  </p>
                  {others.length > 0 && (
                    <details>
                      <summary>{t.otherOptions}</summary>
                      <ul className="alternatives">
                        {others.map((alt, index) => (
                          <li key={index} dir="auto">
                            {alt.transcript}
                            <span className="confidence">{formatConfidence(alt.confidence)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <details className="card log">
        <summary>{t.technicalLog}</summary>
        <div className="log-body">
          <button type="button" onClick={checkMicrophone}>
            {t.checkMicrophone}
          </button>
          {micCheck && (
            <p className={micCheck.ok ? 'notice' : 'notice notice-danger'}>
              {micCheck.ok ? t.micWorks : t.micFailed(micCheck.reason)}
            </p>
          )}
          {log.length > 0 && <pre dir="ltr">{log.join('\n')}</pre>}
        </div>
      </details>

      <section className="card">
        <h2 className="card-title">{t.tryTitle}</h2>
        <ul className="try-list">
          {TRY_EXAMPLES.map((item) => (
            <li key={item.label}>
              <span className="muted">{t.tryLabels[item.label]}</span>
              <span className="try-example" dir="rtl">
                {item.example}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="44" height="44" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}
