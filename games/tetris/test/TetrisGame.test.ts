import { describe, expect, test } from "vitest";
import type { Fact } from "../src/domain/facts";
import { TetrisGame, LOCK_DELAY_MS, clampLevel } from "../src/game/TetrisGame";
import { Board } from "../src/domain/Board";
import { PieceBag } from "../src/domain/PieceBag";
import { Piece, type PieceType } from "../src/domain/Tetromino";
import { rng } from "./support/harness";

function newGame(startLevel = 1, seed = 7) {
  const g = new TetrisGame({ startLevel, random: rng(seed) });
  const facts: Fact[] = [];
  g.facts.on((f) => facts.push(f));
  return { g, facts, kinds: () => facts.map((f) => f.kind) };
}

/** Deja pasar el tiempo, como el ciclo (cuadros de 100 ms), hasta que la pieza toca el piso. */
function ground(g: TetrisGame) {
  const bottom = () => Math.max(...g.snapshot().piece.map((c) => c.y));
  while (bottom() < 19 - 0 && g.snapshot().ghost.some((c, i) => c.y !== g.snapshot().piece[i].y)) g.update(100);
}

describe("estados", () => {
  test("ready → playing → paused → playing → stopped", () => {
    const { g } = newGame();
    expect(g.status).toBe("ready");
    g.start(); expect(g.status).toBe("playing");
    g.pause(); expect(g.status).toBe("paused");
    g.resume(); expect(g.status).toBe("playing");
    g.stop(); expect(g.status).toBe("stopped");
  });

  test("start publica la primera pieza; pause/resume no publican nada", () => {
    const { g, kinds } = newGame();
    g.start();
    g.pause(); g.resume();
    expect(kinds()).toEqual(["spawned"]);
  });

  test("en pausa ni el tiempo ni las teclas hacen nada", () => {
    const { g, facts } = newGame();
    g.start(); g.pause();
    const before = JSON.stringify(g.snapshot().piece);
    g.update(5000);
    expect(g.move("left")).toBe(false);
    expect(g.hardDrop()).toBe(false);
    expect(JSON.stringify(g.snapshot().piece)).toBe(before);
    expect(facts).toHaveLength(1);
  });

  test("antes de start y después de stop no se puede jugar", () => {
    const { g } = newGame();
    expect(g.move("left")).toBe(false);
    g.start(); g.stop();
    expect(g.hardDrop()).toBe(false);
    g.start(); g.resume();
    expect(g.status).toBe("stopped");
  });

  test("clampLevel", () => {
    expect([clampLevel(0), clampLevel(99), clampLevel(7.9), clampLevel(NaN)]).toEqual([1, 15, 7, 1]);
  });
});

