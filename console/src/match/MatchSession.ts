/**
 * MatchSession — una partida abierta en la consola: su iframe, su estado y sus
 * tiempos límite (protocolo, sección 4). Cada iframe es una partida.
 *
 * - Al cargar el iframe manda INIT; con READY manda START.
 * - Sin READY en 10 s: error y se cierra.
 * - Después de STOP, sin FINISHED en 2 s: se cierra por su cuenta.
 * - ERROR con fatal: se cierra.
 * - Partidas ocultas: si deja de verse estando en playing, PAUSE "hidden".
 *   No se reanuda sola: al volver a verse solo avisa (resumeHint) para que la
 *   UI resalte "Reanudar".
 *
 * Los mensajes ya llegan filtrados por MatchMediator; lo que manda el juego
 * se publica en el EventBus.
 */
import {
  PROTOCOL,
  type ConsoleMessage, type ConsoleMessageType, type FinishReason, type GameManifest, type GameMessage,
  type MatchContext, type PauseReason, type PayloadOf, type StopReason,
} from "@gameconsole/sdk";
import type { EventBus } from "./EventBus";
import type { MatchFrame } from "./MatchFrame";
import { ERROR, LOADING, type SessionControl, type SessionState, type SessionStatus } from "./sessionStates";

export const READY_TIMEOUT_MS = 10_000;
export const FINISHED_TIMEOUT_MS = 2_000;

export interface SessionResult {
  winner: string | null;
  reason: FinishReason;
}

export interface SessionDeps {
  frame: MatchFrame;
  bus: EventBus;
  /** El origen propio (location.origin): solo se le habla al juego en ese origen. */
  origin: string;
}

export class MatchSession {
  readonly matchId: string;
  private state: SessionState = LOADING;
  private initSent = false;
  private visible = true;
  private reason: PauseReason | null = null;
  private hint = false;
  private errorMessage: string | null = null;
  private outcome: SessionResult | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly changeListeners = new Set<(s: MatchSession) => void>();
  private readonly disposeListeners = new Set<(s: MatchSession) => void>();
  private resolveClosed!: () => void;
  /** Se cumple cuando la sesión quitó su iframe (por cierre, error o fin tras STOP). */
  readonly closed = new Promise<void>((r) => { this.resolveClosed = r; });

  /** Lo que los estados pueden pedirle a la sesión (sin exponerlo al resto). */
  private readonly control: SessionControl = {
    setState: (s) => this.enter(s),
    sendInit: () => {
      if (this.initSent) return;   // si el iframe recarga, no se repite INIT
      this.initSent = true;
      this.send("INIT", this.context);
    },
    sendStart: () => {
      this.send("START", {});
      if (!this.visible) this.pause("hidden");   // empezó sin estar a la vista
    },
    sendPause: (reason) => { this.reason = reason; this.hint = false; this.send("PAUSE", { reason }); },
    sendResume: () => { this.reason = null; this.hint = false; this.send("RESUME", {}); },
    sendStop: (reason) => {
      this.send("STOP", { reason });
      this.stopTimer = setTimeout(() => this.state.stopTimeout(this.control), FINISHED_TIMEOUT_MS);
    },
    recordResult: (winner, reason) => { this.outcome = { winner, reason }; },
    dispose: () => this.dispose(),
    fail: (message) => {
      this.errorMessage = message;
      this.enter(ERROR);
      this.dispose();
    },
  };

  constructor(
    readonly manifest: GameManifest,
    readonly context: MatchContext,
    private readonly deps: SessionDeps,
  ) {
    this.matchId = context.matchId;
  }

