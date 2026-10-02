// Thin wrapper around the browser's Web Speech API (SpeechRecognition).
// Browsers stop recognition after silence or a time limit, so while the user
// wants to listen, the listener restarts it automatically.

/** Recognition languages offered in the app, as BCP 47 tags. */
export const RECOGNITION_LANGUAGES = [
  { tag: 'he-IL', name: 'עברית' },
  { tag: 'ru-RU', name: 'Русский' },
  { tag: 'en-US', name: 'English' },
] as const;

export type RecognitionLanguageTag = (typeof RECOGNITION_LANGUAGES)[number]['tag'];

export const DEFAULT_RECOGNITION_LANGUAGE: RecognitionLanguageTag = 'he-IL';

export interface RecognitionAlternative {
  transcript: string;
  confidence: number;
}

export interface SpeechListenerEvents {
  onListeningChange: (listening: boolean) => void;
  onInterim: (text: string) => void;
  /**
   * A finished phrase. `unconfirmed` is true when the recognizer stopped before
   * finalizing it and we kept the last in-progress text instead of losing it.
   */
  onFinal: (alternatives: RecognitionAlternative[], lang: string, unconfirmed: boolean) => void;
  onError: (code: string) => void;
  /** Low-level recognizer events, for diagnosing browser differences. */
  onDebug?: (message: string) => void;
}

// Minimal typings: the Web Speech API is not in every TypeScript DOM lib version.
interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: SpeechRecognitionResultLike };
}
interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function isSpeechRecognitionSupported(): boolean {
  return getRecognitionConstructor() !== undefined;
}

/** Errors after which restarting is pointless until the user acts. */
const FATAL_ERRORS = new Set([
  'not-allowed',
  'service-not-allowed',
  'language-not-supported',
  'audio-capture',
]);

/** Errors that are part of normal operation and need no message. */
const SILENT_ERRORS = new Set(['no-speech', 'aborted']);

const RESTART_DELAY_MS = 250;
const RESTART_WINDOW_MS = 10_000;
const MAX_RESTARTS_IN_WINDOW = 6;
/** If the browser never reports `end` after stop(), release the session anyway. */
const STOP_TIMEOUT_MS = 1500;

/** One recognizer run, from start() until `end`. Browsers end runs on silence or time limits. */
interface Session {
  readonly recognition: SpeechRecognitionLike;
  readonly lang: string;
  /** Started directly by a tap. iPhone may refuse runs that were not. */
  readonly userInitiated: boolean;
  pendingInterim: string;
}

export class SpeechListener {
  private session: Session | null = null;
  private wantsToListen = false;
  private lang: string = DEFAULT_RECOGNITION_LANGUAGE;
  private restartTimes: number[] = [];
  private restartTimer: number | undefined;

  constructor(private readonly events: SpeechListenerEvents) {}

  /** Must be called from a tap handler: iPhone only allows starting from a user gesture. */
  start(lang: string): void {
    window.clearTimeout(this.restartTimer);
    // Some browsers skip `end` after an error, leaving a dead session behind. Drop it
    // (with wantsToListen off, so it isn't restarted).
    this.wantsToListen = false;
    if (this.session) this.endSession(this.session, { abort: true });
    this.lang = lang;
    this.wantsToListen = true;
    this.restartTimes = [];
    this.events.onListeningChange(true);
    this.startSession(true);
  }

  stop(): void {
    this.wantsToListen = false;
    window.clearTimeout(this.restartTimer);
    const session = this.session;
    if (!session) {
      this.events.onListeningChange(false);
      return;
    }
    // stop() (unlike abort()) still delivers the final result for speech in progress.
    try {
      session.recognition.stop();
    } catch {
      // Already stopped.
    }
    window.setTimeout(() => this.endSession(session, { abort: true }), STOP_TIMEOUT_MS);
  }

  private debug(message: string): void {
    this.events.onDebug?.(message);
  }

  private startSession(userInitiated: boolean): void {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      this.wantsToListen = false;
      this.events.onListeningChange(false);
      this.events.onError('unsupported');
      return;
    }

