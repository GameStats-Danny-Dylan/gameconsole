/**
 * Scoring y Level.
 *
 * El puntaje es la suma de lo que vale cada limpieza de líneas (es lo que
 * GameStats suma de los eventos LINES_CLEARED); soltar piezas no da puntos.
 * Level sube cada 10 líneas y define qué tan rápido cae la pieza.
 */

export const MAX_LEVEL = 30;
export const LINES_PER_LEVEL = 10;

const LINE_POINTS = [0, 100, 300, 500, 800];
const T_SPIN_POINTS = [400, 800, 1200, 1600];

export interface ClearResult {
  points: number;
  /** Limpiezas seguidas anteriores a esta (la primera es 0). */
  combo: number;
}

export class Scoring {
  private _score = 0;
  private _lines = 0;
  private comboCount = -1; // -1 = la última pieza no limpió nada
  private backToBack = false;

  get score(): number { return this._score; }
  get lines(): number { return this._lines; }

  /** Una limpieza de 1 a 4 líneas, con el nivel en que ocurrió. */
  clear(lines: number, level: number, tSpin: boolean): ClearResult {
    this.comboCount += 1;
    const combo = this.comboCount;
    // Tetris y T-spin con líneas son "difíciles": dos seguidas valen 1.5×.
    const difficult = lines === 4 || tSpin;
    let points = (tSpin ? T_SPIN_POINTS[lines] : LINE_POINTS[lines]) * level;
    if (difficult && this.backToBack) points = Math.floor(points * 1.5);
    points += 50 * combo * level;
    this.backToBack = difficult;
    this._score += points;
    this._lines += lines;
    return { points, combo };
  }

  /** Una pieza que no limpia líneas corta la racha de combos. */
  noClear(): void {
    this.comboCount = -1;
  }
}

export class Level {
  private _lines = 0;

  constructor(readonly startLevel: number) {}

  get value(): number {
    return Math.min(MAX_LEVEL, this.startLevel + Math.floor(this._lines / LINES_PER_LEVEL));
  }

  /** Suma líneas y devuelve el nivel nuevo si subió, o null si sigue igual. */
  addLines(n: number): number | null {
    const before = this.value;
    this._lines += n;
    return this.value > before ? this.value : null;
  }

  /** Milisegundos que tarda la pieza en bajar una fila (curva de la guía de Tetris). */
  get gravityMs(): number {
    const l = this.value;
    return Math.max(1, Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000);
  }
}
