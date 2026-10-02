// Messages between the app and the Whisper worker.

export type WhisperRequest =
  | { type: 'load'; id: number; modelId: string }
  | { type: 'transcribe'; id: number; audio: Float32Array; language: string | null; hints: string[] };

export type WhisperResponse =
  | { type: 'progress'; file: string; loaded: number; total: number }
  | { type: 'ready'; id: number }
  | { type: 'result'; id: number; text: string; language: string; hintTokens: number; ms: number }
  | { type: 'error'; id: number; message: string };

export interface WhisperTranscript {
  text: string;
  /** Language the model transcribed in (ISO code, e.g. "he"). */
  language: string;
  /** How many hint tokens were given to the model (0 = no hints). */
  hintTokens: number;
  /** Recognition time in milliseconds. */
  ms: number;
}
