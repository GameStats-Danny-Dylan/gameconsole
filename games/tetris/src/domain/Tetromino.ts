/**
 * Tetromino / Piece — las 7 piezas y sus 4 rotaciones.
 *
 * Cada pieza se define una sola vez, en su orientación inicial, como una matriz
 * de n × n; las otras tres rotaciones se calculan girando esa matriz. Piece es
 * un valor inmutable: moverla o rotarla devuelve otra pieza, así el tablero
 * puede probar "¿cabe?" sin tocar la pieza real.
 */

export const PIECE_TYPES = ["I", "O", "T", "S", "Z", "J", "L"] as const;
export type PieceType = (typeof PIECE_TYPES)[number];
export type RotationDirection = "cw" | "ccw";

export interface Point { x: number; y: number }

const BASE: Record<PieceType, readonly string[]> = {
  I: ["....", "####", "....", "...."],
  O: ["##", "##"],
  T: [".#.", "###", "..."],
  S: [".##", "##.", "..."],
  Z: ["##.", ".##", "..."],
  J: ["#..", "###", "..."],
  L: ["..#", "###", "..."],
};

/** Celdas (columna, fila) de una matriz de texto. */
function cellsOf(rows: readonly string[]): Point[] {
  const out: Point[] = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") out.push({ x, y }); }));
  return out;
}

/** Gira 90° a la derecha dentro de una matriz de n × n. */
const rotateCw = (cells: Point[], n: number): Point[] => cells.map(({ x, y }) => ({ x: n - 1 - y, y: x }));

/** SHAPES[tipo][rotación] = celdas relativas a la esquina de la matriz. */
const SHAPES: Record<PieceType, Point[][]> = Object.fromEntries(PIECE_TYPES.map((t) => {
  const n = BASE[t].length;
  const states: Point[][] = [cellsOf(BASE[t])];
  for (let i = 1; i < 4; i++) states.push(rotateCw(states[i - 1], n));
  return [t, states];
})) as Record<PieceType, Point[][]>;

export const BOARD_WIDTH = 10;

export class Piece {
  private constructor(
    readonly type: PieceType,
    readonly rotation: number,
    readonly x: number,
    readonly y: number,
  ) {}

  /** La pieza recién aparecida: centrada arriba, con su fila más alta en la fila 0. */
  static spawn(type: PieceType): Piece {
    const size = BASE[type].length;
    const top = Math.min(...SHAPES[type][0].map((c) => c.y));
    return new Piece(type, 0, Math.floor((BOARD_WIDTH - size) / 2), -top);
  }

  static at(type: PieceType, rotation: number, x: number, y: number): Piece {
    return new Piece(type, ((rotation % 4) + 4) % 4, x, y);
  }

  /** Lado de la matriz (4 para la I, 2 para la O, 3 para las demás). */
  get size(): number {
    return BASE[this.type].length;
  }

  /** Celdas ocupadas, en coordenadas del tablero. */
  cells(): Point[] {
    return SHAPES[this.type][this.rotation].map((c) => ({ x: c.x + this.x, y: c.y + this.y }));
  }

  moved(dx: number, dy: number): Piece {
    return new Piece(this.type, this.rotation, this.x + dx, this.y + dy);
  }

  rotated(direction: RotationDirection): Piece {
    return new Piece(this.type, (this.rotation + (direction === "cw" ? 1 : 3)) % 4, this.x, this.y);
  }

  /** La O se ve igual al rotarla: no cuenta como rotación. */
  get rotates(): boolean {
    return this.type !== "O";
  }
}
