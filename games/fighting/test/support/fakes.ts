/**
 * Piezas de mentira para probar FightingGame sin navegador: un reloj de
 * cuadros que se avanza a mano, un teclado sin teclas, una vista que solo
 * guarda lo último y un GameHost que sella los eventos igual que el SDK.
 */
import { EventStamper, type ContractEvent, type GameEventDraft, type GameHost } from "@gameconsole/sdk";
import type { FightView, FrameScheduler, InputPort, ViewModel } from "../../src/game/ports";

export class ManualFrames implements FrameScheduler {
  private callback: ((t: number) => void) | null = null;
  private ids = 0;
  now = 0;

  request(cb: (t: number) => void): number { this.callback = cb; return ++this.ids; }
  cancel(): void { this.callback = null; }
  get pending(): boolean { return this.callback !== null; }

  /** Un cuadro de `ms` milisegundos. false si el ciclo no estaba corriendo. */
  tick(ms = 1000 / 60): boolean {
    const cb = this.callback;
    if (!cb) return false;
    this.callback = null;
    this.now += ms;
    cb(this.now);
    return true;
  }

  /** Avanza `seconds` segundos de juego (o hasta que el ciclo pare). */
  run(seconds: number, ms = 1000 / 60): void {
    for (let t = 0; t < seconds * 1000; t += ms) if (!this.tick(ms)) return;
  }
}

/** Teclado de mentira: se aprietan teclas a mano. */
export class FakeInput implements InputPort {
  readonly down = new Set<string>();
  readonly pressed = new Set<string>();
  resets = 0;
  press(code: string) { this.down.add(code); this.pressed.add(code); }
  release(code: string) { this.down.delete(code); }
  isDown(code: string) { return this.down.has(code); }
  wasPressed(code: string) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); }
  reset() { this.down.clear(); this.pressed.clear(); this.resets++; }
}

export class FakeView implements FightView {
  vm: ViewModel | null = null;
  renders = 0;
  render(vm: ViewModel) { this.vm = vm; this.renders++; }
}

/** GameHost que sella los eventos como el SDK y, como él, descarta lo que llega después de MATCH_FINISHED. */
export class StampHost implements GameHost {
  readonly events: ContractEvent[] = [];
  readonly finished: { winner: string | null; reason: string }[] = [];
  readonly errors: string[] = [];
  private readonly stamper: EventStamper;
  private closed = false;

  constructor(matchId = "fighting-test", now?: () => number) {
    this.stamper = new EventStamper({ matchId, gameId: "fighting", gameVersion: "1.0", now });
  }

  emit(draft: GameEventDraft): void {
    if (this.closed) throw new Error(`evento después de MATCH_FINISHED: ${draft.type} ${draft.action ?? ""}`);
    if (draft.type === "MATCH_FINISHED") this.closed = true;
    this.events.push(this.stamper.stamp(draft));
  }
  finish(winner: string | null, reason: string): void { this.finished.push({ winner, reason }); }
  error(message: string): void { this.errors.push(message); }

  names(): string[] { return this.events.map((e) => e.action ?? e.type); }
}
