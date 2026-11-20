/**
 * Sonido: SoundBank con un AudioContext de mentira (arranca con la primera
 * tecla, M silencia, la pausa suspende) y los sonidos que dispara la pelea
 * (nunca en la pausa).
 */
import { describe, expect, test } from "vitest";
import { RECIPES, SoundBank } from "../src/audio/SoundBank";
import type { SoundName, SoundPort } from "../src/audio/SoundPort";
import { FightingGame } from "../src/game/FightingGame";
import { SLOT1_KEYS, SLOT2_KEYS } from "../src/input/ControlScheme";
import { FakeInput, FakeView, ManualFrames, StampHost } from "./support/fakes";

/** AudioContext de mentira: cuenta lo que se crea y lo que se arranca. */
class FakeAudio {
  state: "running" | "suspended" = "running";
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  started = 0;
  suspends = 0;
  resumes = 0;
  private param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  private node = (extra: object = {}) => ({ connect: (n: unknown) => n, ...extra });
  createGain() { return this.node({ gain: this.param() }); }
  createOscillator() { return this.node({ type: "sine", frequency: this.param(), start: () => this.started++, stop() {} }); }
  createBiquadFilter() { return this.node({ type: "lowpass", frequency: this.param(), Q: this.param() }); }
  createBufferSource() { return this.node({ buffer: null, start: () => this.started++, stop() {} }); }
  createBuffer(_c: number, n: number) { const d = new Float32Array(n); return { getChannelData: () => d }; }
  suspend() { this.suspends++; this.state = "suspended"; return Promise.resolve(); }
  resume() { this.resumes++; this.state = "running"; return Promise.resolve(); }
}

function makeBank(saved: string | null = null) {
  const audio = new FakeAudio();
  let created = 0;
  const store = new Map<string, string>(saved === null ? [] : [["gameconsole-fighting-muted", saved]]);
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const bank = new SoundBank(() => { created++; return audio as unknown as AudioContext; }, storage);
  const target = new EventTarget();
  bank.attach(target);
  const key = (code: string, repeat = false) => target.dispatchEvent(Object.assign(new Event("keydown"), { code, repeat }));
  return { bank, audio, key, store, created: () => created };
}

describe("SoundBank", () => {
  test("no crea el audio hasta la primera tecla (política de reproducción automática)", () => {
    const { bank, audio, key, created } = makeBank();
    bank.play("punch");
    expect([created(), audio.started]).toEqual([0, 0]);
    key("KeyF");
    expect(bank.unlocked).toBe(true);
    bank.play("punch");
    expect(audio.started).toBeGreaterThan(0);
    key("KeyK");
    expect(created()).toBe(1); // una sola vez
  });

  test("cada sonido arma sus capas", () => {
    const { bank, audio, key } = makeBank();
    key("KeyA");
    for (const name of Object.keys(RECIPES) as SoundName[]) {
      const before = audio.started;
      bank.play(name);
      expect(audio.started, name).toBeGreaterThan(before);
    }
  });

  test("M silencia y vuelve; se recuerda; la repetición de la tecla no cuenta", () => {
    const { bank, audio, key, store } = makeBank();
    let changes = 0;
    bank.onChange = () => changes++;
    key("KeyM");
    expect(bank.muted).toBe(true);
    key("KeyM", true);
    expect(bank.muted).toBe(true);
    const before = audio.started;
    bank.play("kick");
    expect(audio.started).toBe(before);
    expect(store.get("gameconsole-fighting-muted")).toBe("1");
    key("KeyM");
    expect([bank.muted, changes]).toEqual([false, 2]);
    expect(makeBank("1").bank.muted).toBe(true);
  });

  test("en la pausa se suspende y no suena nada; al seguir, vuelve", () => {
    const { bank, audio, key } = makeBank();
    key("KeyF");
    bank.pause();
    expect(audio.suspends).toBe(1);
    const before = audio.started;
    bank.play("bell");
    expect(audio.started).toBe(before);
    key("KeyF"); // una tecla en la pausa no lo despierta
    expect(audio.state).toBe("suspended");
    bank.resume();
    expect(audio.state).toBe("running");
    bank.play("bell");
    expect(audio.started).toBeGreaterThan(before);
  });

  test("sin WebAudio no falla: queda en silencio", () => {
    const bank = new SoundBank(() => null, null);
    bank.unlock();
    expect(() => bank.play("ko")).not.toThrow();
    expect(new SoundBank(() => null, null).attach(undefined)).toBeInstanceOf(SoundBank);
  });
});

/** Un sonido de mentira que anota lo que se pidió. */
class FakeSound implements SoundPort {
  played: SoundName[] = [];
  paused = false;
  muted = false;
  play(name: SoundName) { this.played.push(name); }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
}

function setup() {
  const sound = new FakeSound();
  const input = new FakeInput();
  const frames = new ManualFrames();
  const game = new FightingGame(new StampHost(), new FakeView(), input, frames, sound);
  game.init({
    gameId: "fighting", matchId: "fighting-sound", mode: "local-2p",
    players: [
      { playerId: "ana", name: "Ana", kind: "human", slot: 1 },
      { playerId: "beto", name: "Beto", kind: "human", slot: 2 },
    ],
    options: { rounds: 3 },
  });
  game.start();
  return { game, sound, input, frames };
}

describe("los sonidos de la pelea", () => {
  test("campana al empezar; silbido al lanzar el golpe y el golpe al conectar; bloqueo", () => {
    const { game, sound, input, frames } = setup();
    frames.run(1);
    expect(sound.played).toEqual([]);
    frames.run(1);
    expect(sound.played).toEqual(["bell"]);
    const [a, b] = game.fight.fighters;
    a.x = 450; b.x = 520;
    input.press(SLOT1_KEYS.attack);
    input.release(SLOT1_KEYS.attack);
    frames.run(0.3);
    expect(sound.played.slice(1)).toEqual(["whoosh", "punch"]);
    frames.run(0.3);
    input.press(SLOT2_KEYS.block);
    frames.run(0.1);
    input.press(SLOT1_KEYS.attack);
    input.release(SLOT1_KEYS.attack);
    frames.run(0.3);
    expect(sound.played.slice(3)).toEqual(["whoosh", "block"]);
  });

  test("en la pausa no suena nada y el sonido se suspende; al seguir, vuelve", () => {
    const { game, sound, input, frames } = setup();
    frames.run(2);
    const [a, b] = game.fight.fighters;
    a.x = 450; b.x = 520;
    game.pause("hidden");
    expect(sound.paused).toBe(true);
    const n = sound.played.length;
    input.press(SLOT1_KEYS.attack);
    frames.run(2);
    expect(sound.played.length).toBe(n);
    game.resume();
    expect(sound.paused).toBe(false);
  });

  test("cerrar la partida silencia lo que estaba sonando", () => {
    const { game, sound, frames } = setup();
    frames.run(2);
    game.stop("closed");
    expect(sound.paused).toBe(true);
  });
});
