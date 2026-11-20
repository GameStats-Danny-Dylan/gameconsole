/**
 * Controles — patrón Strategy: cada jugador tiene su estrategia de controles,
 * que convierte las teclas en una intención (Intent). La pelea no sabe qué
 * teclas hay: solo pide la intención de cada uno. Cambiar las teclas (o poner
 * un control de prueba) es cambiar la estrategia.
 *
 * Se usa KeyboardEvent.code (la tecla física), así funciona igual con teclado
 * en español, inglés o cualquier distribución.
 *
 * Teclas pensadas para evitar el "fantasma" de los teclados comunes (que no
 * registran ciertas combinaciones de 3 o más teclas a la vez): cada jugador
 * está en una zona distinta del teclado (WASD + F/G a la izquierda; flechas,
 * que van en su propia matriz, + K/L a la derecha), y ninguno usa Shift, Ctrl,
 * Alt ni Espacio, que en muchos teclados comparten líneas con WASD.
 */
import type { Intent } from "../domain/fighter/Intent";

export interface KeyBindings {
  left: string;
  right: string;
  up: string;
  down: string;
  attack: string;
  block: string;
}

/** Slot 1 (izquierda). */
export const SLOT1_KEYS: KeyBindings = {
  left: "KeyA", right: "KeyD", up: "KeyW", down: "KeyS", attack: "KeyF", block: "KeyG",
};

/** Slot 2 (derecha). */
export const SLOT2_KEYS: KeyBindings = {
  left: "ArrowLeft", right: "ArrowRight", up: "ArrowUp", down: "ArrowDown", attack: "KeyK", block: "KeyL",
};

/** Lo que una estrategia necesita saber del teclado. */
export interface KeySource {
  /** La tecla está apretada ahora. */
  isDown(code: string): boolean;
  /** La tecla se apretó desde el cuadro anterior (aunque ya se haya soltado). */
  wasPressed(code: string): boolean;
}

export interface ControlStrategy {
  read(keys: KeySource): Intent;
}

/** Controles de teclado con un mapeo de teclas. */
export class KeyboardControls implements ControlStrategy {
  constructor(readonly bindings: KeyBindings) {}

  read(keys: KeySource): Intent {
    const b = this.bindings;
    const left = keys.isDown(b.left), right = keys.isDown(b.right);
    return {
      move: left === right ? 0 : left ? -1 : 1, // las dos a la vez: quieto
      jump: keys.wasPressed(b.up),
      down: keys.isDown(b.down),
      attack: keys.wasPressed(b.attack),
      block: keys.isDown(b.block),
    };
  }

  /** Todas las teclas de este jugador. */
  codes(): string[] {
    return Object.values(this.bindings);
  }
}

/** Factory: los controles de cada slot (slot 1 a la izquierda con WASD, slot 2 con flechas). */
export function controlsForSlot(slot: number): KeyboardControls {
  return new KeyboardControls(slot === 1 ? SLOT1_KEYS : SLOT2_KEYS);
}
