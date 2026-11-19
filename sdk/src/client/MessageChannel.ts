/**
 * MessageChannel.ts — el canal del juego con la consola (protocolo, sección 4).
 *
 * Patrón Facade: GameApp solo ve "llegó un mensaje válido" y "manda este
 * mensaje". Todo lo de postMessage queda aquí adentro:
 *   - se ignoran los mensajes de otro origen (event.origin !== el propio),
 *   - con otro `protocol`, con un `type` desconocido o con un payload mal armado,
 *   - y los de otra partida (otro `matchId`).
 *
 * La clase se llama ConsoleChannel para no tapar al MessageChannel del navegador.
 * El transporte es una interfaz: en el navegador es window.parent; en las
 * pruebas, uno falso.
 */
import {
  CONSOLE_MESSAGE_TYPES, MODES, PROTOCOL,
  type ConsoleMessage, type ConsoleMessageType, type GameMessage, type GameMessageType, type PayloadOf,
} from "../protocol";

/** Lo mínimo para mandar y recibir mensajes. */
export interface Transport {
  send(message: unknown, targetOrigin: string): void;
  /** Recibe (datos, origen). Devuelve una función para dejar de escuchar. */
  subscribe(handler: (data: unknown, origin: string) => void): () => void;
}

/** Transporte real: el juego vive en un iframe y su consola es window.parent. */
export class WindowTransport implements Transport {
  constructor(
    private readonly self: Window = window,
    private readonly parent: Window = window.parent,
  ) {}

  send(message: unknown, targetOrigin: string): void {
    this.parent.postMessage(message, targetOrigin);
  }

  subscribe(handler: (data: unknown, origin: string) => void): () => void {
    const listener = (e: MessageEvent) => {
      if (e.source !== this.parent) return; // solo la consola que abrió este iframe
      handler(e.data, e.origin);
    };
    this.self.addEventListener("message", listener);
    return () => this.self.removeEventListener("message", listener);
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Revisa el payload de cada tipo. Un payload que no sirve hace que el mensaje se ignore. */
function validPayload(type: ConsoleMessageType, payload: unknown, matchId: string): boolean {
  if (!isObject(payload)) return false;
  switch (type) {
    case "INIT":
      return payload.matchId === matchId &&
        typeof payload.gameId === "string" &&
        MODES.includes(payload.mode as never) &&
        Array.isArray(payload.players) &&
        payload.players.every((p) => isObject(p) && typeof p.playerId === "string" &&
          typeof p.name === "string" && (p.kind === "human" || p.kind === "cpu") && Number.isInteger(p.slot)) &&
        isObject(payload.options);
    case "PAUSE":
      return payload.reason === "user" || payload.reason === "hidden";
    case "STOP":
      return payload.reason === "user" || payload.reason === "closed";
    case "START":
    case "RESUME":
      return true;
  }
}

export class ConsoleChannel {
  private boundMatchId: string | null;

  /**
   * @param transport por dónde viajan los mensajes.
   * @param origin    el origen propio; solo se aceptan mensajes de ese origen
   *                  y solo se mandan a ese origen.
   * @param matchId   el de la URL (?matchId=…). Si falta, se toma el del primer INIT válido.
   */
  constructor(
    private readonly transport: Transport,
    private readonly origin: string,
    matchId: string | null = null,
  ) {
    this.boundMatchId = matchId;
  }

  /** El canal de un juego que corre dentro de la consola. */
  static fromWindow(win: Window = window): ConsoleChannel {
    const matchId = new URLSearchParams(win.location.search).get("matchId");
    return new ConsoleChannel(new WindowTransport(win, win.parent), win.location.origin, matchId);
  }

  get matchId(): string | null {
    return this.boundMatchId;
  }

  /** Recibe solo mensajes válidos de esta partida. Devuelve una función para dejar de escuchar. */
  onMessage(handler: (message: ConsoleMessage) => void): () => void {
    return this.transport.subscribe((data, origin) => {
      const message = this.accept(data, origin);
      if (message) handler(message);
    });
  }

  send<T extends GameMessageType>(type: T, payload: PayloadOf<GameMessage, T>): void {
    if (this.boundMatchId === null) return; // sin partida todavía: no hay a quién avisar
    this.transport.send({ protocol: PROTOCOL, type, matchId: this.boundMatchId, payload }, this.origin);
  }

  /** El mensaje, si pasa todos los filtros; si no, null. */
  private accept(data: unknown, origin: string): ConsoleMessage | null {
    if (origin !== this.origin || !isObject(data)) return null;
    if (data.protocol !== PROTOCOL) return null;
    const type = data.type as ConsoleMessageType;
    if (!CONSOLE_MESSAGE_TYPES.includes(type)) return null;
    if (typeof data.matchId !== "string") return null;

    // Sin matchId en la URL, el primer INIT válido fija la partida.
    if (this.boundMatchId === null) {
      if (type !== "INIT" || !validPayload(type, data.payload, data.matchId)) return null;
      this.boundMatchId = data.matchId;
    }
    if (data.matchId !== this.boundMatchId) return null;
    if (!validPayload(type, data.payload, data.matchId)) return null;
    return data as unknown as ConsoleMessage;
  }
}
