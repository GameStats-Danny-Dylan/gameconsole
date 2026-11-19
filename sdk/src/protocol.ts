/**
 * protocol.ts — los tipos del protocolo gameconsole/1 (docs/protocolo.md).
 * Lo usan los juegos (con GameApp) y la consola, así los dos lados hablan
 * exactamente el mismo idioma.
 */

export const PROTOCOL = "gameconsole/1";

// ------------------------------------------------------------------
// Manifiesto (sección 2)
// ------------------------------------------------------------------

export const MODES = ["solo", "vs-cpu", "local-2p"] as const;
export type Mode = (typeof MODES)[number];

export interface GameOption {
  key: string;
  label: string;
  type: string;
  values?: (string | number)[];
  labels?: string[];
  default?: string | number;
  modes?: Mode[];
  [extra: string]: unknown;
}

export interface GameManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  /** El gameId que va en cada evento hacia GameStats. */
  gameStatsId: string;
  gameVersion: string;
  entry: string;
  icon?: string;
  players: { min: number; max: number };
  modes: Mode[];
  options?: GameOption[];
  protocol: string;
}

// ------------------------------------------------------------------
// Partida (sección 4)
// ------------------------------------------------------------------

export interface PlayerInfo {
  playerId: string;
  name: string;
  kind: "human" | "cpu";
  slot: number;
}

/** Payload de INIT. `gameId` es el `id` del manifiesto. */
export interface MatchContext {
  gameId: string;
  matchId: string;
  mode: Mode;
  players: PlayerInfo[];
  options: Record<string, unknown>;
}

export type MatchStatus = "loading" | "ready" | "playing" | "paused" | "finished";
export type PauseReason = "user" | "hidden";
export type StopReason = "user" | "closed";
export type FinishReason = "normal" | "stopped";

// ------------------------------------------------------------------
// Eventos hacia GameStats (sección 5)
// ------------------------------------------------------------------

export const EVENT_TYPES = [
  "MATCH_STARTED", "MATCH_FINISHED", "MATCH_PAUSED", "MATCH_RESUMED",
  "PLAYER_JOINED", "PLAYER_LEFT", "PLAYER_DISCONNECTED", "PLAYER_RECONNECTED",
  "PLAYER_ACTION",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** La parte del evento que llena el juego. */
export interface GameEventDraft {
  type: EventType;
  action?: string;
  playerId?: string;
  data?: Record<string, unknown>;
}

/** El evento completo, tal como lo espera GameStats. */
export interface ContractEvent extends GameEventDraft {
  eventId: string;
  timestamp: string;
  gameId: string;
  gameVersion: string;
  matchId: string;
}

/** Lo que el juego necesita del SDK: emitir, terminar y avisar errores (sección 9). */
export interface GameHost {
  emit(event: GameEventDraft): void;
  finish(winner: string | null, reason: FinishReason): void;
  error(message: string, fatal: boolean): void;
}

// ------------------------------------------------------------------
// Mensajes (sección 4)
// ------------------------------------------------------------------

export interface Envelope<T extends string, P> {
  protocol: typeof PROTOCOL;
  type: T;
  matchId: string;
  payload: P;
}

/** Consola -> juego. */
export type ConsoleMessage =
  | Envelope<"INIT", MatchContext>
  | Envelope<"START", Record<string, never>>
  | Envelope<"PAUSE", { reason: PauseReason }>
  | Envelope<"RESUME", Record<string, never>>
  | Envelope<"STOP", { reason: StopReason }>;

/** Juego -> consola. */
export type GameMessage =
  | Envelope<"READY", Record<string, never>>
  | Envelope<"STATE", { state: MatchStatus }>
  | Envelope<"GAME_EVENT", { event: ContractEvent }>
  | Envelope<"FINISHED", { winner: string | null; reason: FinishReason }>
  | Envelope<"ERROR", { message: string; fatal: boolean }>;

export type ConsoleMessageType = ConsoleMessage["type"];
export type GameMessageType = GameMessage["type"];

export const CONSOLE_MESSAGE_TYPES: readonly ConsoleMessageType[] = ["INIT", "START", "PAUSE", "RESUME", "STOP"];
export const GAME_MESSAGE_TYPES: readonly GameMessageType[] = ["READY", "STATE", "GAME_EVENT", "FINISHED", "ERROR"];

/** El payload de un mensaje según su tipo. */
export type PayloadOf<M extends { type: string; payload: unknown }, T extends M["type"]> =
  Extract<M, { type: T }>["payload"];
