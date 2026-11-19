/**
 * GameStatsClient — patrón Facade: una sola clase con las consultas que necesita
 * el panel, escondiendo de qué servicio sale cada dato y cómo viene.
 *
 *   Scala  /api/stats/overview   estadísticas terminadas (GameStats v1.1)
 *   Go     /api/games            partidas en curso por juego (GameStats v1.1)
 *   Go     /api/matches          estado de cada partida (v1.0; respaldo de /api/games)
 *   registry /api/registry/games juegos disponibles ahora (nombre e ícono)
 *
 * El panel NO calcula estadísticas: solo agrupa lo que ya devuelve GameStats.
 */
import type { LiveCount, MatchInfo, Overview, RegisteredGame } from "../model";

export type Fetch = typeof fetch;

export class HttpError extends Error {
  constructor(readonly status: number, url: string) {
    super(`${url}: HTTP ${status}`);
  }
}

export class GameStatsClient {
  constructor(private readonly base = "/api", private readonly http: Fetch = (...a) => fetch(...a)) {}

  /** null si este GameStats todavía no tiene /stats (versión anterior a v1.1). */
  async overview(): Promise<Overview | null> {
    try {
      return await this.get<Overview>("/stats/overview");
    } catch (e) {
      if (e instanceof HttpError && e.status === 404) return null;
      throw e;
    }
  }

  async registry(): Promise<RegisteredGame[]> {
    return this.get<RegisteredGame[]>("/registry/games");
  }

  async matches(): Promise<MatchInfo[]> {
    return this.get<MatchInfo[]>("/matches");
  }

  /**
   * Partidas en curso por juego. Usa /api/games (v1.1) y, si no existe, las
   * cuenta desde /api/matches (status "en_curso"), que ya trae Go.
   */
  async live(matches?: MatchInfo[]): Promise<LiveCount[]> {
    try {
      const raw = await this.get<unknown>("/games");
      const list = Array.isArray(raw) ? raw : Object.entries(raw as object).map(([gameId, v]) => ({ gameId, ...(v as object) }));
      return list.map((g: any) => ({
        gameId: String(g.gameId),
        inProgress: Number(g.inProgress ?? g.enCurso ?? g.en_curso ?? 0),
      }));
    } catch (e) {
      if (!(e instanceof HttpError && e.status === 404)) throw e;
      const all = matches ?? (await this.matches());
      const counts = new Map<string, number>();
      for (const m of all) if (m.status === "en_curso") counts.set(m.gameId, (counts.get(m.gameId) ?? 0) + 1);
      return [...counts].map(([gameId, inProgress]) => ({ gameId, inProgress }));
    }
  }

  private async get<T>(path: string): Promise<T> {
    const url = this.base + path;
    const res = await this.http(url, { headers: { accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new HttpError(res.status, url);
    return (await res.json()) as T;
  }
}
