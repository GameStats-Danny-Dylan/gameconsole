/**
 * Board — el tablero de 7 columnas × 6 filas. INMUTABLE: soltar una ficha
 * devuelve un tablero nuevo. Así deshacer es volver al tablero anterior y nunca
 * hay que "despintar" fichas.
 *
 * Coordenadas como en GameStats: column 1..7 (izquierda → derecha),
 * row 1..6 (row 1 = abajo). Internamente, cada columna es la lista de fichas de
 * abajo hacia arriba, igual que la recibe Prolog.
 */
export type Color = "red" | "yellow";
export type Direction = "horizontal" | "vertical" | "diagonal";

export interface Cell {
  readonly column: number;
  readonly row: number;
}

export interface Line {
  readonly direction: Direction;
  readonly cells: readonly Cell[];
}

export const COLUMNS = 7;
export const ROWS = 6;

/** Las 4 direcciones de una línea: (paso en columna, paso en fila). */
const DIRECTIONS: ReadonlyArray<readonly [number, number, Direction]> = [
  [1, 0, "horizontal"],
  [0, 1, "vertical"],
  [1, 1, "diagonal"],  // sube hacia la derecha
  [1, -1, "diagonal"], // baja hacia la derecha
];

export const otherColor = (c: Color): Color => (c === "red" ? "yellow" : "red");
export const cellKey = (c: Cell): string => `${c.column},${c.row}`;
export const sameCell = (a: Cell | null | undefined, b: Cell | null | undefined): boolean =>
  !!a && !!b && a.column === b.column && a.row === b.row;

export class Board {
  private constructor(private readonly columns: ReadonlyArray<ReadonlyArray<Color>>) {}

  static empty(): Board {
    return new Board(Array.from({ length: COLUMNS }, () => []));
  }

  /** Desde el formato de Prolog: 7 columnas con sus fichas de abajo hacia arriba. */
  static fromColumns(columns: Color[][]): Board {
    if (columns.length !== COLUMNS || columns.some((c) => c.length > ROWS))
      throw new Error(`el tablero debe tener ${COLUMNS} columnas de 0 a ${ROWS} fichas`);
    return new Board(columns.map((c) => [...c]));
  }

  /** Color de la casilla, o null si está vacía o fuera del tablero. */
  at(column: number, row: number): Color | null {
    return this.columns[column - 1]?.[row - 1] ?? null;
  }

  height(column: number): number {
    return this.columns[column - 1]?.length ?? ROWS;
  }

  canDrop(column: number): boolean {
    return Number.isInteger(column) && column >= 1 && column <= COLUMNS && this.height(column) < ROWS;
  }

  validColumns(): number[] {
    return Array.from({ length: COLUMNS }, (_, i) => i + 1).filter((c) => this.canDrop(c));
  }

  get discCount(): number {
    return this.columns.reduce((n, c) => n + c.length, 0);
  }

  isFull(): boolean {
    return this.discCount === COLUMNS * ROWS;
  }

  /** Suelta una ficha: cae a la primera fila libre (gravedad). */
  drop(column: number, color: Color): { board: Board; cell: Cell } {
    if (!this.canDrop(column)) throw new Error(`no se puede soltar en la columna ${column}`);
    const cell = { column, row: this.height(column) + 1 };
    const columns = this.columns.map((c, i) => (i === column - 1 ? [...c, color] : c));
    return { board: new Board(columns), cell };
  }

  /** El 4 en línea (o más) que pasa por esa casilla, del color de su ficha. */
  lineThrough(cell: Cell): Line | null {
    const color = this.at(cell.column, cell.row);
    if (!color) return null;
    for (const [dc, dr, direction] of DIRECTIONS) {
      const cells = [
        ...this.walk(cell, -dc, -dr, color).reverse(),
        cell,
        ...this.walk(cell, dc, dr, color),
      ];
      if (cells.length >= 4) return { direction, cells };
    }
    return null;
  }

  /**
   * Amenazas de un color: casillas VACÍAS donde una ficha de ese color
   * completaría 4 en línea (aunque todavía no se pueda jugar ahí porque falta
   * llenar la columna por debajo). Es la definición del contrato de GameStats.
   */
  threats(color: Color): Cell[] {
    const found: Cell[] = [];
    for (let column = 1; column <= COLUMNS; column++)
      for (let row = this.height(column) + 1; row <= ROWS; row++)
        if (this.wouldConnect({ column, row }, color)) found.push({ column, row });
    return found;
  }

  /** Formato de Prolog y del JSON: copia de las columnas. */
  toColumns(): Color[][] {
    return this.columns.map((c) => [...c]);
  }

  private wouldConnect(cell: Cell, color: Color): boolean {
    return DIRECTIONS.some(([dc, dr]) =>
      1 + this.walk(cell, dc, dr, color).length + this.walk(cell, -dc, -dr, color).length >= 4);
  }

  /** Casillas seguidas del mismo color a partir de `from` (sin incluirla). */
  private walk(from: Cell, dc: number, dr: number, color: Color): Cell[] {
    const cells: Cell[] = [];
    let column = from.column + dc;
    let row = from.row + dr;
    while (this.at(column, row) === color) {
      cells.push({ column, row });
      column += dc;
      row += dr;
    }
    return cells;
  }
}
