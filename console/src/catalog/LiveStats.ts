/**
 * LiveStats — lo que dice GameStats de cada juego, para las tarjetas del menú:
 * partidas en curso (Go), partidas jugadas y quién va ganando (Scala).
 *
 * Observer: consulta cada pocos segundos y avisa a quien escuche. No calcula
 * nada: solo lee lo que GameStats ya calculó (como pide el enunciado).
 * Las claves son el gameStatsId de cada juego (el gameId de los eventos).
 */
export interface GameLive {
  inProgress: number;
  played: number;
  leader: string | null;
}

export type LiveSnapshot = ReadonlyMap<string, GameLive>;
type FetchLike = (url: string) => Promise<Response>;

export const LIVE_POLL_MS = 5_000;

interface OverviewLike { games?: { gameId: string; matches: number; winners?: { playerId: string; wins: number }[] }[] }
interface MatchLike { gameId: string; status: string }

export class LiveStats {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private last: LiveSnapshot = new Map();
  private readonly listeners = new Set<(s: LiveSnapshot) => void>();

  constructor(
    private readonly base = "/api",
    private readonly fetchFn: FetchLike = (u) => fetch(u),
    private readonly pollMs = LIVE_POLL_MS,
  ) {}

  subscribe(listener: (s: LiveSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.last);
    return () => { this.listeners.delete(listener); };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = async () => {
      await this.refresh();
      if (this.running) this.timer = setTimeout(tick, this.pollMs);
    };
    void tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Una consulta. Si una fuente falla, se usa lo que haya de las otras. */
  async refresh(): Promise<LiveSnapshot> {
    const [overview, inProgress] = await Promise.all([this.overview(), this.inProgress()]);
    const snap = new Map<string, GameLive>();
    const entry = (id: string) => {
      let e = snap.get(id);
      if (!e) snap.set(id, (e = { inProgress: 0, played: 0, leader: null }));
      return e;
    };
    for (const g of overview?.games ?? []) {
      const e = entry(g.gameId);
      e.played = g.matches;
      e.leader = g.winners?.[0]?.playerId ?? null;
    }
    for (const [id, n] of inProgress) entry(id).inProgress = n;
    this.last = snap;
    for (const l of [...this.listeners]) l(snap);
    return snap;
  }

  private async overview(): Promise<OverviewLike | null> {
    try {
      const res = await this.fetchFn(`${this.base}/stats/overview`);
      return res.ok ? (await res.json()) as OverviewLike : null;
    } catch { return null; }
  }

  /** /games de Go (v1.1); si no existe, se cuentan las partidas en curso de /matches. */
  private async inProgress(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    try {
      const res = await this.fetchFn(`${this.base}/games`);
      if (res.ok) {
        for (const g of (await res.json()) as { gameId: string; inProgress: number }[]) counts.set(g.gameId, g.inProgress);
        return counts;
      }
      const m = await this.fetchFn(`${this.base}/matches`);
      if (m.ok)
        for (const x of (await m.json()) as MatchLike[])
          if (x.status === "en_curso") counts.set(x.gameId, (counts.get(x.gameId) ?? 0) + 1);
    } catch { /* sin datos de Go: quedan en 0 */ }
    return counts;
  }
}

/** "cpu" se muestra como la computadora. */
export function playerLabel(id: string): string {
  return id === "cpu" ? "Computadora" : id;
}
