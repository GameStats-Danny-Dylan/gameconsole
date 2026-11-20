/**
 * InputBuffer — recuerda por un instante un golpe o un salto pulsado cuando
 * el luchador todavía no lo podía hacer (por ejemplo, en los últimos cuadros
 * de otro golpe). Si se vuelve libre dentro de la ventana, la acción sale
 * sola; si no, se olvida. Así un toque un poco adelantado no se pierde.
 *
 * Solo cambia la intención que ve el estado; no inventa acciones: la acción
 * sale igual que si se hubiera pulsado en ese cuadro.
 */
import type { Intent } from "./Intent";

export class InputBuffer {
  private attackLeft = 0;
  private attackDown = false;
  private jumpLeft = 0;
  private jumpMove: -1 | 0 | 1 = 0;

  /** window: segundos que se recuerda una pulsación. */
  constructor(readonly window: number) {}

  /** La intención de este cuadro con lo que quedó guardado de antes. */
  feed(intent: Intent, dt: number): Intent {
    this.attackLeft = Math.max(0, this.attackLeft - dt);
    this.jumpLeft = Math.max(0, this.jumpLeft - dt);
    if (intent.attack) { this.attackLeft = this.window; this.attackDown = intent.down; }
    if (intent.jump) { this.jumpLeft = this.window; this.jumpMove = intent.move; }
    const attack = this.attackLeft > 0;
    const jump = this.jumpLeft > 0;
    if (attack === intent.attack && jump === intent.jump) return intent;
    return {
      ...intent,
      attack,
      // Una patada guardada sigue siendo patada aunque ya se haya soltado abajo.
      down: intent.down || (attack && !intent.attack && this.attackDown),
      jump,
      move: jump && !intent.jump && intent.move === 0 ? this.jumpMove : intent.move,
    };
  }

  /** El estado ya hizo el golpe guardado. */
  consumeAttack(): void { this.attackLeft = 0; }
  /** El estado ya hizo el salto guardado. */
  consumeJump(): void { this.jumpLeft = 0; }

  clear(): void {
    this.attackLeft = 0;
    this.jumpLeft = 0;
  }

  get pendingAttack(): boolean { return this.attackLeft > 0; }
  get pendingJump(): boolean { return this.jumpLeft > 0; }
}
