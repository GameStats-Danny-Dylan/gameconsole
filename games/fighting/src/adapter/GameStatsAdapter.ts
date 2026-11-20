/**
 * GameStatsAdapter — patrón Adapter: traduce los hechos de la pelea al
 * contrato de eventos de GameStats (gamestats/contracts/event.schema.json).
 *
 * La pelea piensa en "Ana le conectó una patada a Beto por 11"; GameStats
 * espera { type: "PLAYER_ACTION", action: "ATTACK", playerId: "ana",
 * data: { targetId: "beto", move: "kick", hit: true, damage: 11, round: 1 } }.
 * Solo arma la parte que llena el juego (type, action, playerId, data): el SDK
 * completa eventId, timestamp, gameId, gameVersion y matchId (protocolo, sección 5).
 */
import type { GameEventDraft } from "@gameconsole/sdk";
import type { FightFact } from "../domain/FightingMatch";

export class GameStatsAdapter {
  /** fighting exige `stage` y `rounds` (1, 3 o 5). */
  matchStarted(stage: string, rounds: number): GameEventDraft {
    return { type: "MATCH_STARTED", data: { stage, rounds } };
  }

  /** fighting exige `character`. */
  playerJoined(playerId: string, character: string): GameEventDraft {
    return { type: "PLAYER_JOINED", playerId, data: { character } };
  }

  paused(reason: string): GameEventDraft {
    return { type: "MATCH_PAUSED", data: { reason } };
  }

  resumed(): GameEventDraft {
    return { type: "MATCH_RESUMED", data: {} };
  }

  playerLeft(playerId: string): GameEventDraft {
    return { type: "PLAYER_LEFT", playerId, data: {} };
  }

  matchFinished(reason: "normal" | "stopped"): GameEventDraft {
    return { type: "MATCH_FINISHED", data: { reason } };
  }

  /** Un hecho de la pelea -> PLAYER_ACTION. El fin de la pelea no es una acción: null. */
  fromFact(f: FightFact): GameEventDraft | null {
    const action = (action: string, playerId: string, data: Record<string, unknown>): GameEventDraft =>
      ({ type: "PLAYER_ACTION", action, playerId, data });

    switch (f.kind) {
      case "attack":
        // Un golpe que no conectó (al aire o bloqueado) va con damage 0, como exige el contrato.
        return action("ATTACK", f.attacker, {
          targetId: f.target, move: f.move, hit: f.hit, damage: f.hit ? f.damage : 0, round: f.round,
        });
      case "block":
        return action("BLOCK", f.defender, { attackerId: f.attacker, round: f.round });
      case "combo":
        return action("COMBO", f.attacker, { targetId: f.target, hits: f.hits, damage: f.damage, round: f.round });
      case "knockdown":
        return action("KNOCKDOWN", f.attacker, { targetId: f.target, round: f.round });
      case "roundWon":
        return action("ROUND_WON", f.winner, { round: f.round, remainingHealth: f.remainingHealth, method: f.method });
      case "roundDraw":
        return action("ROUND_DRAW", f.player, { round: f.round, method: f.method, otherId: f.other });
      case "matchOver":
        return null;
    }
  }
}
