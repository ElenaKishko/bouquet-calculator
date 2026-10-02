// Settings → speech check: record a phrase, see exactly what Whisper heard, listen to
// the recording, and send a report. Used to diagnose recognition on a specific phone.

import { useRef, useState } from 'react';
import { saveFile } from '../files';
import { useI18n } from '../i18n';
import { displayName } from '../model/items';
import { buildNameIndex, parseBouquet } from '../model/parseBouquet';
import { AudioRecorder, playRecording, type RecordingInfo } from '../speech/audioRecorder';
import { useRecognition } from '../speech/RecognitionProvider';
import type { WhisperTranscript } from '../speech/whisperProtocol';
import { useAppStore } from '../store/AppStore';
import { APP_VERSION } from '../version';

interface CheckResult {
  transcript: WhisperTranscript;
  audio: Float32Array;
  info: RecordingInfo | null;
  /** Loudest sample, 0…1. */
  peak: number;
  rawAudio: boolean;
}

const MAX_SECONDS = 28;

export function SpeechCheck() {
  const { t, locale } = useI18n();
  const { items, settings } = useAppStore();
  const recognition = useRecognition();
  const [phase, setPhase] = useState<'idle' | 'recording' | 'recognizing'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [rawAudio, setRawAudio] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  const start = async () => {
    setError(null);
    setResult(null);
    const recorder = new AudioRecorder();
    try {
      await recorder.start({ rawAudio });
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
      if (elapsed >= MAX_SECONDS) void stop();
    }, 250);
  };

  const stop = async () => {
    window.clearInterval(timerRef.current);
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) return;
    setPhase('recognizing');
    try {
      const audio = await recorder.stop();
      // Keep our own copy: the recording is handed over to the recognizer.
      const copy = audio.slice();
      let peak = 0;
      for (const sample of copy) peak = Math.max(peak, Math.abs(sample));
      const transcript = await recognition.transcribe(audio);
      setResult({ transcript, audio: copy, info: recorder.lastInfo, peak, rawAudio });
    } catch (checkError) {
      setError(t.calculator.recognitionError(checkError instanceof Error ? checkError.message : String(checkError)));
    }
    setPhase('idle');
  };

  const parsed = result ? parseBouquet(result.transcript.text, buildNameIndex(items)) : null;
  const byId = new Map(items.map((item) => [item.id, item]));
  const matched =
    parsed?.ops.flatMap((op) =>
      op.kind === 'set' || op.kind === 'add'
        ? [`${displayName(byId.get(op.itemId)!, locale)} × ${op.quantity}${op.unit === 'pack' ? ` ${t.common.packUnit}` : ''}`]
        : op.kind === 'lump'
          ? [`${op.label === 'greenery' ? t.calculator.lumpGreenery : t.calculator.lumpExtra}: ${op.amount}`]
          : [],
    ) ?? [];

  const report = () => {
    if (!result) return '';
    const { transcript, info, peak } = result;
    const mic = info?.microphone ?? {};
    return [
      `Bouquet Price speech check ${APP_VERSION}`,
      `Date: ${new Date().toISOString()}`,
      `Device: ${navigator.userAgent}`,
      `Speech language: ${settings.whisperLanguage} (model detected: ${transcript.language}) | Model: ${settings.whisperModel} | Hint tokens: ${transcript.hintTokens}`,
      `Recognition time: ${(transcript.ms / 1000).toFixed(1)} s`,
      `Audio: ${(result.audio.length / 16000).toFixed(1)} s, peak ${Math.round(peak * 100)}%, ${info?.mimeType ?? '?'}, ${info?.inputSampleRate ?? '?'} Hz`,
      `Microphone: raw=${result.rawAudio} echoCancellation=${mic.echoCancellation} noiseSuppression=${mic.noiseSuppression} autoGainControl=${mic.autoGainControl} sampleRate=${mic.sampleRate}`,
      `Heard: "${transcript.text}"`,
      `Matched: ${matched.join('; ') || '—'}`,
      `Unknown: ${parsed?.unknown.join('; ') || '—'}`,
    ].join('\n');
  };

  const sendReport = async () => {
    const text = report();
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      await saveFile(new Blob([text], { type: 'text/plain' }), 'speech-check.txt');
    }
  };

  if (recognition.status !== 'ready') {
    return <p className="muted small">{t.check.needModel}</p>;
  }

  return (
    <section className="card speech-check">
      <h2 className="card-title">{t.check.title}</h2>
      <p className="muted small">{t.check.hint}</p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={rawAudio}
          disabled={phase !== 'idle'}
          onChange={(event) => setRawAudio(event.target.checked)}
        />
        <span>{t.check.rawAudio}</span>
      </label>
      <button
        type="button"
        className={`primary-button${phase === 'recording' ? ' is-recording' : ''}`}
        disabled={phase === 'recognizing'}
        onClick={phase === 'recording' ? () => void stop() : () => void start()}
      >
        {phase === 'recording'
          ? `${t.calculator.stop} · ${seconds} s`
          : phase === 'recognizing'
            ? t.calculator.recognizing
            : t.check.record}
      </button>
      {error && <p className="notice notice-danger">{error}</p>}
      {result && (
        <div className="check-result">
          <p className="muted small">{t.check.heard}</p>
          <p className="check-heard" dir="auto">
            {result.transcript.text || '—'}
          </p>
          <p className="muted small">{t.check.matched}</p>
          <p dir="auto">{matched.join(', ') || '—'}</p>
          {parsed && parsed.unknown.length > 0 && (
            <p className="small" dir="auto">
              {t.calculator.notRecognized}: {parsed.unknown.join(', ')}
            </p>
          )}
          <p className="muted small">
            {t.check.details(
              settings.whisperLanguage,
              (result.transcript.ms / 1000).toFixed(1),
              Math.round(result.peak * 100),
            )}
          </p>
          <div className="actions-row">
            <button type="button" onClick={() => void playRecording(result.audio)}>
              ▶ {t.check.listen}
            </button>
            <button type="button" onClick={() => void sendReport()}>
              {t.check.sendReport}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
