// Main screen (SPEC §7): dictate the bouquet, see the list and the total.
// Shows sale prices only — the customer may see this screen.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ItemPhoto } from '../components/ItemPhoto';
import { BouquetHistory } from '../components/BouquetHistory';
import { ItemPicker } from '../components/ItemPicker';
import { WelcomeCard } from '../components/WelcomeCard';
import { Sheet } from '../components/Sheet';
import { ItemEditor } from './ItemEditor';
import { useI18n } from '../i18n';
import {
  applyOps,
  EMPTY_BOUQUET,
  priceBouquet,
  removeLump,
  lineUnit,
  setQuantity,
  switchUnit,
  type Bouquet,
  type LineUnit,
} from '../model/bouquet';
import { addToHistory, loadHistory, saveHistory, toBouquet, type HistoryEntry } from '../model/history';
import { displayName } from '../model/items';
import { buildNameIndex, parseBouquet } from '../model/parseBouquet';
import { needsStemsPerBunch, salePricePerPack, salePricePerStem } from '../model/pricing';
import type { Item } from '../model/types';
import { AudioRecorder } from '../speech/audioRecorder';
import { useRecognition } from '../speech/RecognitionProvider';
import { clearJustUpdated, wasJustUpdated } from '../pwaUpdate';
import { useAppStore } from '../store/AppStore';
import { useMoney } from '../useMoney';

const BOUQUET_KEY = 'current-bouquet';
/** Whisper hears at most 30 seconds at a time. */
const MAX_RECORDING_SECONDS = 28;

/** The last phrase, kept so it can be re-read after the florist teaches a new word. */
interface Utterance {
  before: Bouquet;
  text: string;
  unknown: string[];
}

/** Loudest 50 ms stretch below this level means nobody spoke (Whisper's input is -1…1). */
const SPEECH_LEVEL = 0.01;

function isSilent(audio: Float32Array): boolean {
  const frame = 800; // 50 ms at 16 kHz
  for (let start = 0; start < audio.length; start += frame) {
    let sum = 0;
    const end = Math.min(audio.length, start + frame);
    for (let i = start; i < end; i++) sum += audio[i] * audio[i];
    if (Math.sqrt(sum / (end - start)) >= SPEECH_LEVEL) return false;
  }
  return true;
}

function loadBouquet(): Bouquet {
  try {
    const saved = localStorage.getItem(BOUQUET_KEY);
    if (saved) return JSON.parse(saved) as Bouquet;
  } catch {
    // Start with an empty bouquet.
  }
  return EMPTY_BOUQUET;
}

type Phase = 'idle' | 'recording' | 'recognizing';

