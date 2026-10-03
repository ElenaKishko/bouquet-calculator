// Owns the Whisper model for the whole app: download once, then reuse on every screen.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAppStore } from '../store/AppStore';
import { buildHints } from './hints';
import { WhisperClient, type WhisperModelSize } from './whisperClient';
import type { WhisperTranscript } from './whisperProtocol';

export type ModelStatus = 'not-downloaded' | 'loading' | 'ready' | 'error';

interface RecognitionValue {
  status: ModelStatus;
  /** Download progress 0…1 while loading. */
  progress: number;
  error: string | null;
  /** The model was downloaded before, so loading only reads it from the phone. */
  downloadedBefore: boolean;
  load: () => Promise<void>;
  transcribe: (audio: Float32Array) => Promise<WhisperTranscript>;
}

const RecognitionContext = createContext<RecognitionValue | null>(null);

const downloadedKey = (model: WhisperModelSize) => `whisper-downloaded:${model}`;

function wasDownloaded(model: WhisperModelSize): boolean {
  try {
    return localStorage.getItem(downloadedKey(model)) === 'yes';
  } catch {
    return false;
  }
}

function markDownloaded(model: WhisperModelSize): void {
  try {
    localStorage.setItem(downloadedKey(model), 'yes');
  } catch {
    // Not critical: the model will just be offered for download again.
  }
}

export function RecognitionProvider({ children }: { children: ReactNode }) {
  const { ready: storeReady, items, settings } = useAppStore();
  // A model downloaded earlier is about to load from the phone: start in "loading", not "not downloaded".
  const [status, setStatus] = useState<ModelStatus>(() =>
    wasDownloaded('small') || wasDownloaded('base') ? 'loading' : 'not-downloaded',
  );
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<WhisperClient | null>(null);
  const loadedModelRef = useRef<WhisperModelSize | null>(null);
  const model = settings.whisperModel;

  const load = useCallback(async () => {
    clientRef.current ??= new WhisperClient();
    setStatus('loading');
    setProgress(0);
    setError(null);
    try {
      await clientRef.current.load(model, setProgress);
      loadedModelRef.current = model;
      markDownloaded(model);
      setStatus('ready');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
      setStatus('error');
    }
  }, [model]);

  // A first download must not be cut short by an automatic update reload (pwaUpdate.ts).
  useEffect(() => {
    document.body.dataset.downloading = String(status === 'loading' && !wasDownloaded(model));
  }, [status, model]);

  // A model downloaded before is in the browser cache: prepare it in the background.
  useEffect(() => {
    if (!storeReady || loadedModelRef.current === model) return;
    if (wasDownloaded(model)) {
      void load();
    } else {
      setStatus('not-downloaded');
    }
  }, [storeReady, model, load]);

  const transcribe = useCallback(
    (audio: Float32Array) => {
      if (!clientRef.current || status !== 'ready') return Promise.reject(new Error('Model is not ready'));
      const language = settings.whisperLanguage === 'auto' ? null : settings.whisperLanguage;
      return clientRef.current.transcribe(audio, language, buildHints(items, settings));
    },
    [status, items, settings],
  );

  const downloadedBefore = wasDownloaded(model);
  const value = useMemo(
    () => ({ status, progress, error, downloadedBefore, load, transcribe }),
    [status, progress, error, downloadedBefore, load, transcribe],
  );
  return <RecognitionContext.Provider value={value}>{children}</RecognitionContext.Provider>;
}

export function useRecognition(): RecognitionValue {
  const value = useContext(RecognitionContext);
  if (!value) throw new Error('useRecognition must be used inside RecognitionProvider');
  return value;
}
