/**
 * HitStop — congela la pelea unos cuadros cuando un golpe toca, para que se
 * sienta el impacto. Mientras dura, la pelea no avanza (ni el reloj del
 * round); las chispas y la sacudida sí siguen.
 *
 * Se mide en segundos (no en cuadros), así dura lo mismo a cualquier
 * velocidad de pantalla. consume(dt) devuelve cuánto de ese dt puede avanzar
 * la pelea: 0 mientras está congelada y lo que sobre al terminar.
 */
import type { Impact } from "../domain/FightingMatch";

export const FRAME = 1 / 60;

/** Cuadros de congelado por tipo de golpe (2 a 4: corto y seco). */
export const HITSTOP_FRAMES = {
  blocked: 2,
  punch: 3,
  kick: 4,
  ko: 4,
} as const;

export function hitStopFor(i: Impact): number {
  if (i.kind === "blocked") return HITSTOP_FRAMES.blocked * FRAME;
  if (i.ko) return HITSTOP_FRAMES.ko * FRAME;
  return HITSTOP_FRAMES[i.move] * FRAME;
}

export class HitStop {
  private remaining = 0;

  get active(): boolean { return this.remaining > 1e-6; }
  get timeLeft(): number { return this.active ? this.remaining : 0; }

  /** Congela `seconds` (si ya estaba congelado, se queda con el más largo). */
  trigger(seconds: number): void {
    this.remaining = Math.max(this.remaining, seconds);
  }

  consume(dt: number): number {
    if (!this.active) return dt;
    const used = Math.min(dt, this.remaining);
    this.remaining -= used;
    const left = dt - used;
    return left > 1e-6 ? left : 0;
  }

  clear(): void { this.remaining = 0; }
}
