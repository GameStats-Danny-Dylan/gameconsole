/**
 * StatsDrawer — el panel de estadísticas de GameStats dentro de la consola.
 *
 * Es un panel lateral: las partidas siguen a la vista y siguen corriendo, así
 * se ve cómo las estadísticas cambian mientras se juega. Por dentro usa la app
 * del panel (/panel/) en un iframe del mismo origen, sin duplicar código: el
 * panel consulta a GameStats y no calcula nada. /panel/ también se puede
 * abrir aparte, en otra pestaña o pantalla.
 */
import { el } from "./dom";

export class StatsDrawer {
  readonly element = el("aside", { class: "drawer stats-drawer", "aria-label": "Estadísticas de GameStats", hidden: true });
  private frame: HTMLIFrameElement | null = null;
  onToggle: (open: boolean) => void = () => {};

  constructor(private readonly src = "/panel/") {
    const close = el("button", { type: "button", class: "icon-btn", "aria-label": "Cerrar estadísticas", title: "Cerrar (Esc)", text: "✕" });
    close.addEventListener("click", () => this.close());
    const external = el("a", { class: "btn small", href: src, target: "_blank", rel: "noopener", text: "Abrir aparte ↗" });
    this.element.append(
      el("header", { class: "drawer-head" },
        el("div", {},
          el("span", { class: "drawer-kicker", text: "En vivo · GameStats" }),
          el("h2", { text: "Estadísticas" }),
          el("p", { class: "muted", text: "La lista de Santa: quién va ganando, por juego y en general. Se actualiza sola mientras juegas." })),
        el("div", { class: "drawer-tools" }, external, close)),
      el("div", { class: "stats-stage" }),
    );
    this.element.addEventListener("keydown", (e) => { if (e.key === "Escape") this.close(); });
  }

  get isOpen(): boolean { return !this.element.hidden; }

  toggle(): void { if (this.isOpen) this.close(); else this.open(); }

  open(): void {
    if (this.isOpen) return;
    if (!this.frame) {   // se carga la primera vez que se abre
      this.frame = el("iframe", { class: "stats-frame", src: this.src, title: "Panel de estadísticas de GameStats" });
      this.element.querySelector(".stats-stage")!.append(this.frame);
    }
    this.element.hidden = false;
    this.onToggle(true);
  }

  close(): void {
    if (!this.isOpen) return;
    this.element.hidden = true;
    this.onToggle(false);
  }
}
