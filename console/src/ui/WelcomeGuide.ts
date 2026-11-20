/**
 * WelcomeGuide — la guía de primera vez: qué es GameConsole y cómo usarla en
 * 3 pasos. Se muestra sola la primera vez; después se abre con el botón "?"
 * de la cabecera. Recordar que ya se vio es solo una comodidad de este
 * navegador (localStorage); si no se puede guardar, simplemente vuelve a salir.
 */
import { el } from "./dom";

export const GUIDE_KEY = "gameconsole-guide-seen";

const STEPS: [string, string, string][] = [
  ["🎮", "Elige un juego", "Lee cómo se juega, escribe los nombres y elige las opciones. Cada juego es una app aparte que la consola encontró sola."],
  ["🪟", "Juega varias partidas a la vez", "Cada partida va en su propio cuadro, con sus botones. También puedes abrir la consola en otra pestaña. Si una partida deja de verse, se pausa."],
  ["📊", "Mira las estadísticas en vivo", "Todo lo que pasa en cada partida se manda a GameStats. En «Estadísticas» ves los resultados, la clasificación y las partidas en curso mientras juegas."],
];

export class WelcomeGuide {
  readonly element = el("section", { class: "welcome", "aria-labelledby": "welcome-title" });
  /** El botón "?" de la cabecera. */
  readonly button = el("button", { type: "button", class: "btn", title: "Cómo funciona DnD Games" },
    el("span", { class: "btn-icon", "aria-hidden": "true", text: "?" }), "Guía");

  constructor() {
    const ok = el("button", { type: "button", class: "btn primary", text: "🎄 ¡Entendido, a jugar!" });
    ok.addEventListener("click", () => this.hide(true));
    this.element.append(
      el("div", { class: "welcome-text" },
        el("span", { class: "drawer-kicker", text: "❄ Primera vez aquí" }),
        el("h2", { id: "welcome-title", text: "¡Bienvenido a DnD Games!" }),
        el("p", { text: "Una consola navideña con juegos independientes: abre varias partidas al mismo tiempo y mira en vivo lo que calcula GameStats con cada jugada." })),
      el("ol", { class: "welcome-steps" },
        ...STEPS.map(([icon, title, text], i) => el("li", {},
          el("span", { class: "step-icon", "aria-hidden": "true", text: icon }),
          el("div", {}, el("strong", { text: `${i + 1}. ${title}` }), el("p", { text }))))),
      el("footer", {}, ok),
    );
    this.button.addEventListener("click", () => {
      if (this.element.hidden) this.show(); else this.hide(false);
    });
    if (seen()) this.element.hidden = true;
  }

  show(): void {
    this.element.hidden = false;
    this.element.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  hide(remember: boolean): void {
    this.element.hidden = true;
    if (remember) try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* solo no se recuerda */ }
  }
}

function seen(): boolean {
  try { return localStorage.getItem(GUIDE_KEY) === "1"; } catch { return false; }
}
