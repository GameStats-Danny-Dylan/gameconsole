/**
 * CameraRig — la cámara de la presentación: sacudida de pantalla (en golpes
 * fuertes y en el KO) y un zoom leve hacia un punto (el KO final). La vista
 * aplica `offsetX/offsetY`, `zoom` y `focus` al dibujar el mundo; el marcador
 * no se mueve.
 *
 * La sacudida baja hasta 0 en su duración (cuadrática, se apaga suave) y su
 * "ruido" sale de senos con distintas frecuencias: dos corridas iguales dan la
 * misma sacudida.
 */
export class CameraRig {
  private shakeLeft = 0;
  private shakeTotal = 0;
  private shakeAmp = 0;
  private time = 0;

  zoom = 1;
  focusX = 480;
  focusY = 270;
  private zoomTarget = 1;
  private targetX = 480;
  private targetY = 270;

  /** Sacude `amplitude` px durante `seconds` (si ya sacudía más fuerte, gana la más fuerte). */
  shake(amplitude: number, seconds: number): void {
    if (this.intensity > amplitude) return;
    this.shakeAmp = amplitude;
    this.shakeLeft = this.shakeTotal = seconds;
  }

  /** Acerca la cámara a `scale` mirando hacia (x, y). */
  zoomTo(scale: number, x: number, y: number): void {
    this.zoomTarget = scale;
    this.targetX = x;
    this.targetY = y;
  }

  /** Vuelve a la vista normal (de a poco). */
  release(): void {
    this.zoomTarget = 1;
    this.targetX = 480;
    this.targetY = 270;
  }

  /** Vuelve a la vista normal ya mismo (round nuevo). */
  reset(): void {
    this.release();
    this.zoom = 1;
    this.focusX = this.targetX;
    this.focusY = this.targetY;
    this.shakeLeft = 0;
  }

  update(dt: number): void {
    if (dt <= 0) return;
    this.time += dt;
    this.shakeLeft = Math.max(0, this.shakeLeft - dt);
    const k = 1 - Math.exp(-6 * dt);
    this.zoom += (this.zoomTarget - this.zoom) * k;
    this.focusX += (this.targetX - this.focusX) * k;
    this.focusY += (this.targetY - this.focusY) * k;
    if (Math.abs(this.zoom - this.zoomTarget) < 1e-4) this.zoom = this.zoomTarget;
  }

  /** Fuerza de la sacudida ahora (px). */
  get intensity(): number {
    if (this.shakeLeft <= 0) return 0;
    const t = this.shakeLeft / this.shakeTotal;
    return this.shakeAmp * t * t;
  }

  get shaking(): boolean { return this.shakeLeft > 0; }

  get offsetX(): number {
    const a = this.intensity;
    return a ? a * (0.7 * Math.sin(this.time * 91) + 0.3 * Math.sin(this.time * 157 + 1.3)) : 0;
  }

  get offsetY(): number {
    const a = this.intensity;
    return a ? a * 0.7 * (0.6 * Math.sin(this.time * 113 + 0.7) + 0.4 * Math.sin(this.time * 199)) : 0;
  }
}
