/**
 * Hero — la portada de DnD Games: lo primero que ve quien entra.
 *
 * Izquierda: el saludo, qué es esto en una frase, el estado del sistema (como
 * información, no botones), el botón para ir a los juegos y "cómo funciona"
 * en 3 pasos (la guía de primera vez, siempre a mano). Derecha: un paisaje
 * nevado de noche dibujado en SVG (pinos con luces, estrella, regalos).
 *
 * El botón "? Guía" de la cabecera trae la portada a la vista y resalta los
 * pasos (heurística 10 de Nielsen: ayuda siempre disponible).
 */
import { el } from "./dom";
import { icon, type IconName } from "./icons";

const STEPS: [IconName, string, string][] = [
  ["gift", "Elige un juego", "Abre su regalo, lee cómo se juega, escribe los nombres y elige las opciones antes de empezar."],
  ["windows", "Juega varias a la vez", "Cada partida va en su propio cuadro, con sus botones. Si una deja de verse, se pausa sola."],
  ["trophy", "Mira quién va ganando", "Cada jugada llega a GameStats, que arma los resultados y la clasificación en vivo."],
];

/** Paisaje nevado de noche (decorativo). Todo es fijo: no lleva datos de nadie. */
const SCENE = `<svg viewBox="0 0 420 300" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="hs-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1838"/><stop offset="1" stop-color="#25407a"/></linearGradient>
    <linearGradient id="hs-tree" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2fae67"/><stop offset="1" stop-color="#14663a"/></linearGradient>
    <radialGradient id="hs-moon" cx=".4" cy=".4" r=".6"><stop offset="0" stop-color="#fffbe8"/><stop offset="1" stop-color="#f3dc9a"/></radialGradient>
  </defs>
  <rect width="420" height="300" rx="26" fill="url(#hs-sky)"/>
  <circle cx="335" cy="62" r="26" fill="url(#hs-moon)"/>
  <g fill="#fff"><circle cx="60" cy="40" r="1.6"/><circle cx="120" cy="22" r="1.2"/><circle cx="180" cy="55" r="1.5"/><circle cx="250" cy="30" r="1.2"/><circle cx="290" cy="95" r="1.3"/><circle cx="390" cy="120" r="1.4"/><circle cx="30" cy="110" r="1.1"/><circle cx="215" cy="100" r="1"/></g>
  <path d="M0 215 C70 185 140 200 210 210 C290 222 350 190 420 200 L420 300 L0 300Z" fill="#dfe9f6"/>
  <path d="M0 245 C90 225 170 240 250 238 C320 236 370 226 420 232 L420 300 L0 300Z" fill="#f4f8fd"/>
  <g>
    <polygon points="95,120 60,180 130,180" fill="url(#hs-tree)"/><polygon points="95,145 52,212 138,212" fill="url(#hs-tree)"/><rect x="88" y="212" width="14" height="16" fill="#7a4a2a"/>
    <polygon points="340,140 312,192 368,192" fill="url(#hs-tree)"/><polygon points="340,162 305,220 375,220" fill="url(#hs-tree)"/><rect x="334" y="220" width="12" height="14" fill="#7a4a2a"/>
  </g>
  <g>
    <polygon points="215,58 168,140 262,140" fill="url(#hs-tree)"/>
    <polygon points="215,95 156,185 274,185" fill="url(#hs-tree)"/>
    <polygon points="215,135 142,232 288,232" fill="url(#hs-tree)"/>
    <rect x="205" y="232" width="20" height="20" fill="#7a4a2a"/>
    <path d="M182 128 Q215 142 248 126 M170 172 Q215 192 262 170 M158 218 Q215 240 274 216" fill="none" stroke="#f6d36b" stroke-width="2"/>
    <g class="hs-lights"><circle cx="190" cy="132" r="4" fill="#ff4d5e"/><circle cx="215" cy="137" r="4" fill="#4db8ff"/><circle cx="240" cy="130" r="4" fill="#ffd24d"/><circle cx="180" cy="178" r="4" fill="#ffd24d"/><circle cx="205" cy="185" r="4" fill="#ff4d5e"/><circle cx="230" cy="184" r="4" fill="#3fd17f"/><circle cx="252" cy="175" r="4" fill="#4db8ff"/><circle cx="170" cy="224" r="4" fill="#3fd17f"/><circle cx="198" cy="231" r="4" fill="#4db8ff"/><circle cx="228" cy="232" r="4" fill="#ff4d5e"/><circle cx="258" cy="224" r="4" fill="#ffd24d"/></g>
    <polygon class="hs-star" points="215,34 221,50 238,50 224,60 229,76 215,66 201,76 206,60 192,50 209,50" fill="#ffd24d" stroke="#e0a91d" stroke-width="1.5"/>
  </g>
  <g>
    <rect x="236" y="236" width="38" height="30" rx="4" fill="#d6283a"/><rect x="252" y="236" width="6" height="30" fill="#f6d36b"/><rect x="236" y="248" width="38" height="6" fill="#f6d36b"/>
    <rect x="150" y="242" width="32" height="24" rx="4" fill="#2f8fe0"/><rect x="163" y="242" width="6" height="24" fill="#f6d36b"/><rect x="150" y="251" width="32" height="5" fill="#f6d36b"/>
    <rect x="280" y="246" width="26" height="20" rx="3" fill="#2fae67"/><rect x="290" y="246" width="5" height="20" fill="#fff"/>
  </g>
</svg>`;

