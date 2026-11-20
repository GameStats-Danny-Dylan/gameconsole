/**
 * Board — el tablero de 10 × 20: colisiones, fijar piezas y líneas completas.
 * No sabe de puntos, niveles ni eventos: solo de celdas.
 */
import { BOARD_WIDTH, type Piece, type PieceType } from "./Tetromino";

export const BOARD_HEIGHT = 20;
export type Cell = PieceType | null;

export class Board {
  readonly width = BOARD_WIDTH;
  readonly height = BOARD_HEIGHT;
  private rows: Cell[][];

  constructor() {
    this.rows = Array.from({ length: BOARD_HEIGHT }, () => this.emptyRow());
  }

  /** Para pruebas: arma un tablero desde texto (fila 0 arriba; "." vacío, letra = pieza). */
  static fromRows(rows: readonly string[]): Board {
    const b = new Board();
    const offset = BOARD_HEIGHT - rows.length;
    rows.forEach((row, i) => [...row].forEach((ch, x) => { if (ch !== "." && ch !== " ") b.rows[offset + i][x] = ch as PieceType; }));
    return b;
  }

  private emptyRow(): Cell[] {
    return Array<Cell>(BOARD_WIDTH).fill(null);
  }

  /** Fuera del tablero (paredes, piso y techo) cuenta como ocupado. */
  isOccupied(x: number, y: number): boolean {
    if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= BOARD_HEIGHT) return true;
    return this.rows[y][x] !== null;
  }

  cellAt(x: number, y: number): Cell {
    return this.rows[y]?.[x] ?? null;
  }

  /** ¿La pieza choca con una pared, el piso o fichas ya puestas? */
  collides(piece: Piece): boolean {
    return piece.cells().some((c) => this.isOccupied(c.x, c.y));
  }

  /** Fija la pieza en el tablero. */
  lock(piece: Piece): void {
    for (const c of piece.cells()) this.rows[c.y][c.x] = piece.type;
  }

  /** Cuántas filas hacia abajo puede caer la pieza hasta chocar. */
  dropDistance(piece: Piece): number {
    let d = 0;
    while (!this.collides(piece.moved(0, d + 1))) d++;
    return d;
  }

  /** Quita las filas completas, baja lo de arriba y dice cuántas fueron. */
  clearLines(): number {
    const kept = this.rows.filter((row) => row.some((c) => c === null));
    const cleared = BOARD_HEIGHT - kept.length;
    this.rows = [...Array.from({ length: cleared }, () => this.emptyRow()), ...kept];
    return cleared;
  }

  isEmpty(): boolean {
    return this.rows.every((row) => row.every((c) => c === null));
  }

  /** Altura de la pila: filas desde el piso hasta la ficha más alta (0 = vacío). */
  stackHeight(): number {
    const top = this.rows.findIndex((row) => row.some((c) => c !== null));
    return top === -1 ? 0 : BOARD_HEIGHT - top;
  }

  /** Copia de las filas para dibujar (la vista no puede modificar el tablero). */
  snapshot(): readonly (readonly Cell[])[] {
    return this.rows.map((r) => [...r]);
  }
}