describe("gravedad y acciones", () => {
  test("la gravedad baja la pieza sin publicar hechos", () => {
    const { g, facts } = newGame();
    g.start();
    const y0 = Math.min(...g.snapshot().piece.map((c) => c.y));
    g.update(1000);
    expect(Math.min(...g.snapshot().piece.map((c) => c.y))).toBe(y0 + 1);
    expect(facts).toHaveLength(1);
  });

  test("a mayor nivel cae más rápido", () => {
    const slow = newGame(1).g, fast = newGame(10).g;
    slow.start(); fast.start();
    slow.update(500); fast.update(500);
    expect(Math.min(...fast.snapshot().piece.map((c) => c.y))).toBeGreaterThan(Math.min(...slow.snapshot().piece.map((c) => c.y)));
  });

  test("mover publica solo si se movió", () => {
    const { g, facts } = newGame();
    g.start();
    for (let i = 0; i < 12; i++) g.move("left");
    const moves = facts.filter((f) => f.kind === "moved");
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.length).toBeLessThan(12); // chocó con la pared
    expect(g.move("left")).toBe(false);
  });

  test("rotar publica la dirección", () => {
    const { g, facts } = newGame(1, 3);
    g.start();
    // la O no rota; se prueba con la primera pieza que rote
    if (g.snapshot().pieceType === "O") g.hardDrop();
    expect(g.rotate("cw")).toBe(true);
    expect(facts.at(-1)).toEqual({ kind: "rotated", direction: "cw" });
  });

  test("las bajadas suaves se juntan en un solo SOFT_DROP al fijar", () => {
    const { g, facts } = newGame();
    g.start();
    for (let i = 0; i < 5; i++) g.softDrop();
    g.hardDrop();
    const soft = facts.filter((f) => f.kind === "softDrop");
    expect(soft).toEqual([{ kind: "softDrop", cells: 5 }]);
    const order = facts.map((f) => f.kind);
    expect(order.indexOf("softDrop")).toBeLessThan(order.indexOf("hardDrop"));
  });

  test("caída instantánea: HARD_DROP, PIECE_PLACED y la siguiente pieza", () => {
    const { g, kinds, facts } = newGame();
    g.start();
    g.hardDrop();
    expect(kinds().slice(0, 5)).toEqual(["spawned", "hardDrop", "placed", "stackHeight", "spawned"]);
    expect(facts[1]).toMatchObject({ kind: "hardDrop", cells: 18 });
    expect(facts[2]).toMatchObject({ kind: "placed", hardDrop: true });
  });

  test("apoyada, la pieza se fija sola tras el retraso (hardDrop false)", () => {
    const { g, facts } = newGame();
    g.start();
    ground(g); // cae hasta el piso
    const placed = () => facts.filter((f) => f.kind === "placed");
    expect(placed()).toHaveLength(0);
    g.update(LOCK_DELAY_MS + 1);
    expect(placed()).toEqual([expect.objectContaining({ hardDrop: false })]);
  });

  test("mover una pieza apoyada reinicia el retraso de fijado", () => {
    const { g, facts } = newGame();
    g.start();
    ground(g);
    g.update(LOCK_DELAY_MS / 2);
    g.move("right"); // reinicia el retraso
    g.update(LOCK_DELAY_MS - 100);
    expect(facts.some((f) => f.kind === "placed")).toBe(false);
  });

  test("HOLD guarda la pieza una vez por pieza y saca otra", () => {
    const { g, facts } = newGame();
    g.start();
    const first = g.snapshot().pieceType!;
    expect(g.hold()).toBe(true);
    expect(g.hold()).toBe(false);
    expect(g.snapshot().hold).toBe(first);
    expect(facts.map((f) => f.kind).slice(0, 3)).toEqual(["spawned", "hold", "spawned"]);
    g.hardDrop();
    expect(g.hold()).toBe(true); // pieza nueva: se puede otra vez
    expect(g.snapshot().pieceType).toBe(first); // la guardada vuelve
  });
});

/** Una bolsa con piezas fijas (luego, la bolsa normal). */
class FixedBag extends PieceBag {
  constructor(private readonly seq: PieceType[]) { super(rng(1)); }
  override next(): PieceType { return this.seq.length ? this.seq.shift()! : super.next(); }
  override peek(n = 1): PieceType[] { return [...this.seq, ...super.peek(n)].slice(0, n); }
}

/** Pozo en la columna 0 con `rows` filas llenas, listo para una I vertical. */
const well = (rows: number) => Board.fromRows(Array(rows).fill(".IIIIIIIII"));

