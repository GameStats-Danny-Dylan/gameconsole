/**
 * SlowMotion — cámara lenta: durante un rato el tiempo corre más despacio y al
 * final vuelve suave a la velocidad normal. Se usa en el KO que decide la
 * pelea (los eventos ya salieron: solo cambia cómo se ve la caída).
 */
export class SlowMotion {
  private left = 0;
  private total = 0;
  private factor = 1;

  /** seconds: duración (en tiempo real). factor: velocidad mientras dura (0,3 = 30 %). */
  start(seconds: number, factor: number): void {
    this.left = this.total = seconds;
    this.factor = factor;
  }

  get active(): boolean { return this.left > 0; }

  /** Velocidad del tiempo ahora (1 = normal). El último 30 % vuelve de a poco a 1. */
  get scale(): number {
    if (this.left <= 0) return 1;
    const t = this.left / this.total; // 1 al empezar, 0 al terminar
    if (t > 0.3) return this.factor;
    return 1 - (1 - this.factor) * (t / 0.3);
  }

  /** Avanza en tiempo real. */
  update(realDt: number): void {
    this.left = Math.max(0, this.left - realDt);
  }
}
