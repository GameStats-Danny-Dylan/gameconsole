/**
 * Intent — lo que un jugador quiere hacer en este cuadro, ya sin teclas.
 * Lo produce una estrategia de controles (input/ControlScheme.ts) y lo usa el
 * estado del luchador para decidir qué hacer. Así el dominio no sabe nada del
 * teclado y se prueba con intenciones escritas a mano.
 */
export interface Intent {
  /** -1 izquierda, 0 quieto, 1 derecha. */
  move: -1 | 0 | 1;
  /** Se acaba de pulsar saltar (flanco: solo el primer cuadro). */
  jump: boolean;
  /** Abajo sostenido (con golpe = patada). */
  down: boolean;
  /** Se acaba de pulsar golpe (flanco). */
  attack: boolean;
  /** Bloqueo sostenido. */
  block: boolean;
}

export const NO_INTENT: Intent = Object.freeze({ move: 0, jump: false, down: false, attack: false, block: false });

export const intent = (partial: Partial<Intent> = {}): Intent => ({ ...NO_INTENT, ...partial });
