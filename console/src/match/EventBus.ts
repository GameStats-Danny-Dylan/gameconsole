/**
 * EventBus — el bus de eventos de la consola.
 *
 * Observer: las sesiones publican lo que manda cada juego (GAME_EVENT, STATE y
 * FINISHED) con su matchId, y quien le interese se suscribe sin que la sesión
 * lo conozca. El EventSender (protocolo, sección 6) se suscribirá aquí.
 */
import type { ContractEvent, FinishReason, MatchStatus } from "@gameconsole/sdk";

export interface BusTopics {
  /** Un evento para GameStats, ya completo (lo selló el SDK del juego). */
  "game-event": { matchId: string; event: ContractEvent };
  /** El juego avisó que cambió de estado (mensaje STATE). */
  "state": { matchId: string; state: MatchStatus };
  /** El juego avisó que terminó (mensaje FINISHED). */
  "finished": { matchId: string; winner: string | null; reason: FinishReason };
  /**
   * La sesión se cerró y su iframe ya no está (con FINISHED o sin él: STOP sin
   * respuesta, error, juego colgado). `humans` son los playerId de las personas,
   * para el cierre de respaldo del EventSender (protocolo, sección 5).
   */
  "closed": { matchId: string; humans: string[] };
}

export type BusTopic = keyof BusTopics;
export type BusListener<K extends BusTopic> = (payload: BusTopics[K]) => void;

export class EventBus {
  private readonly listeners = new Map<BusTopic, Set<(payload: never) => void>>();

  /** Se suscribe a un tema. Devuelve cómo desuscribirse. */
  on<K extends BusTopic>(topic: K, listener: BusListener<K>): () => void {
    let set = this.listeners.get(topic);
    if (!set) this.listeners.set(topic, (set = new Set()));
    set.add(listener as (payload: never) => void);
    return () => { set.delete(listener as (payload: never) => void); };
  }

  /** Avisa a todos los suscriptores. Si uno falla, los demás reciben el evento igual. */
  publish<K extends BusTopic>(topic: K, payload: BusTopics[K]): void {
    for (const listener of [...(this.listeners.get(topic) ?? [])]) {
      try {
        (listener as BusListener<K>)(payload);
      } catch (err) {
        console.error(`[consola] un suscriptor de "${topic}" falló`, err);
      }
    }
  }
}
