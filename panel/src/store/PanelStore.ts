/**
 * PanelStore — consulta GameStats cada pocos segundos (polling) y avisa a la
 * vista con cada foto nueva (patrón Observer). Cada fuente se consulta por
 * separado: si una falla, las demás se siguen mostrando y se avisa cuál falló.
 */
import type { GameStatsClient } from "../api/GameStatsClient";
import type { LiveCount, MatchInfo, Overview, RegisteredGame } from "../model";

export interface Snapshot {
  overview: Overview | null;      // null: GameStats sin /stats (anterior a v1.1)
  registry: RegisteredGame[];
  live: LiveCount[];
  matches: MatchInfo[];
  errors: string[];               // fuentes que fallaron en esta vuelta
  updatedAt: Date;
}

export type SnapshotListener = (s: Snapshot) => void;

export class PanelStore {
  private readonly listeners = new Set<SnapshotListener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private last: Snapshot | null = null;
  private running = false;

  constructor(private readonly client: GameStatsClient, readonly intervalMs = 3000) {}

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);
    if (this.last) listener(this.last);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Una vuelta: pide todo en paralelo, arma la foto y la publica. */
  async refresh(): Promise<Snapshot> {
    const errors: string[] = [];
    const keep = <T>(label: string, fallback: T) => (e: unknown): T => {
      errors.push(`${label}: ${(e as Error).message}`);
      return fallback;
    };
    const prev = this.last;
    const [overview, registry, matches] = await Promise.all([
      this.client.overview().catch(keep("estadísticas (Scala)", prev?.overview ?? null)),
      this.client.registry().catch(keep("juegos (registry)", prev?.registry ?? [])),
      this.client.matches().catch(keep("partidas (Go)", prev?.matches ?? [])),
    ]);
    const live = await this.client.live(matches).catch(keep("en curso (Go)", prev?.live ?? []));
    const snap: Snapshot = { overview, registry, live, matches, errors, updatedAt: new Date() };
    this.last = snap;
    for (const l of this.listeners) l(snap);
    return snap;
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    await this.refresh();
    // Se programa la siguiente al terminar esta: nunca se encimen dos consultas.
    if (this.running) this.timer = setTimeout(() => void this.tick(), this.intervalMs);
  }
}
