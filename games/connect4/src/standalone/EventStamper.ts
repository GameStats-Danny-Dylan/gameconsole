/**
 * EventStamper — completa los campos que en la consola llena el SDK
 * (protocolo, sección 5): eventId `{matchId}-e{n}`, timestamp, gameId,
 * gameVersion y matchId. Solo se usa para jugar sin consola y en las pruebas.
 *
 * Los timestamps nunca retroceden (si el reloj de la PC se ajusta hacia atrás,
 * se repite el anterior): GameStats ordena por timestamp y, con empates,
 * respeta el orden de llegada.
 */
import type { GameEventDraft } from "../adapter/GameStatsAdapter";

export interface ContractEvent extends GameEventDraft {
  eventId: string;
  timestamp: string;
  gameId: string;
  gameVersion: string;
  matchId: string;
}

export class EventStamper {
  private n = 0;
  private lastMs = 0;

  constructor(
    readonly matchId: string,
    readonly gameId = "connect4",
    readonly gameVersion = "1.0",
    private readonly now: () => number = Date.now,
  ) {}

  stamp(draft: GameEventDraft): ContractEvent {
    this.n++;
    this.lastMs = Math.max(this.lastMs, this.now());
    return {
      eventId: `${this.matchId}-e${this.n}`,
      timestamp: new Date(this.lastMs).toISOString(),
      gameId: this.gameId,
      gameVersion: this.gameVersion,
      matchId: this.matchId,
      ...draft,
    };
  }
}
