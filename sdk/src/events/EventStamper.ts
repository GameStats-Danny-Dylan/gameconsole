/**
 * EventStamper — patrón Adapter: convierte lo que describe el juego
 * (type, action, playerId, data) en un evento completo del contrato de
 * GameStats, llenando los campos del SDK (protocolo, sección 5):
 *
 *   eventId     {matchId}-e{n}, n = 1, 2, 3… por partida
 *   timestamp   RFC 3339, estrictamente creciente (MonotonicClock)
 *   gameId      gameStatsId del manifiesto
 *   gameVersion gameVersion del manifiesto
 *   matchId     el de INIT
 *
 * La consola usa el mismo sellador para el cierre de respaldo, continuando
 * la numeración y el reloj desde el último evento visto (continueFrom).
 */
import type { ContractEvent, GameEventDraft } from "../protocol";
import { MonotonicClock, type Now } from "./MonotonicClock";

export interface StamperConfig {
  matchId: string;
  /** gameStatsId del manifiesto. */
  gameId: string;
  gameVersion: string;
  now?: Now;
}

const EVENT_NUMBER = /-e(\d+)$/;

export class EventStamper {
  private n: number;
  private readonly clock: MonotonicClock;

  constructor(
    private readonly config: StamperConfig,
    start: { count: number; afterMs: number } = { count: 0, afterMs: Number.NEGATIVE_INFINITY },
  ) {
    this.n = start.count;
    this.clock = new MonotonicClock(config.now, start.afterMs);
  }

  /**
   * Un sellador que sigue después de `last` (el último evento visto de la
   * partida): eventId con el número siguiente y timestamp mayor.
   */
  static continueFrom(last: ContractEvent, now?: Now): EventStamper {
    const match = EVENT_NUMBER.exec(last.eventId);
    const count = match ? Number(match[1]) : 0;
    const afterMs = Date.parse(last.timestamp);
    return new EventStamper(
      { matchId: last.matchId, gameId: last.gameId, gameVersion: last.gameVersion, now },
      { count, afterMs: Number.isNaN(afterMs) ? Number.NEGATIVE_INFINITY : afterMs },
    );
  }

  get matchId(): string {
    return this.config.matchId;
  }

  /** Cuántos eventos lleva sellados la partida. */
  get count(): number {
    return this.n;
  }

  stamp(draft: GameEventDraft): ContractEvent {
    this.n++;
    // Solo se copian los campos del juego: el SDK manda sobre los suyos.
    const event: ContractEvent = {
      eventId: `${this.config.matchId}-e${this.n}`,
      timestamp: new Date(this.clock.next()).toISOString(),
      gameId: this.config.gameId,
      gameVersion: this.config.gameVersion,
      matchId: this.config.matchId,
      type: draft.type,
    };
    if (draft.action !== undefined) event.action = draft.action;
    if (draft.playerId !== undefined) event.playerId = draft.playerId;
    if (draft.data !== undefined) event.data = draft.data;
    return event;
  }
}
