import { describe, expect, test } from "vitest";
import { Board } from "../src/domain/Board";
import { PieceBag } from "../src/domain/PieceBag";
import { Level, Scoring } from "../src/domain/Scoring";
import { PIECE_TYPES, Piece } from "../src/domain/Tetromino";
import { rng } from "./support/harness";

describe("Piece", () => {
  test("las 7 piezas tienen 4 celdas en cada rotación", () => {
    for (const t of PIECE_TYPES) for (let r = 0; r < 4; r++) expect(Piece.at(t, r, 3, 3).cells()).toHaveLength(4);
  });

  test("aparece arriba, dentro del tablero y centrada", () => {
    for (const t of PIECE_TYPES) {
      const cells = Piece.spawn(t).cells();
      expect(Math.min(...cells.map((c) => c.y))).toBe(0);
      expect(Math.min(...cells.map((c) => c.x))).toBeGreaterThanOrEqual(3);
      expect(Math.max(...cells.map((c) => c.x))).toBeLessThanOrEqual(6);
    }
  });

  test("cuatro rotaciones a la derecha vuelven a la forma inicial", () => {
    const p = Piece.spawn("T");
    const back = p.rotated("cw").rotated("cw").rotated("cw").rotated("cw");
    expect(back.cells()).toEqual(p.cells());
    expect(p.rotated("cw").rotated("ccw").cells()).toEqual(p.cells());
  });

  test("la I horizontal pasa a vertical", () => {
    const xs = new Set(Piece.spawn("I").rotated("cw").cells().map((c) => c.x));
    expect(xs.size).toBe(1);
  });

  test("moved no modifica la original", () => {
    const p = Piece.spawn("L");
    p.moved(2, 3);
    expect(p.x).toBe(3);
  });
});

describe("Board", () => {
  test("mide 10 x 20 y empieza vacío", () => {
    const b = new Board();
    expect([b.width, b.height]).toEqual([10, 20]);
    expect(b.isEmpty()).toBe(true);
    expect(b.stackHeight()).toBe(0);
  });

  test("paredes, piso y fichas colisionan", () => {
    const b = Board.fromRows(["T........."]);
    expect(b.collides(Piece.at("O", 0, -1, 5))).toBe(true);
    expect(b.collides(Piece.at("O", 0, 9, 5))).toBe(true);
    expect(b.collides(Piece.at("O", 0, 4, 19))).toBe(true);
    expect(b.collides(Piece.at("O", 0, 0, 18))).toBe(true); // choca con la T
    expect(b.collides(Piece.at("O", 0, 4, 10))).toBe(false);
  });

  test("dropDistance: cuánto cae hasta el piso", () => {
    expect(new Board().dropDistance(Piece.spawn("O"))).toBe(18);
  });

  test("lock fija la pieza", () => {
    const b = new Board();
    b.lock(Piece.at("O", 0, 0, 18));
    expect(b.isOccupied(0, 18)).toBe(true);
    expect(b.stackHeight()).toBe(2);
  });

  test("limpia las filas completas y baja lo de arriba", () => {
    const b = Board.fromRows(["T.........", "##########", "S.########", "##########"].map((r) => r.replace(/#/g, "I")));
    // fila 1 y 3 completas; la 2 no
    expect(b.clearLines()).toBe(2);
    expect(b.cellAt(0, 18)).toBe("T");
    expect(b.cellAt(0, 19)).toBe("S");
    expect(b.stackHeight()).toBe(2);
  });

  test("tetris: 4 líneas a la vez y tablero vacío", () => {
    const b = Board.fromRows(Array(4).fill("IIIIIIIIII"));
    expect(b.clearLines()).toBe(4);
    expect(b.isEmpty()).toBe(true);
  });

  test("sin líneas completas no limpia nada", () => {
    expect(Board.fromRows(["IIIIIIIII."]).clearLines()).toBe(0);
  });
});

describe("PieceBag", () => {
  test("cada 7 piezas salen las 7 distintas", () => {
    const bag = new PieceBag(rng(1));
    for (let i = 0; i < 5; i++) {
      const seven = Array.from({ length: 7 }, () => bag.next());
      expect(new Set(seven).size).toBe(7);
    }
  });

  test("peek no saca piezas y coincide con next", () => {
    const bag = new PieceBag(rng(2));
    const seen = bag.peek(10);
    expect(bag.peek(10)).toEqual(seen);
    expect(Array.from({ length: 10 }, () => bag.next())).toEqual(seen);
  });
});

describe("Scoring", () => {
  test("puntos por líneas multiplicados por el nivel", () => {
    expect(new Scoring().clear(1, 1, false).points).toBe(100);
    expect(new Scoring().clear(2, 3, false).points).toBe(900);
    expect(new Scoring().clear(3, 1, false).points).toBe(500);
    expect(new Scoring().clear(4, 2, false).points).toBe(1600);
  });

  test("combo sube con limpiezas seguidas y se corta sin limpiar", () => {
    const s = new Scoring();
    expect(s.clear(1, 1, false)).toEqual({ points: 100, combo: 0 });
    expect(s.clear(1, 1, false)).toEqual({ points: 150, combo: 1 });
    s.noClear();
    expect(s.clear(1, 1, false).combo).toBe(0);
  });

  test("back-to-back: dos tetris seguidos valen 1.5x (como la fixture de GameStats: 800 y 1200)", () => {
    const s = new Scoring();
    expect(s.clear(4, 1, false).points).toBe(800);
    s.noClear();
    expect(s.clear(4, 1, false).points).toBe(1200);
  });

  test("T-spin doble vale 1200 por nivel", () => {
    expect(new Scoring().clear(2, 1, true).points).toBe(1200);
  });

  test("acumula puntaje y líneas", () => {
    const s = new Scoring();
    s.clear(2, 1, false); s.noClear(); s.clear(1, 1, false);
    expect([s.score, s.lines]).toEqual([400, 3]);
  });
});

describe("Level", () => {
  test("sube cada 10 líneas desde el nivel inicial", () => {
    const l = new Level(5);
    expect(l.addLines(9)).toBeNull();
    expect(l.addLines(1)).toBe(6);
    expect(l.value).toBe(6);
  });

  test("tope en 30", () => {
    const l = new Level(15);
    l.addLines(10000);
    expect(l.value).toBe(30);
  });

  test("la gravedad se acelera con el nivel", () => {
    expect(new Level(1).gravityMs).toBe(1000);
    expect(new Level(5).gravityMs).toBeLessThan(new Level(1).gravityMs);
    expect(new Level(15).gravityMs).toBeLessThan(new Level(10).gravityMs);
    expect(new Level(15).gravityMs).toBeGreaterThan(0);
  });
});
