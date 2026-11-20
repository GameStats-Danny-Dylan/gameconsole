/**
 * Toasts — avisos breves de lo que acaba de pasar ("Se abrió la partida",
 * "Ganó Ana", "GameStats no responde"). Heurística de Nielsen 1: el sistema
 * informa su estado sin que haya que buscarlo. No piden nada ni bloquean: se
 * van solos y también se leen con lector de pantalla (aria-live).
 */
import { el } from "./dom";

export type ToastKind = "info" | "good" | "warn";

export class Toasts {
  readonly element = el("div", { class: "toasts", role: "status", "aria-live": "polite" });

  constructor(private readonly ms = 4000) {}

  show(text: string, kind: ToastKind = "info"): void {
    const icon = kind === "good" ? "✓" : kind === "warn" ? "!" : "●";
    const toast = el("div", { class: `toast ${kind}` }, el("span", { class: "toast-icon", "aria-hidden": "true", text: icon }), text);
    this.element.append(toast);
    while (this.element.childElementCount > 3) this.element.firstElementChild?.remove();
    setTimeout(() => {
      toast.classList.add("leaving");
      setTimeout(() => toast.remove(), 300);
    }, this.ms);
  }
}
