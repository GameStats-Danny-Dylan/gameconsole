/**
 * MonotonicClock — reloj estrictamente creciente para los timestamps de una
 * partida (protocolo, sección 5): cada lectura es max(ahora, última + 1 ms).
 *
 * Si dos eventos caen en el mismo milisegundo, o el reloj de la PC se ajusta
 * hacia atrás, el siguiente lleva el anterior + 1 ms. Así ordenar por
 * timestamp da siempre el orden en que se generaron.
 */
export type Now = () => number;

export class MonotonicClock {
  private last: number;

  /**
   * @param now   fuente de la hora en ms (Date.now; en las pruebas, una manual).
   * @param after el reloj empieza después de este instante (ms). Sirve para
   *              continuar una partida desde su último timestamp visto.
   */
  constructor(private readonly now: Now = Date.now, after = Number.NEGATIVE_INFINITY) {
    this.last = after;
  }

  /** El siguiente instante, en ms. Siempre mayor que el anterior. */
  next(): number {
    this.last = Math.max(Math.floor(this.now()), this.last + 1);
    return this.last;
  }

  /** El último instante entregado (o el de arranque si todavía no hubo ninguno). */
  get lastMs(): number {
    return this.last;
  }
}
