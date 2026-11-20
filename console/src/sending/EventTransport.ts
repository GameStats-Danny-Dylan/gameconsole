/**
 * EventTransport — cómo llegan los eventos a GameStats (POST /api/events).
 *
 * El EventSender decide qué y cuándo; el transporte solo manda un lote y dice
 * qué pasó. Así las pruebas usan uno falso, sin red.
 *
 * Go responde 200 con { received, accepted, rejected: [{eventId, reason}] }:
 * cada evento se acepta o se rechaza por separado. Un 4xx es que el lote entero
 * está mal (no se arregla reintentando); un 5xx o un error de red, sí.
 */
import type { ContractEvent } from "@gameconsole/sdk";

export interface Rejection { eventId: string; reason: string }

export type SendResult =
  | { kind: "ok"; accepted: number; rejected: Rejection[] }
  | { kind: "retry"; error: string }     // red caída o 5xx: los eventos se quedan en la cola
  | { kind: "fatal"; error: string };    // 4xx: el lote se descarta (y se avisa)

export interface EventTransport {
  send(batch: readonly ContractEvent[]): Promise<SendResult>;
  /** Al cerrar la pestaña: el navegador lo entrega aunque la página se vaya. */
  beacon(batch: readonly ContractEvent[]): boolean;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;
type BeaconLike = (url: string, data: Blob) => boolean;

export class HttpTransport implements EventTransport {
  constructor(
    private readonly url = "/api/events",
    private readonly fetchFn: FetchLike = (u, i) => fetch(u, i),
    private readonly beaconFn: BeaconLike = (u, d) => navigator.sendBeacon(u, d),
  ) {}

  async send(batch: readonly ContractEvent[]): Promise<SendResult> {
    let res: Response;
    try {
      res = await this.fetchFn(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(batch),
        keepalive: true,      // si la pestaña se cierra a mitad del envío, igual termina
      });
    } catch (err) {
      return { kind: "retry", error: `sin conexión con GameStats (${(err as Error).message})` };
    }
    const body = await res.json().catch(() => ({}));
    if (res.ok) return { kind: "ok", accepted: Number(body.accepted ?? batch.length), rejected: body.rejected ?? [] };
    const error = `HTTP ${res.status}${body.error ? `: ${body.error}` : ""}`;
    return res.status >= 500 ? { kind: "retry", error } : { kind: "fatal", error };
  }

  beacon(batch: readonly ContractEvent[]): boolean {
    try {
      return this.beaconFn(this.url, new Blob([JSON.stringify(batch)], { type: "application/json" }));
    } catch {
      return false;
    }
  }
}
