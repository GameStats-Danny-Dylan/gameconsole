import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { MinThinkTime, type AiDecision, type MoveStrategy } from "../src/ai/MoveStrategy";
import { Board } from "../src/domain/Board";

const decision: AiDecision = { column: 4, engine: "prolog-minimax", depth: 1, score: 0, nodes: 7, ms: 2 };

/** Estrategia que responde después de `ms` (con el reloj falso de vitest). */
const after = (ms: number): MoveStrategy => ({
  choose: () => new Promise((r) => setTimeout(() => r(decision), ms)),
});

describe("MinThinkTime (Decorator)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("si la IA responde rápido, espera hasta el mínimo", async () => {
    let done = false;
    new MinThinkTime(after(50), 700, () => Date.now()).choose(Board.empty(), "yellow", "easy").then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(690);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(done).toBe(true);
  });

  test("si la IA ya tardó más que el mínimo, no agrega espera", async () => {
    let done = false;
    new MinThinkTime(after(1000), 700, () => Date.now()).choose(Board.empty(), "yellow", "hard").then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toBe(true);
  });

  test("cancelar durante la espera termina con AbortError", async () => {
    const ctrl = new AbortController();
    const p = new MinThinkTime(after(10), 700, () => Date.now()).choose(Board.empty(), "yellow", "easy", ctrl.signal);
    const check = expect(p).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(100);
    ctrl.abort();
    await check;
  });
});
