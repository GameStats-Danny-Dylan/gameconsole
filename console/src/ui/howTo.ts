/**
 * El "Cómo se juega" de un juego (howToPlay del manifiesto), ordenado para
 * alguien que nunca lo jugó:
 *
 *   🎯 Objetivo      qué hay que lograr            (siempre abierto)
 *   🕹️ Paso a paso   cómo se juega, numerado        (se abre y cierra)
 *   ⌨️ Controles     tabla tecla → acción, por jugador
 *   💡 Consejos      para jugar mejor               (cerrado al empezar)
 *
 * Cada parte es un <details>: se abre o se cierra con un clic. Se usa en el
 * formulario (antes de empezar) y en cada partida (durante el juego).
 * Si el juego solo trae un texto, se muestra ese texto con las teclas
 * resaltadas. Nada del manifiesto se pone como HTML: todo es texto.
 */
import type { HowToControl, HowToPlay } from "@gameconsole/sdk";
import { el } from "./dom";

const KEY_SPLIT = /(\b(?:Espacio|Enter|Esc)\b|[←→↑↓]|\b[A-Z]\b)/;
const IS_KEY = /^(Espacio|Enter|Esc|[←→↑↓]|[A-Z])$/;

/** Texto con los nombres de las teclas dibujados como teclas. */
export function howToPlayText(text: string): HTMLParagraphElement {
  const p = el("p", {});
  for (const part of text.split(KEY_SPLIT)) {
    if (!part) continue;
    p.append(IS_KEY.test(part) ? el("kbd", { text: part }) : part);
  }
  return p;
}

/** ¿Hay algo que mostrar? */
export function hasHowTo(h: string | HowToPlay | undefined): h is string | HowToPlay {
  return typeof h === "string" ? h.trim() !== "" : !!h?.goal;
}

/**
 * Las secciones del "Cómo se juega". Con `expanded` = false (el formulario)
 * solo el objetivo queda abierto, para que los nombres no queden muy abajo;
 * el resto se abre con un clic. Dentro de la partida se ve todo.
 */
export function renderHowTo(h: string | HowToPlay, expanded = true): HTMLElement {
  const box = el("div", { class: "howto-sections" });
  if (typeof h === "string") {
    box.append(section("🎯", "Cómo se juega", true, howToPlayText(h)));
    return box;
  }
  box.append(section("🎯", "Objetivo", true, el("p", { class: "howto-goal", text: h.goal })));
  if (h.steps?.length)
    box.append(section("🕹️", "Paso a paso", expanded,
      el("ol", { class: "howto-steps" }, ...h.steps.map((s) => el("li", {}, howToPlayText(s))))));
  if (h.controls?.length) box.append(section("⌨️", "Controles", expanded, controlsTable(h.controls)));
  if (h.tips?.length)
    box.append(section("💡", "Consejos", false,
      el("ul", { class: "howto-tips" }, ...h.tips.map((t) => el("li", { text: t })))));
  return box;
}

function section(icon: string, title: string, open: boolean, body: HTMLElement): HTMLElement {
  return el("details", { class: "howto-section", open },
    el("summary", {}, el("span", { class: "howto-icon", "aria-hidden": "true", text: icon }), title),
    el("div", { class: "howto-body" }, body));
}

/** Tabla tecla → acción; si los controles son por jugador, un bloque por jugador. */
function controlsTable(controls: HowToControl[]): HTMLElement {
  const groups = new Map<string, HowToControl[]>();
  for (const c of controls) {
    const g = c.player ?? "";
    groups.set(g, [...(groups.get(g) ?? []), c]);
  }
  const wrap = el("div", { class: `howto-controls ${groups.size > 1 ? "split" : ""}`.trim() });
  for (const [player, list] of groups) {
    const block = el("div", { class: "howto-player" });
    if (player) block.append(el("h5", { text: player }));
    block.append(el("dl", {}, ...list.flatMap((c) => [
      // "A" o "D" = teclas alternativas; "S+F" = combinación (se aprietan juntas).
      el("dt", {}, ...c.keys.flatMap((k, i) => [
        ...(i ? [el("span", { class: "sep", text: "o" })] : []),
        ...k.split("+").flatMap((part, j) => [
          ...(j ? [el("span", { class: "sep", text: "+" })] : []),
          el("kbd", { text: part.trim() }),
        ]),
      ])),
      el("dd", { text: c.action }),
    ])));
    wrap.append(block);
  }
  return wrap;
}