describe("líneas, puntaje y nivel", () => {
  test("una I vertical en el pozo: tetris, 800 puntos, tablero vacío (ALL_CLEAR)", () => {
    const board = well(4);
    const g = new TetrisGame({ board, bag: new FixedBag(["I"]) });
    const facts: Fact[] = []; g.facts.on((f) => facts.push(f));
    g.start();
    g.rotate("cw");
    while (g.move("left"));
    g.hardDrop();
    const kinds = facts.map((f) => f.kind);
    expect(kinds).toContain("linesCleared");
    expect(facts.find((f) => f.kind === "linesCleared")).toEqual({ kind: "linesCleared", lines: 4, points: 800, combo: 0 });
    expect(facts.find((f) => f.kind === "allClear")).toEqual({ kind: "allClear", lines: 4 });
    expect(g.snapshot().score).toBe(800);
    expect(g.snapshot().lines).toBe(4);
    // orden: PIECE_PLACED antes de LINES_CLEARED, y ALL_CLEAR después
    expect(kinds.indexOf("placed")).toBeLessThan(kinds.indexOf("linesCleared"));
    expect(kinds.indexOf("linesCleared")).toBeLessThan(kinds.indexOf("allClear"));
  });

  test("LEVEL_UP al completar 10 líneas", () => {
    const g = new TetrisGame({ startLevel: 5, board: well(4), bag: new FixedBag(["I", "I", "I"]) });
    const facts: Fact[] = []; g.facts.on((f) => facts.push(f));
    g.start();
    const level = (g as unknown as { level: { addLines(n: number): number | null } }).level;
    level.addLines(6); // ya había 6 líneas
    g.rotate("cw"); while (g.move("left")); g.hardDrop(); // 4 más = 10
    expect(facts.filter((f) => f.kind === "levelUp")).toEqual([{ kind: "levelUp", level: 6 }]);
    expect(g.snapshot().level).toBe(6);
  });

  test("STACK_HEIGHT solo cuando cambia la altura", () => {
    const { g, facts } = newGame();
    g.start();
    g.hardDrop();
    const heights = facts.filter((f) => f.kind === "stackHeight");
    expect(heights).toHaveLength(1);
    expect(heights[0]).toMatchObject({ rows: expect.any(Number) });
  });

  test("T-spin: la T gira en el hueco y se publica T_SPIN antes de LINES_CLEARED", () => {
    // Hueco en forma de T boca abajo:  fila 18: ###.#####  fila 19: ##...#####
    const board = Board.fromRows(["..I.......", "II...IIIII", "III.IIIIII"]);
    const g = new TetrisGame({ board, bag: new FixedBag(["T"]) });
    const facts: Fact[] = []; g.facts.on((f) => facts.push(f));
    g.start();
    // coloca la T apuntando abajo (rotación 2) sobre el hueco, y la gira para que cuente como giro
    const internal = g as unknown as { current: Piece; lastWasRotation: boolean };
    internal.current = Piece.at("T", 2, 2, 17);
    expect(board.collides(internal.current)).toBe(false);
    internal.lastWasRotation = true;
    g.hardDrop();
    const kinds = facts.map((f) => f.kind);
    expect(facts.find((f) => f.kind === "tSpin")).toEqual({ kind: "tSpin", lines: 2 });
    expect(kinds.indexOf("tSpin")).toBeLessThan(kinds.indexOf("linesCleared"));
  });

  test("sin giro previo no es T-spin", () => {
    const board = Board.fromRows(["..I.......", "II...IIIII", "III.IIIIII"]);
    const g = new TetrisGame({ board, bag: new FixedBag(["T"]) });
    const facts: Fact[] = []; g.facts.on((f) => facts.push(f));
    g.start();
    (g as unknown as { current: Piece }).current = Piece.at("T", 2, 2, 17);
    g.hardDrop();
    expect(facts.some((f) => f.kind === "tSpin")).toBe(false);
  });
});

describe("game over", () => {
  test("termina al no poder entrar una pieza: TOP_OUT una sola vez y nada después", () => {
    const { g, facts } = newGame();
    g.start();
    let guard = 0;
    while (g.status === "playing" && guard++ < 100) g.hardDrop();
    expect(g.status).toBe("over");
    expect(facts.filter((f) => f.kind === "topOut")).toHaveLength(1);
    expect(facts.at(-1)).toEqual({ kind: "topOut" });
    const n = facts.length;
    g.update(10000); g.move("left"); g.hardDrop(); g.hold(); g.pause(); g.stop();
    expect(g.status).toBe("over");
    expect(facts).toHaveLength(n);
  });

  test("con el tablero lleno arriba, empezar ya es game over", () => {
    const g = new TetrisGame({ board: Board.fromRows(Array(20).fill("IIII.IIIII")), bag: new FixedBag(["O"]) });
    const facts: Fact[] = []; g.facts.on((f) => facts.push(f));
    g.start();
    expect(g.status).toBe("over");
    expect(facts).toEqual([{ kind: "topOut" }]);
  });
});