export class Hero {
  readonly element = el("section", { class: "hero", "aria-labelledby": "hero-title" });
  /** El botón "? Guía" de la cabecera. */
  readonly button = el("button", { type: "button", class: "btn", title: "Cómo funciona DnD Games" },
    el("span", { class: "btn-icon", "aria-hidden": "true", text: "?" }), "Guía");
  private readonly steps: HTMLElement;

  constructor(status: HTMLElement, onSeeGames: () => void) {
    const cta = el("button", { type: "button", class: "btn primary big" }, icon("gift", "btn-svg"), "Ver los juegos");
    cta.addEventListener("click", onSeeGames);

    // Cada paso es una tarjeta: número y dibujo arriba, título y explicación debajo.
    this.steps = el("ol", { class: "hero-steps", "aria-label": "Cómo funciona" },
      ...STEPS.map(([name, title, text], i) => el("li", { class: "step-card" },
        el("div", { class: "step-top" },
          el("span", { class: "step-icon" }, icon(name)),
          el("span", { class: "step-num", text: `Paso ${i + 1}` })),
        el("h4", { text: title }),
        el("p", { text }))));

    this.element.append(
      el("div", { class: "hero-text" },
        el("span", { class: "eyebrow" }, icon("snow", "eyebrow-svg"), "Bienvenido a DnD Games"),
        el("h2", { id: "hero-title", text: "¿Qué jugamos hoy?" }),
        el("p", { class: "lead", text: "Elige un juego, abre varias partidas al mismo tiempo y mira en vivo quién va ganando." }),
        status,
        el("div", { class: "hero-actions" }, cta)),
      el("div", { class: "hero-art" }),
      el("div", { class: "hero-how" },
        el("header", { class: "hero-how-head" },
          el("span", { class: "kicker", text: "Primera vez" }),
          el("h3", { text: "Cómo funciona" })),
        this.steps),
    );
    (this.element.querySelector(".hero-art") as HTMLElement).innerHTML = SCENE;   // SVG fijo, sin datos externos

    this.button.addEventListener("click", () => {
      this.element.scrollIntoView({ behavior: "smooth", block: "start" });
      this.steps.classList.remove("flash");
      void this.steps.offsetWidth;            // reinicia la animación
      this.steps.classList.add("flash");
    });
  }
}
