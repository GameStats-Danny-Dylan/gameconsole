/**
 * MatchMediator — el único que escucha los postMessage de los juegos.
 *
 * Mediator: los iframes no se hablan con las sesiones directamente. Cada
 * mensaje pasa por aquí, se revisa y se entrega a la sesión de su matchId.
 * Se ignora (protocolo, sección 4) todo mensaje:
 *   - de otro origen (event.origin !== location.origin),
 *   - con otro `protocol` o un `type` desconocido o un payload mal armado,
 *   - de un matchId que no es de ninguna partida abierta,
 *   - que no viene del iframe de esa partida (event.source !== iframe.contentWindow).
 */
import {
  GAME_MESSAGE_TYPES, PROTOCOL, type GameMessage, type GameMessageType, type MatchStatus,
} from "@gameconsole/sdk";
import type { MatchSession } from "./MatchSession";

/** Lo que importa de un MessageEvent. */
export interface MessageLike {
  data: unknown;
  origin: string;
  source: unknown;
}

/** Dónde se escuchan los mensajes (window en el navegador). */
export interface MessageTarget {
  addEventListener(type: "message", listener: (e: MessageLike) => void): void;
  removeEventListener(type: "message", listener: (e: MessageLike) => void): void;
}

const STATUSES: readonly MatchStatus[] = ["loading", "ready", "playing", "paused", "finished"];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function validPayload(type: GameMessageType, p: unknown, matchId: string): boolean {
  if (!isObject(p)) return false;
  switch (type) {
    case "READY":
      return true;
    case "STATE":
      return STATUSES.includes(p.state as MatchStatus);
    case "GAME_EVENT":
      // El evento tiene que ser de esta misma partida.
      return isObject(p.event) && p.event.matchId === matchId && typeof p.event.type === "string";
    case "FINISHED":
      return (p.winner === null || typeof p.winner === "string") && (p.reason === "normal" || p.reason === "stopped");
    case "ERROR":
      return typeof p.message === "string" && typeof p.fatal === "boolean";
  }
}

export class MatchMediator {
  private readonly sessions = new Map<string, MatchSession>();
  private readonly listener = (e: MessageLike) => this.handle(e);
  private listening = false;

  constructor(private readonly target: MessageTarget, private readonly origin: string) {}

  start(): void {
    if (this.listening) return;
    this.listening = true;
    this.target.addEventListener("message", this.listener);
  }

  stop(): void {
    this.listening = false;
    this.target.removeEventListener("message", this.listener);
  }

  /** La sesión recibe sus mensajes hasta que quita su iframe. */
  register(session: MatchSession): void {
    this.sessions.set(session.matchId, session);
    session.onDispose(() => {
      if (this.sessions.get(session.matchId) === session) this.sessions.delete(session.matchId);
    });
  }

  get size(): number { return this.sessions.size; }

  /** Revisa un mensaje y, si pasa todo, se lo entrega a su sesión. Devuelve si se entregó. */
  handle(e: MessageLike): boolean {
    if (e.origin !== this.origin) return false;
    const data = e.data;
    if (!isObject(data) || data.protocol !== PROTOCOL) return false;
    const type = data.type as GameMessageType;
    if (!GAME_MESSAGE_TYPES.includes(type)) return false;
    if (typeof data.matchId !== "string") return false;

    const session = this.sessions.get(data.matchId);
    if (!session) return false;
    if (e.source == null || e.source !== session.frame.window) return false;
    if (!validPayload(type, data.payload, data.matchId)) return false;

    session.receive(data as unknown as GameMessage);
    return true;
  }
}
