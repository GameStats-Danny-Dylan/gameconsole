/**
 * GameLoop — el ciclo con tiempo delta: en cada cuadro avisa cuántos ms pasaron
 * desde el anterior. Se detiene con stop() (pausa). Un cuadro muy largo se
 * recorta para que la pieza no salte al volver a la pestaña.
 */
export interface Loop {
  start(tick: (dtMs: number) => void): void;
  stop(): void;
}

export class RafLoop implements Loop {
  private id: number | null = null;
  private lastTime = 0;

  start(tick: (dtMs: number) => void): void {
    this.stop();
    this.lastTime = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(now - this.lastTime, 100);
      this.lastTime = now;
      tick(dt);
      this.id = requestAnimationFrame(frame);
    };
    this.id = requestAnimationFrame(frame);
  }

  stop(): void {
    if (this.id !== null) cancelAnimationFrame(this.id);
    this.id = null;
  }
}
