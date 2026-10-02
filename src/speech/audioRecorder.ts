// Records from the microphone and returns 16 kHz mono samples, the format Whisper expects.

const TARGET_SAMPLE_RATE = 16_000;

/** What was recorded, for the speech check in Settings. */
export interface RecordingInfo {
  mimeType: string;
  /** Sample rate of the decoded recording before resampling to 16 kHz. */
  inputSampleRate: number;
  /** Microphone processing the phone actually applied. */
  microphone: MediaTrackSettings;
}

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private microphone: MediaTrackSettings = {};
  /** Details of the last finished recording. */
  lastInfo: RecordingInfo | null = null;

  /** `rawAudio` turns off the phone's noise suppression, echo cancellation and volume levelling. */
  async start({ rawAudio = false }: { rawAudio?: boolean } = {}): Promise<void> {
    const processing = !rawAudio;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: processing,
        noiseSuppression: processing,
        autoGainControl: processing,
      },
    });
    this.microphone = this.stream.getAudioTracks()[0]?.getSettings() ?? {};
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder.start();
  }

  /** Stops recording and returns the audio. */
  async stop(): Promise<Float32Array> {
    const recorder = this.recorder;
    if (!recorder) throw new Error('Not recording');
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    this.releaseMicrophone();
    const blob = new Blob(this.chunks, { type: recorder.mimeType });
    this.chunks = [];
    this.recorder = null;
    const { samples, inputSampleRate } = await decodeTo16kMono(blob);
    this.lastInfo = { mimeType: recorder.mimeType, inputSampleRate, microphone: this.microphone };
    return samples;
  }

  /** Stops without returning audio (e.g. when leaving the screen). */
  cancel(): void {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.recorder = null;
    this.chunks = [];
    this.releaseMicrophone();
  }

  private releaseMicrophone(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}

async function decodeTo16kMono(blob: Blob): Promise<{ samples: Float32Array; inputSampleRate: number }> {
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void context.close();
  }
  try {
    // The browser's resampler filters properly; some older browsers reject a 16 kHz context.
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE), TARGET_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return { samples: rendered.getChannelData(0), inputSampleRate: decoded.sampleRate };
  } catch {
    return {
      samples: downsample(decoded.getChannelData(0), decoded.sampleRate, TARGET_SAMPLE_RATE),
      inputSampleRate: decoded.sampleRate,
    };
  }
}

/** Plays 16 kHz samples back (resampled to the device rate), so the florist hears what the recognizer got. */
export async function playRecording(samples: Float32Array): Promise<void> {
  const context = new AudioContext();
  await context.resume();
  const ratio = context.sampleRate / TARGET_SAMPLE_RATE;
  const output = new Float32Array(Math.floor(samples.length * ratio));
  for (let i = 0; i < output.length; i++) {
    const position = i / ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    output[i] = (samples[index] ?? 0) * (1 - fraction) + (samples[index + 1] ?? 0) * fraction;
  }
  const buffer = context.createBuffer(1, output.length, context.sampleRate);
  buffer.copyToChannel(output, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.onended = () => void context.close();
  source.start();
}

/** Box-filter downsampling: averages the input samples that fall into each output sample. */
function downsample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  const ratio = fromRate / toRate;
  const output = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < output.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    output[i] = end > start ? sum / (end - start) : 0;
  }
  return output;
}
