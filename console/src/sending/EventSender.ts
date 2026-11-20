/**
 * EventSender — manda a GameStats los eventos de todas las partidas
 * (protocolo, sección 6).
 *
 * - Observer: se suscribe al EventBus ("game-event" y "closed"); nadie lo llama.
 * - Una cola por partida (MatchQueue): una partida lenta o con errores no
 *   frena a las demás, y nunca se mezclan eventos de partidas distintas.
 * - Lotes: POST /api/events cada 500 ms o al juntar 20, lo que pase primero.
 *   Dentro de una partida, en orden y nunca dos envíos a la vez.
 * - Reintentos con RetryPolicy (Strategy) si la red falla o hay 5xx; los
 *   eventos no se pierden. Un 4xx o un evento rechazado se avisa y se sigue.
 * - Cierre de respaldo: si una partida se cierra con MATCH_STARTED pero sin
 *   MATCH_FINISHED, manda PLAYER_LEFT por persona y MATCH_FINISHED sin data,
 *   continuando eventId y timestamp (EventStamper.continueFrom del SDK).
 * - Al cerrar la pestaña (flushOnUnload): lo pendiente y los cierres van con
 *   sendBeacon.
 * - Todo es asíncrono: la consola y los juegos nunca esperan a la red.
 */
import { EventStamper, type ContractEvent } from "@gameconsole/sdk";
import type { EventBus } from "../match/EventBus";
import type { EventTransport } from "./EventTransport";
import { BackoffPolicy, type RetryPolicy } from "./RetryPolicy";

export const CPU_ID = "cpu";

export interface SenderStatus {
  /** Eventos que todavía no llegan a GameStats. */
  pending: number;
  /** Eventos que GameStats ya recibió. */
  sent: number;
  /** Eventos que GameStats rechazó (quedan en la consola del navegador). */
  rejected: number;
  /** Alguna partida está reintentando porque GameStats no responde. */
  failing: boolean;
  lastError: string | null;
}

export interface SenderOptions {
  retry?: RetryPolicy;
  batchMs?: number;
  batchMax?: number;
  log?: Pick<Console, "warn">;
}

/** Lo que el EventSender sabe de cada partida. */
class MatchQueue {
  readonly pending: ContractEvent[] = [];
  readonly humans = new Set<string>();
  last: ContractEvent | null = null;
  started = false;
  finished = false;
  closed = false;
  /** Cuántos eventos del principio de `pending` van en el envío en curso. */
  inFlight = 0;
  attempt = 0;
  timer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly matchId: string) {}
}

export class EventSender {
  private readonly queues = new Map<string, MatchQueue>();
  /** Partidas cerradas y ya enviadas: si algo llega tarde, se ignora (GameStats lo rechazaría). */
  private readonly done = new Set<string>();
  private readonly listeners = new Set<(s: SenderStatus) => void>();
  private readonly retry: RetryPolicy;
  private readonly batchMs: number;
  private readonly batchMax: number;
  private readonly log: Pick<Console, "warn">;
  private sent = 0;
  private rejected = 0;
  private lastError: string | null = null;

  constructor(private readonly transport: EventTransport, options: SenderOptions = {}) {
    this.retry = options.retry ?? new BackoffPolicy();
    this.batchMs = options.batchMs ?? 500;
    this.batchMax = options.batchMax ?? 20;
    this.log = options.log ?? console;
  }

  /** Se suscribe al bus de la consola. Devuelve cómo desuscribirse. */
  attach(bus: EventBus): () => void {
    const offEvent = bus.on("game-event", ({ event }) => this.enqueue(event));
    const offClosed = bus.on("closed", ({ matchId, humans }) => this.close(matchId, humans));
    return () => { offEvent(); offClosed(); };
  }

  get status(): SenderStatus {
    let pending = 0, failing = false;
    for (const q of this.queues.values()) { pending += q.pending.length; failing ||= q.attempt > 0; }
    return { pending, sent: this.sent, rejected: this.rejected, failing, lastError: failing ? this.lastError : null };
  }

