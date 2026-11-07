import { describe, expect, test } from "vitest";
import { Connect4Match, type Fact, type Seat } from "../src/domain/Connect4Match";

const ana: Seat = { playerId: "ana", name: "Ana", color: "red", kind: "human" };
const beto: Seat = { playerId: "beto", name: "Beto", color: "yellow", kind: "human" };
const cpu: Seat = { playerId: "cpu", name: "Computadora", color: "yellow", kind: "cpu" };

/** Juega columnas alternando turnos y devuelve los hechos de la última jugada. */
function play(match: Connect4Match, ...columns: number[]): Fact[] {
  let last: Fact[] = [];
  for (const c of columns) last = match.drop(c);
  return last;
}

describe("Connect4Match", () => {
  test("empieza el slot 1 y los turnos se alternan", () => {
    const m = new Connect4Match([ana, beto]);
    expect(m.current.playerId).toBe("ana");
    m.drop(4);
    expect(m.current.playerId).toBe("beto");
  });

  test("no acepta jugadores repetidos", () => {
    expect(() => new Connect4Match([ana, { ...ana, color: "yellow" }])).toThrow();
  });

  test("gana con 4 en línea y la partida termina", () => {
    const m = new Connect4Match([ana, beto]);
    const facts = play(m, 1, 1, 2, 2, 3, 3, 4);
    expect(facts.map((f) => f.kind)).toEqual(["disc", "connectFour"]);
    expect(m.finished).toBe(true);
    expect(m.winner?.playerId).toBe("ana");
    expect(m.winningCells).toHaveLength(4);
    expect(() => m.drop(5)).toThrow();
  });

  test("crea la amenaza al tener 3 y el rival la tapa", () => {
    const m = new Connect4Match([ana, beto]);
    // ana: 2, 3, 4 abajo -> amenazas en (1,1) y (5,1)
    const created = play(m, 2, 2, 3, 3, 4);
    expect(created.filter((f) => f.kind === "threatCreated").map((f) => (f as any).cell))
      .toEqual([{ column: 1, row: 1 }, { column: 5, row: 1 }]);
    const blocked = m.drop(5);
    expect(blocked).toContainEqual({ kind: "threatBlocked", player: "beto", cell: { column: 5, row: 1 }, attacker: "ana" });
  });

  test("una amenaza ya abierta no se vuelve a anunciar", () => {
    const m = new Connect4Match([ana, beto]);
    play(m, 2, 2, 3, 3, 4);           // amenazas en (1,1) y (5,1)
    const next = play(m, 7, 7);        // ana juega lejos: las mismas amenazas siguen abiertas
    expect(next.filter((f) => f.kind === "threatCreated")).toEqual([]);
  });

  test("tablero lleno sin ganador: empate", () => {
    const m = new Connect4Match([ana, beto]);
    // Orden de columnas que llena el tablero sin 4 en línea.
    const order = [1, 2, 1, 2, 1, 2, 2, 1, 2, 1, 2, 1, 3, 4, 3, 4, 3, 4, 4, 3, 4, 3, 4, 3,
                   5, 6, 5, 6, 5, 6, 6, 5, 6, 5, 6, 5, 7, 7, 7, 7, 7, 7];
    let last: Fact[] = [];
    for (const c of order) last = m.drop(c);
    expect(last.at(-1)).toEqual({ kind: "draw" });
    expect(m.isDraw).toBe(true);
  });

  describe("deshacer (Command)", () => {
    test("solo contra la computadora, en el turno de la persona, y deshace de a dos", () => {
      const m = new Connect4Match([ana, cpu]);
      m.drop(4);
      expect(m.canUndo("ana")).toBe(false);   // turno de la computadora
      m.drop(3);
      expect(m.canUndo("ana")).toBe(true);
      expect(m.canUndo("cpu")).toBe(false);
      const facts = m.undo("ana");
      expect(facts).toEqual([
        { kind: "undo", player: "ana", cell: { column: 3, row: 1 } },
        { kind: "undo", player: "ana", cell: { column: 4, row: 1 } },
      ]);
      expect(m.board.discCount).toBe(0);
      expect(m.current.playerId).toBe("ana");
    });

    test("entre dos personas no se deshace", () => {
      const m = new Connect4Match([ana, beto]);
      play(m, 4, 3);
      expect(m.canUndo("ana")).toBe(false);
    });

    test("deshacer restaura las amenazas", () => {
      const m = new Connect4Match([ana, cpu]);
      play(m, 2, 7, 3, 7);                 // ana: 2 y 3 abajo
      const f = play(m, 4, 1);             // ana arma la amenaza en (5,1); cpu tapa en (1,1)
      expect(f.some((x) => x.kind === "threatBlocked")).toBe(true);
      m.undo("ana");                       // vuelve a antes de la ficha 4 de ana
      const again = m.drop(4);             // al volver a jugarla, las amenazas se anuncian de nuevo
      expect(again.filter((x) => x.kind === "threatCreated")).toHaveLength(2);
    });
  });

  test("tiempo agotado: pasa el turno sin ficha", () => {
    const m = new Connect4Match([ana, beto]);
    expect(m.timeout(30)).toEqual([{ kind: "timeout", player: "ana", seconds: 30 }]);
    expect(m.current.playerId).toBe("beto");
    expect(m.board.discCount).toBe(0);
  });

  test("los hechos se publican a los suscriptores (Observer)", () => {
    const m = new Connect4Match([ana, beto]);
    const seen: string[] = [];
    m.facts.on((f) => seen.push(f.kind));
    m.drop(4);
    m.hint(3);
    expect(seen).toEqual(["disc", "hint"]);
  });
});
