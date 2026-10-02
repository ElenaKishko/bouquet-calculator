// Main-thread side of the Whisper worker: request/response with promises.

import type { WhisperRequest, WhisperResponse, WhisperTranscript } from './whisperProtocol';

export const WHISPER_MODELS = {
  base: 'onnx-community/whisper-base',
  small: 'onnx-community/whisper-small',
} as const;

export type WhisperModelSize = keyof typeof WHISPER_MODELS;

type Pending = { resolve: (value: never) => void; reject: (error: Error) => void };

export class WhisperClient {
  private readonly worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private onProgress: ((fraction: number) => void) | null = null;
  private readonly fileProgress = new Map<string, { loaded: number; total: number }>();

  constructor() {
    this.worker.onmessage = (event: MessageEvent<WhisperResponse>) => this.handle(event.data);
    this.worker.onerror = (event) => {
      const error = new Error(event.message || 'Worker failed');
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    };
  }

  /** Downloads (first time) and prepares a model. `onProgress` gets 0…1. */
  load(size: WhisperModelSize, onProgress: (fraction: number) => void): Promise<void> {
    this.onProgress = onProgress;
    this.fileProgress.clear();
    return this.request<void>({ type: 'load', id: this.nextId++, modelId: WHISPER_MODELS[size] });
  }

  transcribe(audio: Float32Array, language: string | null, hints: readonly string[]): Promise<WhisperTranscript> {
    const id = this.nextId++;
    const message: WhisperRequest = { type: 'transcribe', id, audio, language, hints: [...hints] };
    return this.request<WhisperTranscript>(message, [audio.buffer]);
  }

  private request<T>(message: WhisperRequest, transfer: Transferable[] = []): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.set(message.id, { resolve: resolve as (value: never) => void, reject });
      this.worker.postMessage(message, transfer);
    });
  }

  private handle(message: WhisperResponse): void {
    if (message.type === 'progress') {
      this.fileProgress.set(message.file, { loaded: message.loaded, total: message.total });
      let loaded = 0;
      let total = 0;
      for (const file of this.fileProgress.values()) {
        loaded += file.loaded;
        total += file.total;
      }
      if (total > 0) this.onProgress?.(loaded / total);
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.type === 'error') {
      pending.reject(new Error(message.message));
    } else if (message.type === 'ready') {
      pending.resolve(undefined as never);
    } else {
      const { text, language, hintTokens, ms } = message;
      pending.resolve({ text, language, hintTokens, ms } as never);
    }
  }
}
