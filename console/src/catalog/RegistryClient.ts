/**
 * RegistryClient — pide la lista de juegos vivos al registry (protocolo, sección 3).
 *
 * Adapter: convierte la respuesta HTTP de GET /api/registry/games en una lista
 * de GameManifest, sin los campos propios del registry (registeredAt, lastSeen)
 * que cambian en cada latido y no le importan al menú.
 */
import type { GameManifest } from "@gameconsole/sdk";

/** De dónde saca el catálogo los juegos. En las pruebas es un objeto falso. */
export interface GameSource {
  list(): Promise<GameManifest[]>;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const REGISTRY_GAMES_URL = "/api/registry/games";
const TIMEOUT_MS = 5_000;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Lo mínimo para dibujar una tarjeta y armar la partida. El registry ya validó el resto. */
function looksLikeManifest(v: unknown): v is GameManifest & Record<string, unknown> {
  return isObject(v) && typeof v.id === "string" && typeof v.name === "string" &&
    typeof v.entry === "string" && Array.isArray(v.modes) && v.modes.length > 0 && isObject(v.players);
}

export class RegistryClient implements GameSource {
  constructor(
    private readonly fetchFn: FetchLike = (url, init) => fetch(url, init),
    private readonly url = REGISTRY_GAMES_URL,
  ) {}

  async list(): Promise<GameManifest[]> {
    const res = await this.fetchFn(this.url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`el registry respondió ${res.status}`);
    const body: unknown = await res.json();
    if (!Array.isArray(body)) throw new Error("el registry no devolvió una lista");

    return body.filter(looksLikeManifest).map(({ registeredAt: _r, lastSeen: _l, ...manifest }) => manifest as GameManifest);
  }
}
