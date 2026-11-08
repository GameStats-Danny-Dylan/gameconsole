/**
 * MoveStrategy — patrón Strategy: cómo elige columna la computadora (y la pista).
 * El juego solo conoce esta interfaz; hoy la implementa PrologStrategy, que le
 * pregunta al servicio de Prolog. En las pruebas se usa una estrategia falsa.
 */
import type { Board, Color } from "../domain/Board";
import type { Difficulty } from "../adapter/GameStatsAdapter";

export interface AiDecision {
  column: number;
  engine: string;
  depth: number;
  score: number;
  nodes: number;
  ms: number;
}

export interface MoveStrategy {
  choose(board: Board, color: Color, difficulty: Difficulty, signal?: AbortSignal): Promise<AiDecision>;
}

/**
 * Pregunta a la IA de Prolog: POST {base}/connect4/move (protocolo, sección 7).
 * Es también un Proxy: el juego le pide una jugada como si fuera local y esta
 * clase se encarga de la red, el tiempo límite y los reintentos.
 */
export class PrologStrategy implements MoveStrategy {
  constructor(
    private readonly base = "/api/ai",
    private readonly timeoutMs = 10_000,
    private readonly retries = 2,
  ) {}

  async choose(board: Board, color: Color, difficulty: Difficulty, signal?: AbortSignal): Promise<AiDecision> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (signal?.aborted) throw new DOMException("cancelado", "AbortError");
      try {
        return await this.ask(board, color, difficulty, signal);
      } catch (err) {
        if ((err as Error).name === "AbortError" && signal?.aborted) throw err;
        if (err instanceof BadRequest) throw err; // un 400 no se arregla reintentando
        lastError = err;
        await sleep(500 * 2 ** attempt);
      }
    }
    throw new Error(`la IA no respondió: ${String((lastError as Error)?.message ?? lastError)}`);
  }

  private async ask(board: Board, color: Color, difficulty: Difficulty, signal?: AbortSignal): Promise<AiDecision> {
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const res = await fetch(`${this.base}/connect4/move`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ board: board.toColumns(), player: color, difficulty }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 400) throw new BadRequest(body.error ?? "solicitud inválida");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!board.canDrop(body.column)) throw new Error(`la IA devolvió una columna inválida: ${body.column}`);
    return { column: body.column, engine: "prolog-minimax", depth: body.depth, score: body.score, nodes: body.nodes, ms: body.ms };
  }
}

class BadRequest extends Error {}

/**
 * Patrón Decorator: envuelve otra estrategia y hace que la respuesta tarde
 * al menos `minMs`. Fácil y media responden en milisegundos y la ficha
 * aparecería de golpe; con esto la computadora "piensa" un momento, como
 * una persona. Difícil, que ya tarda más, casi no espera de más.
 */
export class MinThinkTime implements MoveStrategy {
  constructor(
    private readonly inner: MoveStrategy,
    private readonly minMs = 700,
    private readonly now: () => number = () => performance.now(),
  ) {}

  async choose(board: Board, color: Color, difficulty: Difficulty, signal?: AbortSignal): Promise<AiDecision> {
    const start = this.now();
    const decision = await this.inner.choose(board, color, difficulty, signal);
    const rest = this.minMs - (this.now() - start);
    if (rest > 0) await sleep(rest, signal);
    return decision;
  }
}

/** Espera `ms`; si se cancela antes (`signal`), termina con AbortError. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("cancelado", "AbortError"));
    const t = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(new DOMException("cancelado", "AbortError")); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
