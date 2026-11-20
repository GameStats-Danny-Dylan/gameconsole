/**
 * KeyboardInput — el teclado del navegador como KeySource.
 *
 * Guarda qué teclas están apretadas y cuáles se apretaron desde el último
 * cuadro (así un toque muy corto, que empieza y termina entre dos cuadros, no
 * se pierde). Al perder el foco suelta todo, para que no quede una tecla
 * "pegada" si se soltó con la ventana en otro lado.
 */
import type { KeySource } from "./ControlScheme";

export class KeyboardInput implements KeySource {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly cleanup: (() => void)[] = [];

  /** captured: las teclas del juego (se les quita la acción por defecto, como mover la página con las flechas). */
  constructor(private readonly captured: ReadonlySet<string>, private readonly target: Window = window) {}

  attach(): this {
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
      this.target.addEventListener(type, fn);
      this.cleanup.push(() => this.target.removeEventListener(type, fn));
    };
    on("keydown", (e) => {
      if (!this.captured.has(e.code)) return;
      e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code); // la repetición automática no es otro golpe
      this.down.add(e.code);
    });
    on("keyup", (e) => {
      if (!this.captured.has(e.code)) return;
      e.preventDefault();
      this.down.delete(e.code);
    });
    on("blur", () => this.reset());
    return this;
  }

  detach(): void {
    this.cleanup.splice(0).forEach((f) => f());
    this.reset();
  }

  isDown(code: string): boolean { return this.down.has(code); }
  wasPressed(code: string): boolean { return this.pressed.has(code); }

  /** Se llama al terminar cada cuadro. */
  endFrame(): void { this.pressed.clear(); }

  /** Suelta todo (al pausar o al perder el foco). */
  reset(): void {
    this.down.clear();
    this.pressed.clear();
  }
}