  get frame(): MatchFrame { return this.deps.frame; }
  get status(): SessionStatus { return this.state.status; }
  /** Por qué está en pausa ("user" o "hidden"), o null. */
  get pauseReason(): PauseReason | null { return this.status === "paused" ? this.reason : null; }
  /** Pausada por "hidden" y ya vuelve a verse: la UI resalta "Reanudar". */
  get resumeHint(): boolean { return this.status === "paused" && this.hint; }
  get error(): string | null { return this.errorMessage; }
  get result(): SessionResult | null { return this.outcome; }
  get isDisposed(): boolean { return this.disposed; }

  /** Empieza a esperar el iframe: INIT al cargar y el plazo de READY. */
  start(): void {
    this.frame.onLoad(() => { if (!this.disposed) this.state.loaded(this.control); });
    this.readyTimer = setTimeout(() => this.state.readyTimeout(this.control), READY_TIMEOUT_MS);
  }

  // ------------------------------------------------------------------
  // Lo que pide la UI
  // ------------------------------------------------------------------

  pause(reason: PauseReason = "user"): void { this.state.pause(this.control, reason); }
  resume(): void { this.state.resume(this.control); }

  /** Termina la partida. Se cumple cuando el iframe ya no está. */
  stop(reason: StopReason = "user"): Promise<void> {
    this.state.stop(this.control, reason);
    return this.closed;
  }

  /** Si el iframe se ve o no (pestaña, scroll o algo que lo tapa). */
  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    if (!visible) {
      if (this.status === "playing") this.pause("hidden");
    } else if (this.status === "paused" && this.reason === "hidden") {
      this.hint = true;    // el protocolo no deja reanudar sola: solo se avisa
      this.notify();
    }
  }

  focus(): void { if (!this.disposed) this.frame.focus(); }

  onChange(listener: (s: MatchSession) => void): () => void {
    this.changeListeners.add(listener);
    return () => { this.changeListeners.delete(listener); };
  }

  onDispose(listener: (s: MatchSession) => void): () => void {
    this.disposeListeners.add(listener);
    return () => { this.disposeListeners.delete(listener); };
  }

  // ------------------------------------------------------------------
  // Lo que manda el juego (ya filtrado por MatchMediator)
  // ------------------------------------------------------------------

  receive(message: GameMessage): void {
    if (this.disposed) return;
    const { bus } = this.deps;
    switch (message.type) {
      case "READY":
        this.state.ready(this.control);
        break;
      case "STATE":
        bus.publish("state", { matchId: this.matchId, state: message.payload.state });
        break;
      case "GAME_EVENT":
        bus.publish("game-event", { matchId: this.matchId, event: message.payload.event });
        break;
      case "FINISHED": {
        const { winner, reason } = message.payload;
        bus.publish("finished", { matchId: this.matchId, winner, reason });
        this.state.finished(this.control, winner, reason);
        break;
      }
      case "ERROR":
        if (message.payload.fatal) this.state.fatalError(this.control, message.payload.message);
        else console.warn(`[consola] ${this.matchId}: ${message.payload.message}`);
        break;
    }
  }

  // ------------------------------------------------------------------

  private enter(state: SessionState): void {
    this.state = state;
    if (state.status !== "loading") this.clearReadyTimer();
    this.notify();
  }

  private send<T extends ConsoleMessageType>(type: T, payload: PayloadOf<ConsoleMessage, T>): void {
    if (this.disposed) return;
    const message = { protocol: PROTOCOL, type, matchId: this.matchId, payload } as ConsoleMessage;
    this.frame.post(message, this.deps.origin);
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearReadyTimer();
    if (this.stopTimer) clearTimeout(this.stopTimer);
    this.stopTimer = null;
    this.frame.remove();
    this.notify();
    const humans = this.context.players.filter((p) => p.kind === "human").map((p) => p.playerId);
    this.deps.bus.publish("closed", { matchId: this.matchId, humans });
    for (const l of [...this.disposeListeners]) l(this);
    this.resolveClosed();
  }

  private clearReadyTimer(): void {
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.readyTimer = null;
  }

  private notify(): void {
    for (const l of [...this.changeListeners]) l(this);
  }
}
