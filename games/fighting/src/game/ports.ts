/**
 * ports.ts — lo que FightingGame necesita de afuera, como interfaces: el reloj
 * de cuadros, el teclado y la vista. En el navegador son requestAnimationFrame,
 * KeyboardInput y el canvas; en las pruebas, versiones de mentira que se
 * manejan a mano.
 */
import type { FightingMatch } from "../domain/FightingMatch";
import type { EffectsSystem } from "../fx/EffectsSystem";
import type { KeySource } from "../input/ControlScheme";

export type Status = "loading" | "ready" | "playing" | "paused" | "finished";

/** Quien llama al ciclo en cada cuadro (requestAnimationFrame en el navegador). */
export interface FrameScheduler {
  request(callback: (timeMs: number) => void): number;
  cancel(id: number): void;
}

export const animationFrames: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};

export interface InputPort extends KeySource {
  /** Fin del cuadro: olvida las teclas "recién apretadas". */
  endFrame(): void;
  /** Suelta todo (al pausar). */
  reset(): void;
}

/** Todo lo que la vista necesita para dibujar. La vista solo lee la pelea. */
export interface ViewModel {
  match: FightingMatch;
  status: Status;
  /** Nombre de quien ganó la pelea (null: empate o sin terminar). */
  winnerName: string | null;
  /** La partida se cerró antes de terminar. */
  stopped: boolean;
  /** Lo que se anima en la presentación (estela de vida, reloj de animaciones...). */
  fx: EffectsSystem | null;
  /** El sonido está silenciado (tecla M). */
  muted: boolean;
}

export interface FightView {
  render(vm: ViewModel): void;
}
