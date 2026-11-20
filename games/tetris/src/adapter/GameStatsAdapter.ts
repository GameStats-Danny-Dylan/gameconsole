/**
 * GameStatsAdapter — patrón Adapter: traduce los hechos del juego al contrato
 * de eventos de GameStats (gamestats/contracts/event.schema.json).
 *
 * El juego piensa en "se fijó una T y limpió 2 líneas"; GameStats espera
 * PLAYER_ACTION con action PIECE_PLACED y LINES_CLEARED. Solo devuelve la
 * parte que llena el juego (type, action, playerId, data): eventId, timestamp,
 * gameId, gameVersion y matchId los completa el SDK (protocolo, sección 5).
 */
import type { GameEventDraft } from "@gameconsole/sdk";
import type { Fact } from "../domain/facts";

export class GameStatsAdapter {
  /** Tetris es de un solo jugador: todas las acciones llevan el mismo playerId. */
  constructor(private readonly playerId: string) {}

  matchStarted(startLevel: number): GameEventDraft {
    return { type: "MATCH_STARTED", data: { startLevel } };
  }

  playerJoined(): GameEventDraft {
    return { type: "PLAYER_JOINED", playerId: this.playerId, data: {} };
  }

  paused(reason: string): GameEventDraft {
    return { type: "MATCH_PAUSED", data: { reason } };
  }

  resumed(): GameEventDraft {
    return { type: "MATCH_RESUMED", data: {} };
  }

  playerLeft(): GameEventDraft {
    return { type: "PLAYER_LEFT", playerId: this.playerId, data: {} };
  }

  matchFinished(reason: "normal" | "stopped"): GameEventDraft {
    return { type: "MATCH_FINISHED", data: { reason } };
  }

  /** Un hecho de la partida -> evento PLAYER_ACTION. */
  fromFact(f: Fact): GameEventDraft {
    const action = (name: string, data: Record<string, unknown>): GameEventDraft =>
      ({ type: "PLAYER_ACTION", action: name, playerId: this.playerId, data });

    switch (f.kind) {
      case "spawned":      return action("PIECE_SPAWNED", { piece: f.piece });
      case "moved":        return action("PIECE_MOVED", { direction: f.direction });
      case "rotated":      return action("PIECE_ROTATED", { direction: f.direction });
      case "softDrop":     return action("SOFT_DROP", { cells: f.cells });
      case "hardDrop":     return action("HARD_DROP", { cells: f.cells });
      case "hold":         return action("HOLD", { piece: f.piece });
      case "placed":       return action("PIECE_PLACED", { piece: f.piece, hardDrop: f.hardDrop });
      case "tSpin":        return action("T_SPIN", { lines: f.lines });
      case "linesCleared": return action("LINES_CLEARED", { lines: f.lines, points: f.points, combo: f.combo });
      case "allClear":     return action("ALL_CLEAR", { lines: f.lines });
      case "levelUp":      return action("LEVEL_UP", { level: f.level });
      case "stackHeight":  return action("STACK_HEIGHT", { rows: f.rows });
      case "topOut":       return action("TOP_OUT", {});
    }
  }
}
