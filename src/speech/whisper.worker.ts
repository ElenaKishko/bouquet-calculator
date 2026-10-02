/// <reference lib="webworker" />
// Runs Whisper speech recognition on the device, off the main thread.
// Models are downloaded from Hugging Face once and cached by the browser.

import {
  AutoProcessor,
  AutoTokenizer,
  WhisperForConditionalGeneration,
  env,
  type Tensor,
} from '@huggingface/transformers';
import type { WhisperRequest, WhisperResponse } from './whisperProtocol';

env.allowLocalModels = false;

type Processor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
type Tokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
type Model = Awaited<ReturnType<typeof WhisperForConditionalGeneration.from_pretrained>>;

interface Loaded {
  modelId: string;
  processor: Processor;
  tokenizer: Tokenizer;
  model: Model;
}

/** Whisper reads at most this many prompt tokens; keep room for the transcript. */
const MAX_HINT_TOKENS = 200;
const MAX_NEW_TOKENS = 128;

let loaded: Loaded | null = null;

const post = (message: WhisperResponse) => self.postMessage(message);

async function load(modelId: string): Promise<void> {
  if (loaded?.modelId === modelId) return;
  if (loaded) {
    await loaded.model.dispose();
    loaded = null;
  }
  const progress_callback = (info: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (info.status === 'progress' && info.file && info.total) {
      post({ type: 'progress', file: info.file, loaded: info.loaded ?? 0, total: info.total });
    }
  };
  const [processor, tokenizer, model] = await Promise.all([
    AutoProcessor.from_pretrained(modelId, { progress_callback }),
    AutoTokenizer.from_pretrained(modelId, { progress_callback }),
    // 8-bit weights: the smallest download that still runs well on the phone's CPU.
    WhisperForConditionalGeneration.from_pretrained(modelId, { dtype: 'q8', device: 'wasm', progress_callback }),
  ]);
  loaded = { modelId, processor, tokenizer, model };
}

function tokenId(tokenizer: Tokenizer, token: string): number {
  const id = tokenizer.convert_tokens_to_ids(token) as unknown as number | null | undefined;
  if (id == null) throw new Error(`Unknown token ${token}`);
  return id;
}

/** Previous-text prompt: Whisper treats it as what was said before and favors these words. */
function hintTokens(tokenizer: Tokenizer, hints: string[]): number[] {
  if (hints.length === 0) return [];
  let ids: number[] = [];
  for (let count = 1; count <= hints.length; count++) {
    const candidate = tokenizer.encode(' ' + hints.slice(0, count).join(', '), { add_special_tokens: false });
    if (candidate.length > MAX_HINT_TOKENS) break;
    ids = candidate;
  }
  return ids.length ? [tokenId(tokenizer, '<|startofprev|>'), ...ids] : [];
}

async function generate(inputs: Record<string, unknown>, decoderInputIds: number[], maxNewTokens: number) {
  const { model } = loaded!;
  const output = (await model.generate({
    ...inputs,
    decoder_input_ids: decoderInputIds,
    max_new_tokens: maxNewTokens,
  } as Parameters<Model['generate']>[0])) as Tensor;
  const ids = Array.from(output.data as ArrayLike<number | bigint>, Number);
  // The output repeats the decoder input; keep only what the model generated.
  const startsWithInput = decoderInputIds.every((id, index) => ids[index] === id);
  return startsWithInput ? ids.slice(decoderInputIds.length) : ids;
}

async function transcribe(audio: Float32Array, language: string | null, hints: string[]) {
  if (!loaded) throw new Error('Model is not loaded');
  const { processor, tokenizer } = loaded;
  const inputs = (await processor(audio)) as Record<string, unknown>;
  const prefix = hintTokens(tokenizer, hints);
  const startOfTranscript = tokenId(tokenizer, '<|startoftranscript|>');

  let languageToken = language ? `<|${language}|>` : null;
  if (!languageToken) {
    // Let the model pick the language: one decoding step after <|startoftranscript|>.
    const [detected] = await generate(inputs, [...prefix, startOfTranscript], 1);
    const token = tokenizer.decode([detected], { skip_special_tokens: false });
    languageToken = /^<\|[a-z]{2,3}\|>$/.test(token) ? token : '<|he|>';
  }

  const decoderInputIds = [
    ...prefix,
    startOfTranscript,
    tokenId(tokenizer, languageToken),
    tokenId(tokenizer, '<|transcribe|>'),
    tokenId(tokenizer, '<|notimestamps|>'),
  ];
  const generated = await generate(inputs, decoderInputIds, MAX_NEW_TOKENS);
  return {
    text: tokenizer.decode(generated, { skip_special_tokens: true }).trim(),
    language: languageToken.slice(2, -2),
    hintTokens: Math.max(0, prefix.length - 1),
  };
}

self.onmessage = async (event: MessageEvent<WhisperRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'load') {
      await load(request.modelId);
      post({ type: 'ready', id: request.id });
    } else {
      const started = performance.now();
      const result = await transcribe(request.audio, request.language, request.hints);
      post({ type: 'result', id: request.id, ...result, ms: Math.round(performance.now() - started) });
    }
  } catch (error) {
    post({ type: 'error', id: request.id, message: error instanceof Error ? error.message : String(error) });
  }
};
