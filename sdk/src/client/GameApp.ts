/**
 * GameApp — patrón Template Method (protocolo, sección 9).
 *
 * El SDK maneja el protocolo con la consola, los estados (State, states.ts) y
 * el sellado de eventos (EventStamper). Cada juego hereda y llena los pasos:
 * onInit, onStart, onPause, onResume y onStop.
 *
 * Reglas que cuida el SDK para que GameStats no rechace nada:
 *   - solo se emiten eventos con la partida en curso (playing o paused);
 *   - MATCH_FINISHED sale una sola vez y, después de él, cualquier otro
 *     evento se descarta;
 *   - FINISHED sale una sola vez; si el juego no lo manda al recibir STOP,
 *     lo manda el SDK.
 *
 * Uso:
 *   class MiJuego extends GameApp { protected onInit(ctx) {…} … }
 *   new MiJuego({ manifest }).listen();
 */
import { EventStamper } from "../events/EventStamper";
import type { Now } from "../events/MonotonicClock";
import type {
  ConsoleMessage, FinishReason, GameEventDraft, GameHost, GameManifest,
  MatchContext, MatchStatus, PauseReason, StopReason,
} from "../protocol";
import { ConsoleChannel } from "./MessageChannel";
import { FINISHED, LOADING, READY, type MatchLifecycle, type MatchState } from "./states";

export type GameIdentity = Pick<GameManifest, "id" | "gameStatsId" | "gameVersion">;

export interface GameAppOptions {
  /** Del game.json: id (para INIT), gameStatsId y gameVersion (para cada evento). */
  manifest: GameIdentity;
  /** Por defecto, el canal con la consola que abrió este iframe. */
  channel?: ConsoleChannel;
  /** Reloj para los timestamps (en las pruebas, uno manual). */
  now?: Now;
}

/** Por qué se descartó un evento. */
export type DiscardReason = "not-playing" | "after-match-finished";

export abstract class GameApp {
  private state: MatchState = LOADING;
  private ctx: MatchContext | null = null;
  private stamper: EventStamper | null = null;
  private matchFinishedSent = false;
  private unsubscribe: (() => void) | null = null;
  private readonly manifest: GameIdentity;
  private readonly channel: ConsoleChannel;
  private readonly now?: Now;

  /**
   * emit / finish / error como un objeto, para pasárselo a la lógica del juego
   * (por ejemplo, el GameHost que espera Connect4Game) sin que dependa de GameApp.
   */
  readonly host: GameHost = {
    emit: (event) => this.emit(event),
    finish: (winner, reason) => this.finish(winner, reason),
    error: (message, fatal) => this.error(message, fatal),
  };

  constructor(options: GameAppOptions) {
    this.manifest = options.manifest;
    this.channel = options.channel ?? ConsoleChannel.fromWindow();
    this.now = options.now;
  }

  // ------------------------------------------------------------------
  // Los pasos que llena cada juego
  // ------------------------------------------------------------------

  /** INIT: cargar y armar la partida. Puede ser síncrono o asíncrono; READY sale cuando termina. */
  protected abstract onInit(ctx: MatchContext): void | Promise<void>;
  /** START: emitir MATCH_STARTED, un PLAYER_JOINED por jugador y arrancar. */
  protected abstract onStart(): void;
  /** PAUSE: detener el reloj y emitir MATCH_PAUSED con ese reason. */
  protected abstract onPause(reason: PauseReason): void;
  /** RESUME: seguir y emitir MATCH_RESUMED. */
  protected abstract onResume(): void;
  /** STOP: si la partida empezó, emitir PLAYER_LEFT y MATCH_FINISHED; después finish(). */
  protected abstract onStop(reason: StopReason): void;

  // ------------------------------------------------------------------
  // Lo que el juego puede usar
  // ------------------------------------------------------------------

  /** Empieza a escuchar a la consola. Se llama una vez, después de construir. */
  listen(): this {
    this.unsubscribe ??= this.channel.onMessage((m) => this.handle(m));
    return this;
  }

