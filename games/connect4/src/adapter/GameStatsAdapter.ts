/**
 * GameStatsAdapter — patrón Adapter: traduce los hechos del juego al contrato
 * de eventos de GameStats (gamestats/contracts/event.schema.json).
 *
 * El juego piensa en "cayó una ficha en la casilla (4, 2)"; GameStats espera
 * { type: "PLAYER_ACTION", action: "DISC_DROPPED", data: { column: 4, row: 2 } }.
 * Solo devuelve la parte que llena el juego (type, action, playerId, data):
 * eventId, timestamp, gameId, gameVersion y matchId los completa el SDK
 * (protocolo, sección 5).
 */
import type { Fact, Seat } from "../domain/Connect4Match";

export type EventType =
  | "MATCH_STARTED" | "MATCH_FINISHED" | "MATCH_PAUSED" | "MATCH_RESUMED"
  | "PLAYER_JOINED" | "PLAYER_LEFT" | "PLAYER_DISCONNECTED" | "PLAYER_RECONNECTED"
  | "PLAYER_ACTION";

export interface GameEventDraft {
  type: EventType;
  action?: string;
  playerId?: string;
  data?: Record<string, unknown>;
}

export type Difficulty = "easy" | "medium" | "hard";
export type Mode = "vs-cpu" | "local-2p";

export class GameStatsAdapter {
  matchStarted(mode: Mode, options: Record<string, unknown>): GameEventDraft {
    return { type: "MATCH_STARTED", data: { mode, ...options } };
  }

  /** connect4 exige `color`; la computadora además lleva `bot` y `difficulty`. */
  playerJoined(seat: Seat, difficulty?: Difficulty): GameEventDraft {
    const data: Record<string, unknown> = { color: seat.color };
    if (seat.kind === "cpu") {
      data.bot = true;
      if (difficulty) data.difficulty = difficulty;
    }
    return { type: "PLAYER_JOINED", playerId: seat.playerId, data };
  }

  paused(reason: string): GameEventDraft {
    return { type: "MATCH_PAUSED", data: { reason } };
  }

  resumed(): GameEventDraft {
    return { type: "MATCH_RESUMED", data: {} };
  }

  playerLeft(seat: Seat): GameEventDraft {
    return { type: "PLAYER_LEFT", playerId: seat.playerId, data: {} };
  }

  matchFinished(reason: "normal" | "stopped"): GameEventDraft {
    return { type: "MATCH_FINISHED", data: { reason } };
  }

  /** Un hecho de la partida -> evento PLAYER_ACTION. El empate no es una acción: null. */
  fromFact(f: Fact): GameEventDraft | null {
    const action = (action: string, playerId: string, data: Record<string, unknown>): GameEventDraft =>
      ({ type: "PLAYER_ACTION", action, playerId, data });

    switch (f.kind) {
      case "disc":
        return action("DISC_DROPPED", f.player, { ...f.cell, ...(f.ai ? { ai: f.ai } : {}) });
      case "threatCreated":
        return action("THREAT_CREATED", f.player, { ...f.cell });
      case "threatBlocked":
        return action("THREAT_BLOCKED", f.player, { ...f.cell, attackerId: f.attacker });
      case "connectFour":
        return action("CONNECT_FOUR", f.player, { direction: f.direction });
      case "undo":
        return action("UNDO", f.player, { ...f.cell });
      case "hint":
        return action("HINT_USED", f.player, { column: f.column });
      case "timeout":
        return action("TURN_TIMEOUT", f.player, { seconds: f.seconds });
      case "draw":
        return null;
    }
  }
}
