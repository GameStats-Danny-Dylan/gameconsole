/**
 * ports.ts — lo que el juego necesita de afuera, como interfaces.
 *
 * GameHost y MatchContext son exactamente lo que da el SDK (protocolo, secciones
 * 4 y 9): el contexto de INIT y las funciones emit / finish / error. El juego
 * depende de estas interfaces y no del SDK concreto, así se puede probar sin
 * consola (StandaloneHost) y conectarse al SDK con una clase de pocas líneas.
 */
import type { GameEventDraft, Mode } from "../adapter/GameStatsAdapter";
import type { Board, Cell } from "../domain/Board";
import type { Seat } from "../domain/Connect4Match";

export interface PlayerInfo {
  playerId: string;
  name: string;
  kind: "human" | "cpu";
  slot: number;
}

/** Payload de INIT. */
export interface MatchContext {
  gameId: string;
  matchId: string;
  mode: Mode;
  players: PlayerInfo[];
  options: Record<string, unknown>;
}

export type StopReason = "user" | "closed";
export type PauseReason = "user" | "hidden";

export interface GameHost {
  /** Un evento para GameStats (el host completa eventId, timestamp, gameId…). */
  emit(event: GameEventDraft): void;
  /** La partida terminó (después de MATCH_FINISHED). */
  finish(winner: string | null, reason: "normal" | "stopped"): void;
  /** Algo salió mal. */
  error(message: string, fatal: boolean): void;
}

export type Status = "loading" | "ready" | "playing" | "paused" | "finished";

/** Todo lo que la vista necesita para dibujar; la vista no toca la partida. */
export interface ViewModel {
  board: Board;
  seats: readonly Seat[];
  current: Seat | null;
  status: Status;
  thinking: boolean;
  winner: Seat | null;
  draw: boolean;
  winningCells: readonly Cell[];
  lastCell: Cell | null;
  hintColumn: number | null;
  hintsLeft: number;
  canPlay: boolean;
  canHint: boolean;
  canUndo: boolean;
  showUndo: boolean;
  timeLeft: number | null;
  message: string | null;
  difficulty: string | null;
}

export interface ViewHandlers {
  column(column: number): void;
  hint(): void;
  undo(): void;
}

export interface Connect4View {
  bind(handlers: ViewHandlers): void;
  render(vm: ViewModel): void;
}