  /** Deja de escuchar a la consola. */
  close(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  get status(): MatchStatus {
    return this.state.status;
  }

  /** El contexto de INIT (null antes de recibirlo). */
  get context(): MatchContext | null {
    return this.ctx;
  }

  /** Adapter: el juego describe el hecho y el SDK completa eventId, timestamp, gameId, gameVersion y matchId. */
  protected emit(draft: GameEventDraft): void {
    if (this.matchFinishedSent) return this.discarded(draft, "after-match-finished");
    if (!this.state.acceptsEvents || !this.stamper) return this.discarded(draft, "not-playing");
    if (draft.type === "MATCH_FINISHED") this.matchFinishedSent = true;
    this.channel.send("GAME_EVENT", { event: this.stamper.stamp(draft) });
  }

  /** Avisa a la consola que la partida terminó (FINISHED). Solo la primera vez cuenta. */
  protected finish(winner: string | null, reason: FinishReason): void {
    if (!this.state.canFinish) return;
    this.setState(FINISHED);
    this.channel.send("FINISHED", { winner, reason });
  }

  /** Avisa a la consola que algo falló (ERROR). Si fatal, la consola cierra la partida. */
  protected error(message: string, fatal: boolean): void {
    this.channel.send("ERROR", { message, fatal });
  }

  /** Un evento que no se mandó. Por defecto se avisa en la consola del navegador. */
  protected discarded(draft: GameEventDraft, reason: DiscardReason): void {
    console.warn(`[sdk] evento descartado (${reason}): ${draft.type}${draft.action ? ` ${draft.action}` : ""}`);
  }

  // ------------------------------------------------------------------
  // Protocolo
  // ------------------------------------------------------------------

  private handle(message: ConsoleMessage): void {
    const l = this.lifecycle;
    switch (message.type) {
      case "INIT":
        if (message.payload.gameId !== this.manifest.id) {
          this.error(`INIT con gameId "${message.payload.gameId}", pero este juego es "${this.manifest.id}"`, true);
          return;
        }
        return this.state.init(l, message.payload);
      case "START":  return this.state.start(l);
      case "PAUSE":  return this.state.pause(l, message.payload.reason);
      case "RESUME": return this.state.resume(l);
      case "STOP":   return this.state.stop(l, message.payload.reason);
    }
  }

  private setState(next: MatchState): void {
    const changed = next.status !== this.state.status;
    this.state = next;
    if (changed) this.channel.send("STATE", { state: next.status });
  }

  /** Lo que los estados pueden pedir. Queda privado: el juego no lo ve. */
  private readonly lifecycle: MatchLifecycle = {
    setState: (s) => this.setState(s),
    runInit: (ctx) => {
      this.ctx = ctx;
      this.stamper = new EventStamper({
        matchId: ctx.matchId,
        gameId: this.manifest.gameStatsId,
        gameVersion: this.manifest.gameVersion,
        now: this.now,
      });
      const run = async () => this.onInit(ctx);
      run().then(
        () => {
          this.channel.send("READY", {});
          this.setState(READY);
        },
        (err: unknown) => this.error(`no se pudo preparar la partida: ${messageOf(err)}`, true),
      );
    },
    runStart: () => this.guard("START", () => this.onStart()),
    runPause: (reason) => this.guard("PAUSE", () => this.onPause(reason)),
    runResume: () => this.guard("RESUME", () => this.onResume()),
    runStop: (reason) => {
      this.guard("STOP", () => this.onStop(reason));
      // Si el juego no avisó que terminó, avisa el SDK (la consola espera FINISHED).
      if (this.state.canFinish) this.finish(null, "stopped");
    },
  };

  /** Un paso del juego que lanza un error no tumba el SDK: se le avisa a la consola. */
  private guard(step: string, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      this.error(`falló ${step}: ${messageOf(err)}`, true);
    }
  }
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));
