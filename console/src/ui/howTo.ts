/**
 * El "Cómo se juega" de un juego (howToPlay del manifiesto), con los nombres de
 * las teclas resaltados como teclas. Se usa en el formulario (antes de
 * empezar) y en cada partida (durante el juego), así nadie tiene que recordar
 * los controles. Todo es texto: nada del manifiesto se pone como HTML.
 */
import { el } from "./dom";

const KEY_SPLIT = /(\b(?:Espacio|Enter|Esc)\b|[←→↑↓]|\b[A-Z]\b)/;
const IS_KEY = /^(Espacio|Enter|Esc|[←→↑↓]|[A-Z])$/;

export function howToPlayText(text: string): HTMLParagraphElement {
  const p = el("p", {});
  for (const part of text.split(KEY_SPLIT)) {
    if (!part) continue;
    p.append(IS_KEY.test(part) ? el("kbd", { text: part }) : part);
  }
  return p;
}