  onChange(listener: (s: SenderStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => { this.listeners.delete(listener); };
  }

  /** Un evento sellado por el SDK del juego. */
  enqueue(event: ContractEvent): void {
    if (this.done.has(event.matchId)) return;
    const q = this.queue(event.matchId);
    if (q.closed || q.finished) return;      // después de MATCH_FINISHED GameStats ya no acepta nada
    this.track(q, event);
    q.pending.push(event);
    if (q.pending.length - q.inFlight >= this.batchMax && q.attempt === 0) this.flushNow(q);
    else this.schedule(q, this.batchMs);
    this.notify();
  }

  /** La sesión se cerró: cierre de respaldo si hace falta y se manda ya. */
  close(matchId: string, humans: readonly string[] = []): void {
    const q = this.queues.get(matchId);
    if (!q || q.closed) return;
    q.closed = true;
    this.backupClose(q, humans);
    if (q.pending.length) this.flushNow(q); else this.retire(q);
    this.notify();
  }

  /**
   * La pestaña se está cerrando: las partidas abiertas se cierran con el
   * respaldo y todo lo que no está en un envío en curso va con sendBeacon
   * (el envío en curso termina solo: usa keepalive).
   */
  flushOnUnload(): void {
    for (const q of this.queues.values()) {
      if (q.timer) clearTimeout(q.timer);
      q.timer = null;
      this.backupClose(q, [...q.humans]);
      const rest = q.pending.slice(q.inFlight);
      for (let i = 0; i < rest.length; i += this.batchMax) this.transport.beacon(rest.slice(i, i + this.batchMax));
      q.pending.splice(q.inFlight);
      q.closed = true;
    }
  }

  // ------------------------------------------------------------------

  private queue(matchId: string): MatchQueue {
    let q = this.queues.get(matchId);
    if (!q) this.queues.set(matchId, (q = new MatchQueue(matchId)));
    return q;
  }

  private track(q: MatchQueue, e: ContractEvent): void {
    q.last = e;
    if (e.type === "MATCH_STARTED") q.started = true;
    if (e.type === "MATCH_FINISHED") q.finished = true;
    if (e.type === "PLAYER_JOINED" && e.playerId && e.playerId !== CPU_ID && e.data?.bot !== true) q.humans.add(e.playerId);
  }

  /** PLAYER_LEFT por persona y MATCH_FINISHED sin data, solo si empezó y no terminó. */
  private backupClose(q: MatchQueue, humans: readonly string[]): void {
    if (!q.started || q.finished || !q.last) return;
    const stamper = EventStamper.continueFrom(q.last);
    const people = humans.length ? humans : [...q.humans];
    for (const playerId of people) q.pending.push(stamper.stamp({ type: "PLAYER_LEFT", playerId }));
    q.pending.push(stamper.stamp({ type: "MATCH_FINISHED" }));
    q.finished = true;
  }

  private schedule(q: MatchQueue, ms: number): void {
    if (q.timer || q.inFlight) return;   // ya hay un envío en camino o esperando
    q.timer = setTimeout(() => { q.timer = null; void this.flush(q); }, ms);
  }

  private flushNow(q: MatchQueue): void {
    if (q.timer) clearTimeout(q.timer);
    q.timer = null;
    void this.flush(q);
  }

  private async flush(q: MatchQueue): Promise<void> {
    if (q.inFlight || q.pending.length === 0) return;
    const batch = q.pending.slice(0, this.batchMax);
    q.inFlight = batch.length;
    const result = await this.transport.send(batch);
    q.inFlight = 0;

    if (result.kind === "retry") {
      q.attempt++;
      this.lastError = result.error;
      q.timer = setTimeout(() => { q.timer = null; void this.flush(q); }, this.retry.delay(q.attempt));
      this.notify();
      return;
    }

    q.pending.splice(0, batch.length);
    q.attempt = 0;
    if (result.kind === "fatal") {
      this.rejected += batch.length;
      this.log.warn(`[consola] GameStats rechazó un lote de ${q.matchId}: ${result.error}`);
    } else {
      this.sent += result.accepted;
      this.rejected += result.rejected.length;
      for (const r of result.rejected) this.log.warn(`[consola] GameStats rechazó ${r.eventId}: ${r.reason}`);
    }

    if (q.pending.length) void this.flush(q);           // lo que llegó mientras se enviaba
    else if (q.closed) this.retire(q);                   // partida cerrada y todo enviado
    this.notify();
  }

  private retire(q: MatchQueue): void {
    this.queues.delete(q.matchId);
    this.done.add(q.matchId);
  }

  private notify(): void {
    const s = this.status;
    for (const l of [...this.listeners]) l(s);
  }
}
