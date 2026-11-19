/**
 * RegistryClient — anota el juego en el registry y lo mantiene vivo
 * (protocolo, sección 3). Dentro de Docker habla directo con el registry,
 * sin el prefijo /api/registry:
 *
 *   POST   {REGISTRY_URL}/games                 al arrancar (cuerpo: el manifiesto)
 *   PUT    {REGISTRY_URL}/games/{id}/heartbeat  cada 5 s; si da 404, vuelve a mandar el POST
 *   DELETE {REGISTRY_URL}/games/{id}            al apagarse
 *
 * Si el registry todavía no arrancó (o se cae un rato), reintenta sin parar:
 * el juego no depende del orden en que Docker levanta los contenedores.
 */

export interface RegistryClientOptions {
  registryUrl: string;
  /** El manifiesto (game.json). Solo se usa su id; lo demás lo valida el registry. */
  manifest: { id: string };
  /** Cada cuánto se manda el latido (5 s). */
  heartbeatMs?: number;
  /** Cada cuánto se reintenta el registro si el registry no responde (2 s). */
  retryMs?: number;
  /** Tiempo máximo de cada pedido (3 s). */
  timeoutMs?: number;
  log?: (message: string) => void;
}

export class RegistryClient {
  private readonly base: string;
  private readonly id: string;
  private readonly heartbeatMs: number;
  private readonly retryMs: number;
  private readonly timeoutMs: number;
  private readonly log: (message: string) => void;

  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private registered = false;
  private started = false;
  private stopped = false;
  /** Para no repetir el mismo aviso en cada reintento. */
  private lastProblem: string | null = null;

  constructor(private readonly options: RegistryClientOptions) {
    this.base = options.registryUrl.replace(/\/+$/, "");
    this.id = options.manifest.id;
    this.heartbeatMs = options.heartbeatMs ?? 5_000;
    this.retryMs = options.retryMs ?? 2_000;
    this.timeoutMs = options.timeoutMs ?? 3_000;
    this.log = options.log ?? ((m) => console.log(m));
  }

  /** Si el registry ya lo tiene anotado (según el último pedido). */
  get isRegistered(): boolean {
    return this.registered;
  }

  /** Empieza a registrar y latir en segundo plano. No espera al registry. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.tick();
  }

  /** Deja de latir y se va de la lista (DELETE). Nunca lanza: apagarse no puede fallar. */
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // Si había un registro en camino, se espera: si no, podría llegar después del DELETE.
    await this.inFlight?.catch(() => {});
    if (!this.started) return;
    try {
      const res = await this.request("DELETE", `/games/${encodeURIComponent(this.id)}`);
      this.log(res.status === 204 ? `[registry] ${this.id} salió de la lista` : `[registry] DELETE respondió ${res.status}`);
    } catch (err) {
      this.log(`[registry] no se pudo avisar la salida (${messageOf(err)}); el registry lo saca solo al dejar de latir`);
    }
    this.registered = false;
  }

  // ------------------------------------------------------------------

  private tick(): void {
    if (this.stopped) return;
    this.inFlight = (this.registered ? this.heartbeat() : this.register()).finally(() => {
      this.inFlight = null;
    });
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => this.tick(), ms);
    this.timer.unref?.();
  }

  private async register(): Promise<void> {
    try {
      const res = await this.request("POST", "/games", this.options.manifest);
      if (res.status === 201 || res.status === 200) {
        this.registered = true;
        this.lastProblem = null;
        this.log(`[registry] ${this.id} registrado en ${this.base}`);
        return this.schedule(this.heartbeatMs);
      }
      const body = await res.text().catch(() => "");
      // 4xx: el manifiesto tiene un problema; no se arregla solo, así que se reintenta sin apuro.
      this.problem(`el registry rechazó el manifiesto (${res.status}): ${body}`);
      this.schedule(res.status >= 500 ? this.retryMs : this.heartbeatMs);
    } catch (err) {
      this.problem(`el registry no responde todavía (${messageOf(err)}); se reintenta`);
      this.schedule(this.retryMs);
    }
  }

  private async heartbeat(): Promise<void> {
    try {
      const res = await this.request("PUT", `/games/${encodeURIComponent(this.id)}/heartbeat`);
      if (res.status === 404) {
        // El registry se reinició o el juego venció: se vuelve a anotar enseguida.
        this.registered = false;
        this.log(`[registry] ${this.id} no estaba registrado; se registra de nuevo`);
        return this.register();
      }
      if (res.ok) this.lastProblem = null;
      else this.problem(`el latido respondió ${res.status}`);
    } catch (err) {
      this.problem(`el latido no llegó (${messageOf(err)})`);
    }
    this.schedule(this.heartbeatMs);
  }

  private request(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(this.base + path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }

  private problem(message: string): void {
    if (message === this.lastProblem) return;
    this.lastProblem = message;
    this.log(`[registry] ${message}`);
  }
}

const messageOf = (err: unknown) =>
  err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err);
