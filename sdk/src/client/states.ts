/**
 * states.ts — patrón State: los estados de una partida (protocolo, sección 4).
 *
 *   loading ──INIT──► (iniciando) ──onInit listo──► ready ──START──► playing ⇄ paused
 *                                                     │                 │         │
 *                                                     └─────STOP────────┴──STOP───┴──► finished
 *
 * Cada estado decide qué hace con cada mensaje. Lo que no está permitido en
 * ese estado no hace nada (se ignora), sin un if por cada combinación.
 * Los estados no guardan datos: lo que cambia vive en GameApp, que los usa
 * a través de MatchLifecycle.
 */
import type { MatchContext, MatchStatus, PauseReason, StopReason } from "../protocol";

/** Lo que un estado le puede pedir a la partida. Lo implementa GameApp. */
export interface MatchLifecycle {
  setState(state: MatchState): void;
  /** Llama a onInit; cuando termina, pasa a ready y manda READY. */
  runInit(ctx: MatchContext): void;
  runStart(): void;
  runPause(reason: PauseReason): void;
  runResume(): void;
  runStop(reason: StopReason): void;
}

export abstract class MatchState {
  /** Lo que se le informa a la consola con STATE. */
  abstract readonly status: MatchStatus;
  /** Si en este estado el juego puede emitir eventos para GameStats. */
  readonly acceptsEvents: boolean = false;
  /** Si en este estado el juego puede terminar (mandar FINISHED). */
  readonly canFinish: boolean = false;

  // Por defecto, todo se ignora; cada estado sobreescribe lo que acepta.
  init(_l: MatchLifecycle, _ctx: MatchContext): void {}
  start(_l: MatchLifecycle): void {}
  pause(_l: MatchLifecycle, _reason: PauseReason): void {}
  resume(_l: MatchLifecycle): void {}
  stop(_l: MatchLifecycle, _reason: StopReason): void {}
}

/** Esperando INIT. Un STOP aquí se ignora: la consola simplemente quita el iframe. */
export class LoadingState extends MatchState {
  readonly status = "loading";
  override init(l: MatchLifecycle, ctx: MatchContext): void {
    l.setState(INITIALIZING);
    l.runInit(ctx);
  }
}

/** Ya llegó INIT y onInit está corriendo: para la consola sigue en "loading". Un segundo INIT se ignora. */
export class InitializingState extends MatchState {
  readonly status = "loading";
}

export class ReadyState extends MatchState {
  readonly status = "ready";
  override readonly canFinish = true;
  override start(l: MatchLifecycle): void {
    l.setState(PLAYING);
    l.runStart();
  }
  /** La partida nunca empezó: sin eventos, solo FINISHED. */
  override stop(l: MatchLifecycle, reason: StopReason): void {
    l.runStop(reason);
  }
}

export class PlayingState extends MatchState {
  readonly status = "playing";
  override readonly acceptsEvents = true;
  override readonly canFinish = true;
  override pause(l: MatchLifecycle, reason: PauseReason): void {
    l.setState(PAUSED);
    l.runPause(reason);
  }
  override stop(l: MatchLifecycle, reason: StopReason): void {
    l.runStop(reason);
  }
}

export class PausedState extends MatchState {
  readonly status = "paused";
  override readonly acceptsEvents = true;
  override readonly canFinish = true;
  override resume(l: MatchLifecycle): void {
    l.setState(PLAYING);
    l.runResume();
  }
  override stop(l: MatchLifecycle, reason: StopReason): void {
    l.runStop(reason);
  }
}

/** Terminada: todo se ignora. */
export class FinishedState extends MatchState {
  readonly status = "finished";
}

// Los estados no tienen datos propios: basta una instancia de cada uno.
export const LOADING = new LoadingState();
export const INITIALIZING = new InitializingState();
export const READY = new ReadyState();
export const PLAYING = new PlayingState();
export const PAUSED = new PausedState();
export const FINISHED = new FinishedState();
