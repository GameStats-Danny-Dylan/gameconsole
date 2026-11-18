/**
 * GameMenu — el menú dinámico: una tarjeta por cada juego del catálogo.
 *
 * Observer: lo alimenta GameCatalog. Las tarjetas se reconcilian por id: si un
 * juego desaparece del registry se quita su tarjeta y nada más (las partidas
 * abiertas no dependen del menú).
 */
import type { GameManifest } from "@gameconsole/sdk";
import type { CatalogSnapshot } from "../catalog/GameCatalog";
import { MODE_LABELS } from "../domain/MatchSetup";
import { el } from "./dom";

function playersText(p: GameManifest["players"]): string {
  if (p.min === p.max) return p.min === 1 ? "1 jugador" : `${p.min} jugadores`;
  return `${p.min}–${p.max} jugadores`;
}

export class GameMenu {
  readonly element = el("section", { class: "menu", "aria-label": "Juegos" });
  private readonly grid = el("div", { class: "game-grid" });
  private readonly empty = el("p", { class: "empty-state" });
  private readonly cards = new Map<string, { key: string; card: HTMLElement }>();

  constructor(private readonly onPlay: (gameId: string) => void) {
    this.element.append(
      el("div", { class: "section-head" },
        el("h2", { text: "Juegos" }),
        el("p", { text: "Los juegos aparecen solos cuando arranca su contenedor." })),
      this.empty,
      this.grid,
    );
  }

  render(s: CatalogSnapshot): void {
    const seen = new Set<string>();
    for (const game of s.games) {
      seen.add(game.id);
      const key = JSON.stringify(game);
      let entry = this.cards.get(game.id);
      if (!entry || entry.key !== key) {
        const card = this.card(game);
        entry?.card.replaceWith(card);
        entry = { key, card };
        this.cards.set(game.id, entry);
      }
      this.grid.append(entry.card);   // append mueve la tarjeta: queda en el orden del catálogo
    }
    for (const [id, { card }] of this.cards)
      if (!seen.has(id)) { card.remove(); this.cards.delete(id); }

    this.empty.hidden = s.games.length > 0;
    this.empty.textContent =
      s.status === "loading" ? "Buscando juegos…" :
      s.status === "offline" ? "No se pudo conectar con el registry. Se vuelve a intentar cada 10 s." :
      "Todavía no hay juegos registrados.";
  }

  private card(g: GameManifest): HTMLElement {
    const icon = g.icon
      ? el("img", { class: "game-icon", src: g.icon, alt: "", width: 56, height: 56, loading: "lazy" })
      : el("span", { class: "game-icon placeholder", "aria-hidden": "true", text: g.name.slice(0, 1).toUpperCase() });
    if (icon instanceof HTMLImageElement)
      icon.addEventListener("error", () => icon.replaceWith(
        el("span", { class: "game-icon placeholder", "aria-hidden": "true", text: g.name.slice(0, 1).toUpperCase() })), { once: true });

    const play = el("button", { type: "button", class: "btn primary", text: "Jugar" });
    play.addEventListener("click", () => this.onPlay(g.id));

    return el("article", { class: "game-card", "data-game": g.id },
      el("header", {}, icon,
        el("div", { class: "game-title" },
          el("h3", { text: g.name }),
          el("span", { class: "chip", text: playersText(g.players) }))),
      g.description ? el("p", { class: "game-desc", text: g.description }) : null,
      el("ul", { class: "chips", "aria-label": "Modos" },
        ...g.modes.map((m) => el("li", { class: "chip mode", text: MODE_LABELS[m] ?? m }))),
      el("footer", {}, play),
    );
  }
}
