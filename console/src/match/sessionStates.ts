/**
 * sessionStates.ts — patrón State: la partida vista desde la consola
 * (protocolo, sección 4).
 *
 *   loading ──READY──► ready ──(START)──► playing ⇄ paused
 *      │                 │                  │        │
 *      │                 └──────STOP────────┴────────┴──► stopping ──FINISHED o 2 s──► finished
 *      │                                    └──FINISHED──────────────────────────────► finished
 *      └──sin READY en 10 s / ERROR fatal (desde cualquiera) ──► error
 *
 * "stopping" es el tramo entre mandar STOP y recibir FINISHED: ya no se
 * aceptan comandos, pero el iframe sigue vivo para que el juego alcance a
 * emitir PLAYER_LEFT y MATCH_FINISHED.
 *
 * Cada estado decide qué hace con cada cosa que pasa; lo que no corresponde se
 * ignora. Así la consola nunca manda START antes de READY ni PAUSE fuera de
 * playing, sin un if por cada combinación. Los estados no guardan datos: lo
 * que cambia vive en MatchSession, que se usa a través de SessionControl.
 */
import type { FinishReason, PauseReason, StopReason } from "@gameconsole/sdk";

export type SessionStatus = "loading" | "ready" | "playing" | "paused" | "stopping" | "finished" | "error";

/** Lo que un estado le puede pedir a la sesión. Lo implementa MatchSession. */
export interface SessionControl {
  setState(state: SessionState): void;
  sendInit(): void;
  sendStart(): void;
  sendPause(reason: PauseReason): void;
  sendResume(): void;
  sendStop(reason: StopReason): void;
  /** Guarda el resultado que mandó el juego. */
  recordResult(winner: string | null, reason: FinishReason): void;
  /** Quita el iframe y avisa que la sesión terminó. */
  dispose(): void;
  /** Pasa a error y cierra. */
  fail(message: string): void;
}

export abstract class SessionState {
  abstract readonly status: SessionStatus;

  // Por defecto todo se ignora; cada estado sobreescribe lo que acepta.
  loaded(_s: SessionControl): void {}
  ready(_s: SessionControl): void {}
  pause(_s: SessionControl, _reason: PauseReason): void {}
  resume(_s: SessionControl): void {}
  /** Por defecto, cerrar es solo quitar el iframe (no hay partida que avisar). */
  stop(s: SessionControl, _reason: StopReason): void { s.dispose(); }
  finished(_s: SessionControl, _winner: string | null, _reason: FinishReason): void {}
  fatalError(s: SessionControl, message: string): void { s.fail(message); }
  readyTimeout(_s: SessionControl): void {}
  stopTimeout(_s: SessionControl): void {}
}

/** Esperando READY. Un STOP aquí no se manda: la consola simplemente quita el iframe. */
class LoadingState extends SessionState {
  readonly status = "loading";
  override loaded(s: SessionControl) { s.sendInit(); }
  override stop(s: SessionControl) { s.setState(FINISHED); s.dispose(); }
  override ready(s: SessionControl) {
    s.setState(READY);
    s.setState(PLAYING);   // al recibir READY, la consola manda START enseguida
    s.sendStart();
  }
  override readyTimeout(s: SessionControl) { s.fail("El juego no respondió en 10 s."); }
}

/** Llegó READY. Es un paso: la consola manda START en ese mismo momento. */
class ReadyState extends SessionState {
  readonly status = "ready";
  override stop(s: SessionControl, reason: StopReason) { s.setState(STOPPING); s.sendStop(reason); }
  override finished(s: SessionControl, winner: string | null, reason: FinishReason) {
    s.recordResult(winner, reason);
    s.setState(FINISHED);
  }
}

class PlayingState extends SessionState {
  readonly status = "playing";
  override pause(s: SessionControl, reason: PauseReason) { s.setState(PAUSED); s.sendPause(reason); }
  override stop(s: SessionControl, reason: StopReason) { s.setState(STOPPING); s.sendStop(reason); }
  /** El juego terminó solo: el iframe se queda mostrando el resultado. */
  override finished(s: SessionControl, winner: string | null, reason: FinishReason) {
    s.recordResult(winner, reason);
    s.setState(FINISHED);
  }
}

class PausedState extends SessionState {
  readonly status = "paused";
  override resume(s: SessionControl) { s.setState(PLAYING); s.sendResume(); }
  override stop(s: SessionControl, reason: StopReason) { s.setState(STOPPING); s.sendStop(reason); }
  override finished(s: SessionControl, winner: string | null, reason: FinishReason) {
    s.recordResult(winner, reason);
    s.setState(FINISHED);
  }
}

/** Se mandó STOP: se espera FINISHED (máx. 2 s) y después se cierra. */
class StoppingState extends SessionState {
  readonly status = "stopping";
  override stop() { /* ya se está cerrando */ }
  override finished(s: SessionControl, winner: string | null, reason: FinishReason) {
    s.recordResult(winner, reason);
    s.setState(FINISHED);
    s.dispose();
  }
  override stopTimeout(s: SessionControl) {
    s.setState(FINISHED);
    s.dispose();   // el juego no contestó: la consola cierra por su cuenta
  }
  override fatalError(s: SessionControl) { s.setState(FINISHED); s.dispose(); }
}

/** Terminada: todo se ignora; cerrar solo quita el iframe. */
class FinishedState extends SessionState {
  readonly status = "finished";
  override fatalError() {}
}

/** Falló (sin READY a tiempo o ERROR fatal). El iframe ya no está. */
class ErrorState extends SessionState {
  readonly status = "error";
  override fatalError() {}
}

// Los estados no tienen datos propios: basta una instancia de cada uno.
export const LOADING: SessionState = new LoadingState();
export const READY: SessionState = new ReadyState();
export const PLAYING: SessionState = new PlayingState();
export const PAUSED: SessionState = new PausedState();
export const STOPPING: SessionState = new StoppingState();
export const FINISHED: SessionState = new FinishedState();
export const ERROR: SessionState = new ErrorState();
