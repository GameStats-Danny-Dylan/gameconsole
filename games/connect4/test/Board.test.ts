import { describe, expect, test } from "vitest";
import { Board, type Color } from "../src/domain/Board";

/** Tablero desde columnas con letras: "RY" = rojo abajo, amarillo encima. */
const b = (...cols: string[]) =>
  Board.fromColumns(cols.map((c) => [...c].map((x): Color => (x === "R" ? "red" : "yellow"))));

describe("Board", () => {
  test("la ficha cae a la primera fila libre y el tablero no cambia (inmutable)", () => {
    const empty = Board.empty();
    const { board, cell } = empty.drop(3, "red");
    expect(cell).toEqual({ column: 3, row: 1 });
    expect(board.drop(3, "yellow").cell).toEqual({ column: 3, row: 2 });
    expect(empty.discCount).toBe(0);
  });

  test("columna llena o inexistente no acepta fichas", () => {
    const full = b("RYRYRY", "", "", "", "", "", "");
    expect(full.canDrop(1)).toBe(false);
    expect(full.canDrop(0)).toBe(false);
    expect(full.canDrop(8)).toBe(false);
    expect(() => full.drop(1, "red")).toThrow();
    expect(full.validColumns()).toEqual([2, 3, 4, 5, 6, 7]);
  });

  test("4 en línea horizontal, vertical y en las dos diagonales", () => {
    expect(b("R", "R", "R", "R", "", "", "").lineThrough({ column: 2, row: 1 })?.direction).toBe("horizontal");
    expect(b("YYYY", "", "", "", "", "", "").lineThrough({ column: 1, row: 4 })?.direction).toBe("vertical");
    const up = b("R", "YR", "YYR", "YYYR", "", "", "");
    expect(up.lineThrough({ column: 4, row: 4 })).toMatchObject({ direction: "diagonal" });
    expect(up.lineThrough({ column: 4, row: 4 })?.cells).toHaveLength(4);
    const down = b("", "", "", "YYYR", "YYR", "YR", "R");
    expect(down.lineThrough({ column: 7, row: 1 })?.direction).toBe("diagonal");
  });

  test("3 en línea no es 4", () => {
    expect(b("R", "R", "R", "Y", "", "", "").lineThrough({ column: 3, row: 1 })).toBeNull();
  });

  test("amenazas: casillas vacías que completarían 4 (aunque no se puedan jugar todavía)", () => {
    // Rojo tiene 3 abajo en columnas 2-4: amenaza en (1,1) y (5,1).
    expect(b("", "R", "R", "R", "", "", "").threats("red")).toEqual([{ column: 1, row: 1 }, { column: 5, row: 1 }]);
    // Diagonal con la cuarta casilla "en el aire": (4,4) con la columna 4 de altura 1.
    const t = b("R", "YR", "YYR", "Y", "", "", "").threats("red");
    expect(t).toContainEqual({ column: 4, row: 4 });
    expect(b("", "", "", "", "", "", "").threats("red")).toEqual([]);
  });

  test("toColumns es el formato de Prolog", () => {
    expect(b("RY", "", "", "", "", "", "").toColumns()).toEqual([["red", "yellow"], [], [], [], [], [], []]);
  });
});
