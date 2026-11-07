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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
