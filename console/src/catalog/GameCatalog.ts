/**
 * GameCatalog — la lista de juegos que conoce la consola.
 *
 * - Registry/Singleton: hay un solo catálogo por página (GameCatalog.instance()).
 *   El constructor queda público para poder probarlo con una fuente falsa.
 * - Observer: el menú y el formulario se suscriben y reciben cada cambio.
 *
 * Vuelve a pedir la lista cada 10 s (protocolo, sección 3). Si el registry
 * falla, conserva la última lista y marca "offline" en vez de vaciar el menú.
 */
import type { GameManifest } from "@gameconsole/sdk";
import { RegistryClient, type GameSource } from "./RegistryClient";

export type CatalogStatus = "loading" | "online" | "offline";

export interface CatalogSnapshot {
  readonly games: readonly GameManifest[];
  readonly status: CatalogStatus;
  /** Cuándo respondió bien el registry por última vez. */
  readonly updatedAt: Date | null;
}

export type CatalogListener = (snapshot: CatalogSnapshot) => void;

export const POLL_MS = 10_000;

export class GameCatalog {
  private static shared: GameCatalog | undefined;

  /** El catálogo de la página, contra el registry real. */
  static instance(): GameCatalog {
    return (GameCatalog.shared ??= new GameCatalog(new RegistryClient()));
  }

  private games: readonly GameManifest[] = [];
  private status: CatalogStatus = "loading";
  private updatedAt: Date | null = null;
  private gamesKey = "[]";
  private readonly listeners = new Set<CatalogListener>();
  private inFlight: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    private readonly source: GameSource,
    private readonly pollMs = POLL_MS,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get snapshot(): CatalogSnapshot {
    return { games: this.games, status: this.status, updatedAt: this.updatedAt };
  }

  find(id: string): GameManifest | undefined {
    return this.games.find((g) => g.id === id);
  }

  /** Se suscribe y recibe enseguida el estado actual. Devuelve cómo desuscribirse. */
  subscribe(listener: CatalogListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => { this.listeners.delete(listener); };
  }

  /** Pide la lista una vez. Si ya hay un pedido en curso, espera ese mismo. */
  refresh(): Promise<void> {
    return (this.inFlight ??= this.load().finally(() => { this.inFlight = null; }));
  }

  /** Empieza a consultar: ahora y después cada pollMs (sin pedidos encimados). */
  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      void this.refresh().finally(() => {
        if (this.running) this.timer = setTimeout(tick, this.pollMs);
      });
    };
    tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async load(): Promise<void> {
    try {
      const games = [...(await this.source.list())].sort((a, b) => a.name.localeCompare(b.name, "es"));
      this.updatedAt = this.now();
      this.update(games, "online");
    } catch (err) {
      if (this.status !== "offline")
        console.warn(`[consola] sin conexión con el registry: ${err instanceof Error ? err.message : String(err)}`);
      this.update(this.games, "offline");   // la última lista se queda
    }
  }

  /** Solo avisa si cambió la lista o el estado (no por cada consulta). */
  private update(games: readonly GameManifest[], status: CatalogStatus): void {
    const key = JSON.stringify(games);
    if (key === this.gamesKey && status === this.status) return;
    this.games = games;
    this.gamesKey = key;
    this.status = status;
    const snap = this.snapshot;
    for (const l of [...this.listeners]) l(snap);
  }
}