    const recognition = new Recognition();
    const session: Session = { recognition, lang: this.lang, userInitiated, pendingInterim: '' };
    recognition.lang = session.lang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 5;

    // Events from a session we've already dropped must not affect the current one.
    const isCurrent = () => this.session === session;

    // Some Android versions re-deliver the same final result, while Safari may reuse
    // an index for a new phrase. Skip a final only if both index and text repeat.
    const emittedFinals = new Map<number, string>();

    recognition.onstart = () => {
      this.debug(`start ${session.lang}${userInitiated ? ' (tap)' : ' (auto)'}${isCurrent() ? '' : ' [stale]'}`);
    };

    recognition.onresult = (event) => {
      if (!isCurrent()) return;
      this.debug(`result index=${event.resultIndex} count=${event.results.length}`);
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0].transcript.trim();
          if (emittedFinals.get(i) === text) continue;
          emittedFinals.set(i, text);
          const alternatives: RecognitionAlternative[] = [];
          for (let a = 0; a < result.length; a++) {
            alternatives.push({ transcript: result[a].transcript.trim(), confidence: result[a].confidence });
          }
          if (alternatives.some((alt) => alt.transcript)) this.events.onFinal(alternatives, session.lang, false);
        } else {
          interim += result[0].transcript;
        }
      }
      session.pendingInterim = interim.trim();
      this.events.onInterim(session.pendingInterim);
    };

    recognition.onerror = (event) => {
      this.debug(`error ${event.error}${isCurrent() ? '' : ' [stale]'}`);
      if (!isCurrent() || SILENT_ERRORS.has(event.error)) return;
      if (event.error === 'not-allowed' && !userInitiated) {
        // iPhone refuses automatic restarts without a tap. Not a real permission problem.
        this.wantsToListen = false;
        this.events.onError('restart-needs-tap');
        this.endSession(session, { abort: true });
      } else if (FATAL_ERRORS.has(event.error)) {
        this.wantsToListen = false;
        this.events.onError(event.error);
        this.endSession(session, { abort: true });
      } else {
        this.events.onError(event.error);
      }
    };

    recognition.onend = () => {
      this.debug(`end${isCurrent() ? '' : ' [stale]'}`);
      this.endSession(session, { abort: false });
    };

    this.session = session;
    try {
      recognition.start();
    } catch (error) {
      const name = error instanceof Error ? error.name : 'start-failed';
      this.debug(`start threw ${name}`);
      this.session = null;
      this.wantsToListen = false;
      this.events.onListeningChange(false);
      this.events.onError(name);
    }
  }

  /** Releases a session exactly once, keeps any unfinished phrase, and restarts if still listening. */
  private endSession(session: Session, { abort }: { abort: boolean }): void {
    if (this.session !== session) return;
    this.session = null;
    if (abort) {
      try {
        session.recognition.abort();
      } catch {
        // Already ended.
      }
    }
    if (session.pendingInterim) {
      this.debug(`kept unfinalized "${session.pendingInterim}"`);
      this.events.onFinal([{ transcript: session.pendingInterim, confidence: 0 }], session.lang, true);
      session.pendingInterim = '';
    }
    this.events.onInterim('');
    if (this.wantsToListen && this.allowRestart()) {
      this.restartTimer = window.setTimeout(() => {
        if (this.wantsToListen && !this.session) this.startSession(false);
      }, RESTART_DELAY_MS);
    } else {
      this.wantsToListen = false;
      this.events.onListeningChange(false);
    }
  }

  /** Guards against an endless restart loop when the recognizer keeps ending immediately. */
  private allowRestart(): boolean {
    const now = Date.now();
    this.restartTimes = this.restartTimes.filter((time) => now - time < RESTART_WINDOW_MS);
    if (this.restartTimes.length >= MAX_RESTARTS_IN_WINDOW) {
      this.events.onError('too-many-restarts');
      return false;
    }
    this.restartTimes.push(now);
    return true;
  }
}
