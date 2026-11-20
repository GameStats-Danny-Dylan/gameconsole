/**
 * SoundBank — los efectos de sonido, sintetizados en el momento con WebAudio
 * (sin archivos): golpe, patada, bloqueo, KO, campana de round y el silbido
 * de un golpe que sale.
 *
 * - Política de reproducción automática: el AudioContext se crea recién con
 *   la primera tecla o el primer clic dentro del juego.
 * - La tecla M silencia y vuelve a activar (se recuerda en este navegador).
 * - En la pausa el contexto se suspende: lo que sonaba se corta y no suena
 *   nada nuevo hasta seguir.
 */
import type { SoundName, SoundPort } from "./SoundPort";

/** Volumen general. */
const MASTER = 0.55;
const STORAGE_KEY = "gameconsole-fighting-muted";

type Recipe = (s: Synth) => void;

/** Ayudas para armar cada sonido con osciladores, ruido y filtros. */
class Synth {
  constructor(readonly ctx: AudioContext, readonly out: AudioNode, readonly noiseBuffer: AudioBuffer,
              readonly t: number, readonly pitch: number) {}

  private envelope(start: number, dur: number, vol: number, attack: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    g.connect(this.out);
    return g;
  }

  tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, attack = 0.003): void {
    const start = this.t + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0 * this.pitch, start);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1 * this.pitch), start + dur);
    o.connect(this.envelope(start, dur, vol, attack));
    o.start(start);
    o.stop(start + dur + 0.03);
  }

  noise(filter: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, q = 1, delay = 0, attack = 0.002): void {
    const start = this.t + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = filter;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0 * this.pitch, start);
    f.frequency.exponentialRampToValueAtTime(Math.max(1, f1 * this.pitch), start + dur);
    src.connect(f);
    f.connect(this.envelope(start, dur, vol, attack));
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.03);
  }
}

/** Cada sonido: capas de tono (el cuerpo) y ruido filtrado (el golpe). */
export const RECIPES: Record<SoundName, Recipe> = {
  punch: (s) => {
    s.noise("lowpass", 2400, 500, 0.09, 0.55);
    s.tone("sine", 190, 55, 0.11, 0.7);
  },
  kick: (s) => {
    s.noise("lowpass", 1700, 260, 0.15, 0.6);
    s.tone("sine", 145, 40, 0.2, 0.9);
    s.tone("square", 900, 280, 0.025, 0.07);
  },
  block: (s) => {
    s.noise("bandpass", 3300, 2600, 0.08, 0.5, 6);
    s.tone("triangle", 1500, 1050, 0.1, 0.22);
    s.tone("sine", 2350, 2050, 0.16, 0.08);
  },
  ko: (s) => {
    s.tone("sine", 120, 28, 0.75, 1);
    s.noise("lowpass", 1100, 110, 0.65, 0.55);
    s.tone("sawtooth", 230, 52, 0.5, 0.07);
    s.tone("sine", 85, 32, 0.45, 0.6, 0.13);
  },
  bell: (s) => {
    // Campana: parciales inarmónicos que se apagan a distinto ritmo.
    const base = 760;
    for (const [ratio, vol, dur] of [[1, 0.32, 1.6], [2.01, 0.16, 1.1], [2.76, 0.13, 0.9], [4.07, 0.06, 0.6], [5.42, 0.04, 0.45]] as const)
      s.tone("sine", base * ratio, base * ratio * 0.998, dur, vol, 0, 0.002);
    s.noise("highpass", 6000, 5000, 0.03, 0.12);
  },
  whoosh: (s) => {
    s.noise("bandpass", 450, 2200, 0.15, 0.13, 1.3, 0, 0.04);
  },
};

function defaultContext(): AudioContext | null {
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try { return new Ctor(); } catch { return null; }
}

function defaultStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

export class SoundBank implements SoundPort {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private paused = false;
  private silenced: boolean;
  onChange?: () => void;

  constructor(
    private readonly createContext: () => AudioContext | null = defaultContext,
    private readonly storage: Pick<Storage, "getItem" | "setItem"> | null = defaultStorage(),
  ) {
    let saved: string | null = null;
    try { saved = storage?.getItem(STORAGE_KEY) ?? null; } catch { /* sin almacenamiento */ }
    this.silenced = saved === "1";
  }

  /** Escucha la primera tecla o clic (para poder sonar) y la tecla M. Sin ventana (pruebas), no hace nada. */
  attach(target: EventTarget | undefined = typeof window === "undefined" ? undefined : window): this {
    if (!target) return this;
    target.addEventListener("keydown", (e) => {
      const k = e as KeyboardEvent;
      this.unlock();
      if (k.code === "KeyM" && !k.repeat) this.toggleMute();
    });
    target.addEventListener("pointerdown", () => this.unlock());
    return this;
  }

  get muted(): boolean { return this.silenced; }
  /** Si ya se creó el audio (después de la primera tecla). */
  get unlocked(): boolean { return this.ctx !== null; }

  /** Crea el audio (tiene que ser dentro de una tecla o un clic de la persona). */
  unlock(): void {
    if (this.ctx) {
      if (!this.paused && this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
      return;
    }
    const ctx = this.createContext();
    if (!ctx) return;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.silenced ? 0 : MASTER;
    this.master.connect(ctx.destination);
    // Un segundo de ruido blanco, que comparten todos los sonidos.
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
    if (this.paused) void ctx.suspend().catch(() => {});
  }

  toggleMute(): void {
    this.silenced = !this.silenced;
    if (this.master && this.ctx) this.master.gain.setValueAtTime(this.silenced ? 0 : MASTER, this.ctx.currentTime);
    try { this.storage?.setItem(STORAGE_KEY, this.silenced ? "1" : "0"); } catch { /* sin almacenamiento */ }
    this.onChange?.();
  }

  pause(): void {
    this.paused = true;
    if (this.ctx) void this.ctx.suspend().catch(() => {});
  }

  resume(): void {
    this.paused = false;
    if (this.ctx) void this.ctx.resume().catch(() => {});
  }

  play(name: SoundName): void {
    if (!this.ctx || !this.master || !this.noiseBuffer || this.paused || this.silenced) return;
    // Un poco de variación de tono, para que dos golpes seguidos no suenen idénticos.
    const pitch = 1 + (Math.random() - 0.5) * 0.1;
    RECIPES[name](new Synth(this.ctx, this.master, this.noiseBuffer, this.ctx.currentTime, pitch));
  }
}