export function CalculatorScreen({ onOpenPrices }: { onOpenPrices: () => void }) {
  const { t, locale } = useI18n();
  const { items, settings, learnAlias } = useAppStore();
  const recognition = useRecognition();
  const { money } = useMoney();
  const [bouquet, setBouquet] = useState<Bouquet>(loadBouquet);
  const [utterance, setUtterance] = useState<Utterance | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'learn'; fragment: string } | null>(null);
  /** An item bought by the pack, picked to add: ask whether to add stems or a pack. */
  const [unitChoice, setUnitChoice] = useState<Item | null>(null);
  /** Item whose price is being fixed on the fly, right from the bouquet. */
  const [editing, setEditing] = useState<Item | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  /** Number of the bouquet on screen if it was brought back from the history (it keeps it when saved again). */
  const [restoredNumber, setRestoredNumber] = useState<number | undefined>(undefined);

  useEffect(() => saveHistory(history), [history]);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    try {
      localStorage.setItem(BOUQUET_KEY, JSON.stringify(bouquet));
    } catch {
      // Not critical: the bouquet just won't survive a reload.
    }
  }, [bouquet]);

  useEffect(
    () => () => {
      window.clearInterval(timerRef.current);
      recorderRef.current?.cancel();
    },
    [],
  );

  // While recording, a sideways swipe must not switch tabs (that would cancel the recording).
  useEffect(() => {
    document.body.dataset.recording = String(phase === 'recording');
    return () => {
      document.body.dataset.recording = 'false';
    };
  }, [phase]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const index = useMemo(() => buildNameIndex(items), [items]);
  const priced = useMemo(() => priceBouquet(bouquet, items, settings), [bouquet, items, settings]);
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  // Recording ends in a timer callback; it must see the current bouquet and model, not the ones from when it started.
  const latest = useRef({ bouquet, index, transcribe: recognition.transcribe });
  useEffect(() => {
    latest.current = { bouquet, index, transcribe: recognition.transcribe };
  });

  const handleText = (text: string) => {
    const { bouquet: current, index: currentIndex } = latest.current;
    const result = parseBouquet(text, currentIndex);
    setUtterance({ before: current, text, unknown: result.unknown });
    setBouquet(applyOps(current, result.ops));
  };

  const startRecording = async () => {
    setError(null);
    const recorder = new AudioRecorder();
    try {
      await recorder.start();
    } catch {
      setError(t.calculator.micError);
      return;
    }
    recorderRef.current = recorder;
    setSeconds(0);
    setPhase('recording');
    const started = Date.now();
    timerRef.current = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      setSeconds(elapsed);
      if (elapsed >= MAX_RECORDING_SECONDS) void stopRecording();
    }, 250);
  };

  const stopRecording = async () => {
    window.clearInterval(timerRef.current);
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) return;
    setPhase('recognizing');
    try {
      const audio = await recorder.stop();
      if (isSilent(audio)) {
        // Whisper invents phrases from silence; don't let that reach the bouquet.
        setError(t.calculator.noSpeech);
      } else {
        const result = await latest.current.transcribe(audio);
        if (result.text) handleText(result.text);
      }
    } catch (recognitionError) {
      setError(
        t.calculator.recognitionError(
          recognitionError instanceof Error ? recognitionError.message : String(recognitionError),
        ),
      );
    }
    setPhase('idle');
  };

  const countTyped = () => {
    if (!typed.trim()) return;
    handleText(typed);
    setTyped('');
  };

  /** The florist says what an unrecognized word was: remember it and re-read the phrase. */
  const teach = (fragment: string, item: Item) => {
    learnAlias(item.id, fragment);
    if (utterance) {
      const taught = items.map((entry) =>
        entry.id === item.id ? { ...entry, aliases: [...entry.aliases, fragment] } : entry,
      );
      const result = parseBouquet(utterance.text, buildNameIndex(taught));
      setUtterance({ ...utterance, unknown: result.unknown });
      setBouquet(applyOps(utterance.before, result.ops));
    }
    setNotice(t.calculator.learned(fragment, displayName(item, locale)));
  };

  const addManually = (item: Item, unit: LineUnit) => {
    const existing = bouquet.lines.find((line) => line.itemId === item.id && lineUnit(line) === unit);
    setBouquet(setQuantity(bouquet, item.id, (existing?.quantity ?? 0) + 1, unit));
  };

  const priceLabel = (price: number | null) => (price == null ? t.common.noPrice : money(price));

  /** Saves the current bouquet to "Recent bouquets" (if there is one) and starts an empty one. */
  const newBouquet = () => {
    if (bouquet.lines.length || bouquet.lumps.length) {
      setHistory((previous) => addToHistory(previous, bouquet, priced, new Date(), restoredNumber));
    }
    setRestoredNumber(undefined);
    setBouquet(EMPTY_BOUQUET);
    setUtterance(null);
    setError(null);
  };

  /** Back to the calculator to fix something; the bouquet on screen is saved first. */
  const restoreFromHistory = (entry: HistoryEntry) => {
    setHistory((previous) => {
      // Save the bouquet on screen while the restored one is still listed, so their numbers can't clash.
      const withCurrent =
        bouquet.lines.length || bouquet.lumps.length
          ? addToHistory(previous, bouquet, priced, new Date(), restoredNumber)
          : previous;
      return withCurrent.filter((saved) => saved.id !== entry.id);
    });
    setRestoredNumber(entry.number);
    setBouquet(toBouquet(entry));
    setUtterance(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const modelReady = recognition.status === 'ready';
  useEffect(() => {
    if (modelReady) clearJustUpdated();
  }, [modelReady]);
  const isEmpty = bouquet.lines.length === 0 && bouquet.lumps.length === 0;

  return (
    <div className="screen calculator">
      <WelcomeCard onOpenPrices={onOpenPrices} />
      {!modelReady && recognition.downloadedBefore && recognition.status === 'loading' ? (
        // The model is only being read from the phone: a short word instead of the download explanation.
        <p className="muted loading-line" aria-live="polite">
          {wasJustUpdated() ? t.calculator.updating : t.calculator.loading}
        </p>
      ) : (
        !modelReady && (
          <section className="card model-card">
            <p>{t.calculator.modelNeeded}</p>
            {recognition.status === 'loading' ? (
              <>
                <p className="muted">
                  {recognition.progress > 0 && recognition.progress < 1
                    ? t.calculator.downloading(Math.round(recognition.progress * 100))
                    : t.calculator.preparing}
                </p>
                <progress
                  className="progress"
                  max={1}
                  value={recognition.progress > 0 ? recognition.progress : undefined}
                />
              </>
            ) : (
              <button type="button" className="primary-button" onClick={() => void recognition.load()}>
                {t.calculator.download}
              </button>
            )}
            {recognition.error && <p className="notice notice-danger">{t.calculator.modelError(recognition.error)}</p>}
          </section>
        )
      )}

      <div className="record-area">
        <button
          type="button"
          className={`record-button${phase === 'recording' ? ' is-recording' : ''}`}
          onClick={phase === 'recording' ? stopRecording : startRecording}
          disabled={!modelReady || phase === 'recognizing'}
          aria-pressed={phase === 'recording'}
        >
          <MicIcon />
          <span>
            {phase === 'recording'
              ? t.calculator.stop
              : phase === 'recognizing'
                ? t.calculator.recognizing
                : t.calculator.record}
          </span>
        </button>
        {phase === 'recording' && (
          <p className="muted" aria-live="polite">
            {t.calculator.listening(seconds)}
          </p>
        )}
        <button type="button" className="link-button" onClick={() => setTyping(!typing)}>
          {t.calculator.typeInstead}
        </button>
      </div>

      {typing && (
        <div className="type-area">
          <textarea
            rows={2}
            dir="auto"
            value={typed}
            placeholder={t.calculator.typePlaceholder}
            onChange={(event) => setTyped(event.target.value)}
          />
          <button type="button" onClick={countTyped}>
            {t.calculator.count}
          </button>
        </div>
      )}

      {error && <p className="notice notice-danger">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {utterance && utterance.unknown.length > 0 && (
        <div className="unknown">
          <span className="muted small">{t.calculator.notRecognized}:</span>
          {utterance.unknown.map((fragment) => (
            <button
              key={fragment}
              type="button"
              className="chip"
              onClick={() => setPicker({ mode: 'learn', fragment })}
            >
              <span dir="auto">{fragment}</span> · {t.calculator.whatIsIt}
            </button>
          ))}
        </div>
      )}

      {isEmpty ? (
        <p className="muted empty-hint">{t.calculator.empty}</p>
      ) : (
        <section className="card bouquet">
          <ul className="bouquet-lines">
            {priced.lines.map((line) => {
              const item = byId.get(line.itemId);
              if (!item) return null;
              const unit = lineUnit(line);
              const priceText =
                line.unitPrice == null
                  ? unit === 'pack'
                    ? `${t.common.packUnit} · ${t.common.noPrice}`
                    : t.common.noPrice
                  : `${money(line.unitPrice)}${unit === 'pack' ? ` ${t.common.perPack}` : ''}`;
              return (
                <li key={`${line.itemId}:${unit}`} className="bouquet-line">
                  <button
                    type="button"
                    className="line-photo-button"
                    aria-label={t.calculator.editPrice(displayName(item, locale))}
                    onClick={() => setEditing(item)}
                  >
                    <ItemPhoto item={item} size="small" />
                  </button>
                  <div className="line-name">
                    <button type="button" className="line-name-button" onClick={() => setEditing(item)}>
                      {displayName(item, locale)}
                    </button>
                    {item.boughtAs === 'bunch' || unit === 'pack' ? (
                      // Packs and stems: tap to switch if the phrase was understood the other way.
                      <button
                        type="button"
                        className="unit-switch small"
                        aria-label={t.calculator.switchUnit}
                        onClick={() => setBouquet(switchUnit(bouquet, line.itemId, unit))}
                      >
                        {priceText} ⇄
                      </button>
                    ) : (
                      <span className="muted small">{priceText}</span>
                    )}
                  </div>
                  <div className="stepper">
                    <button
                      type="button"
                      aria-label={t.calculator.decrease}
                      onClick={() => setBouquet(setQuantity(bouquet, line.itemId, line.quantity - 1, unit))}
                    >
                      −
                    </button>
                    <span className="quantity">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label={t.calculator.increase}
                      onClick={() => setBouquet(setQuantity(bouquet, line.itemId, line.quantity + 1, unit))}
                    >
                      +
                    </button>
                  </div>
                  <span className="line-total">{line.total == null ? '' : money(line.total)}</span>
                </li>
              );
            })}
            {bouquet.lumps.map((lump) => (
              <li key={lump.label} className="bouquet-line lump-line">
                <div className="line-name">
                  <span>{lump.label === 'greenery' ? t.calculator.lumpGreenery : t.calculator.lumpExtra}</span>
                </div>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setBouquet(removeLump(bouquet, lump.label))}
                >
                  {t.calculator.remove}
                </button>
                <span className="line-total">{money(lump.amount)}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="add-line-button" onClick={() => setPicker({ mode: 'add' })}>
            + {t.calculator.addItem}
          </button>
          <div className="total">
            <span>{t.calculator.total}</span>
            <strong>{money(priced.total)}</strong>
          </div>
          {priced.unpricedCount > 0 && (
            <p className="notice notice-warning">{t.calculator.unpriced(priced.unpricedCount)}</p>
          )}
        </section>
      )}

      {!isEmpty && (
        <div className="actions-row">
          <button type="button" onClick={newBouquet}>
            {t.calculator.newBouquet}
          </button>
        </div>
      )}

      <BouquetHistory
        history={history}
        onRestore={restoreFromHistory}
        onDelete={(entry) => setHistory((previous) => previous.filter((saved) => saved.id !== entry.id))}
        onClear={() => setHistory([])}
      />

      {picker && (
        <ItemPicker
          title={picker.mode === 'learn' ? `«${picker.fragment}» — ${t.calculator.whatIsIt}` : t.calculator.addItem}
          onClose={() => setPicker(null)}
          onPick={(item) => {
            if (picker.mode === 'learn') teach(picker.fragment, item);
            else if (item.boughtAs === 'bunch') setUnitChoice(item);
            else addManually(item, 'stem');
            setPicker(null);
          }}
        />
      )}

      {editing && <ItemEditor item={editing} isNew={false} onClose={() => setEditing(null)} />}

      {unitChoice && (
        <Sheet title={displayName(unitChoice, locale)} onClose={() => setUnitChoice(null)}>
          <p className="muted">{t.calculator.chooseUnit}</p>
          <div className="unit-choice">
            <button
              type="button"
              onClick={() => {
                addManually(unitChoice, 'stem');
                setUnitChoice(null);
              }}
            >
              <span>{t.calculator.addStems}</span>
              <span className="muted small">{priceLabel(salePricePerStem(unitChoice, items, settings))}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                addManually(unitChoice, 'pack');
                setUnitChoice(null);
              }}
            >
              <span>{t.calculator.addPack}</span>
              <span className="muted small">{priceLabel(salePricePerPack(unitChoice, items, settings))}</span>
            </button>
          </div>
          {needsStemsPerBunch(unitChoice) && <p className="muted small">{t.calculator.stemsNeedCount}</p>}
        </Sheet>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="34"
      height="34"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}
