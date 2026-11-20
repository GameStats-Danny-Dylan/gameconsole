/**
 * PieceBag — la "bolsa de 7": se mezclan las 7 piezas y se reparten una por
 * una; cuando se acaba, se mezcla otra. Así nunca pasan más de 12 piezas sin
 * ver una I. El generador aleatorio se inyecta para poder probarlo.
 */
import { PIECE_TYPES, type PieceType } from "./Tetromino";

export type Random = () => number;

export class PieceBag {
  private queue: PieceType[] = [];

  constructor(private readonly random: Random = Math.random) {}

  /** La siguiente pieza (y la saca de la bolsa). */
  next(): PieceType {
    this.fill(1);
    return this.queue.shift()!;
  }

  /** Las próximas n piezas sin sacarlas (para mostrar "siguiente"). */
  peek(n = 1): PieceType[] {
    this.fill(n);
    return this.queue.slice(0, n);
  }

  private fill(n: number): void {
    while (this.queue.length < n) this.queue.push(...this.shuffled());
  }

  /** Fisher-Yates. */
  private shuffled(): PieceType[] {
    const bag = [...PIECE_TYPES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    return bag;
  }
}
