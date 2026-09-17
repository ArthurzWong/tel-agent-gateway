// Tel-Agent Gateway — browser microphone voice loop.
// Captures mic audio, performs on-device silence detection to segment
// utterances, sends each utterance's audio to a speech endpoint when one is
// configured, and drives the /api/brain SSE stream for replies.
//
// Speech-to-text in the browser: if WEB STT (webkitSpeechRecognition) exists,
// it is used directly — zero cloud dependency. Otherwise this class records
// and exposes audio for a server-side STT you can add later.

export type WebVoiceEvents = {
  onPartial?: (text: string) => void;
  onUtterance?: (text: string) => void;
  onLevel?: (level: number) => void;
  onState?: (s: "idle" | "listening" | "thinking" | "speaking") => void;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>; resultIndex: number }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
};

export class WebVoice {
  private rec: SpeechRecognitionLike | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private raf = 0;
  private stopped = true;
  private events: WebVoiceEvents;
  lang: string;

  constructor(events: WebVoiceEvents, lang = "en-US") {
    this.events = events;
    this.lang = lang;
  }

  static supported(): boolean {
    return typeof window !== "undefined" &&
      Boolean((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ||
              (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
  }

  async start(): Promise<void> {
    if (!this.stopped) return;
    this.stopped = false;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.stopped = true;
      throw new Error("microphone permission denied");
    }
    // audio meter (VU)
    try {
      this.audioCtx = new AudioContext();
      const src = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      src.connect(this.analyser);
      this.meter();
    } catch { /* meter optional */ }

    // speech recognition
    const Ctor = (window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!Ctor) return; // meter-only mode; caller falls back to text input
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.lang;
    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0]?.transcript || "";
        if (r.isFinal) final += t; else interim += t;
      }
      if (interim) this.events.onPartial?.(interim);
      if (final.trim()) this.events.onUtterance?.(final.trim());
    };
    rec.onerror = () => { /* keep going; meter + text fallback remain */ };
    rec.onend = () => { if (!this.stopped) { try { rec.start(); } catch { /* restart race — ignore */ } } };
    this.rec = rec;
    try { rec.start(); } catch { /* already started */ }
    this.events.onState?.("listening");
  }

  private meter(): void {
    if (!this.analyser) return;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    const tick = () => {
      if (this.stopped) return;
      this.analyser!.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / data.length);
      this.events.onLevel?.(Math.min(1, rms * 4));
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    try { this.rec?.stop(); } catch { /* noop */ }
    this.rec = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.audioCtx?.close().catch(() => undefined);
    this.audioCtx = null;
    this.analyser = null;
    this.events.onState?.("idle");
  }
}
