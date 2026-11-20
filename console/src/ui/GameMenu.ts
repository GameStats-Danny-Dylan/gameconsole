/**
 * GameMenu — el menú dinámico: una tarjeta por cada juego del catálogo.
 *
 * Observer: lo alimentan GameCatalog (qué juegos hay) y LiveStats (qué dice
 * GameStats de cada uno). Las tarjetas se reconcilian por id: si un juego
 * desaparece del registry se quita su tarjeta y nada más (las partidas
 * abiertas no dependen del menú).
 */
import type { GameManifest } from "@gameconsole/sdk";
import type { CatalogSnapshot } from "../catalog/GameCatalog";
import { playerLabel, type LiveSnapshot } from "../catalog/LiveStats";
import { MODE_LABELS } from "../domain/MatchSetup";
import { el } from "./dom";
import { icon as svgIcon, type IconName } from "./icons";


/** Colores de papel de regalo: rojo, verde, azul, dorado y violeta. */
const GIFT_HUES = [140, 352, 212, 42, 280];

interface CardEntry { key: string; card: HTMLElement; live: HTMLElement; statsId: string }

export class GameMenu {
  readonly element = el("section", { class: "menu", "aria-label": "Juegos" });
  private readonly grid = el("div", { class: "game-grid" });
  private readonly empty = el("p", { class: "empty-state" });
  private readonly cards = new Map<string, CardEntry>();
  private live: LiveSnapshot = new Map();

  constructor(private readonly onPlay: (gameId: string) => void) {
    this.element.append(
      el("header", { class: "section-head" },
        el("span", { class: "kicker", text: "El taller de juegos" }),
        el("h2", { text: "Elige un juego" }),
        el("p", { text: "Cada juego es una aplicación aparte que la consola encontró sola. Elige uno, ábrelo como un regalo y juega todas las partidas que quieras, incluso varias a la vez." })),
      this.empty,
      this.grid,
    );
  }

  render(s: CatalogSnapshot): void {
    const seen = new Set<string>();
    for (const [i, game] of s.games.entries()) {
      seen.add(game.id);
      const key = JSON.stringify(game);
      let entry = this.cards.get(game.id);
      if (!entry || entry.key !== key) {
        const next = this.card(game, key);
        entry?.card.replaceWith(next.card);
        entry = next;
        this.cards.set(game.id, entry);
        this.paintLive(entry);
      }
      this.grid.append(entry.card);   // append mueve la tarjeta: queda en el orden del catálogo
      // Cada regalo con un color navideño distinto, en el orden del menú.
      entry.card.style.setProperty("--game-hue", String(GIFT_HUES[i % GIFT_HUES.length]));
    }
    for (const [id, { card }] of this.cards)
      if (!seen.has(id)) { card.remove(); this.cards.delete(id); }

    this.empty.hidden = s.games.length > 0;
    this.empty.textContent =
      s.status === "loading" ? "Buscando juegos…" :
      s.status === "offline" ? "No se pudo cargar la lista de juegos. Se vuelve a intentar sola cada 10 s." :
      "Todavía no hay juegos disponibles. Aparecen solos cuando se enciende su servidor.";
  }

  /** Lo que dice GameStats de cada juego (LiveStats). */
  setLive(snap: LiveSnapshot): void {
    this.live = snap;
    for (const entry of this.cards.values()) this.paintLive(entry);
  }

  private paintLive(entry: CardEntry): void {
    const g = this.live.get(entry.statsId);
    const playing = g?.inProgress ?? 0;
    const played = g?.played ?? 0;
    // Datos de GameStats: números con su etiqueta debajo, como un marcador (no parecen botones).
    const stat = (value: string, label: string, cls = "", title = "") =>
      el("div", { class: `stat ${cls}`.trim(), title }, el("strong", { text: value }), el("span", { text: label }));
    entry.live.replaceChildren(
      stat(String(playing), "en curso", playing > 0 ? "on" : "", "Partidas abiertas ahora (GameStats)"),
      stat(String(played), played === 1 ? "jugada" : "jugadas", "", "Partidas terminadas que analizó GameStats"),
      stat(g?.leader ? (g.leader === "cpu" ? "La IA" : playerLabel(g.leader)) : "—", "líder", "leader",
        g?.leader ? `Quien más ha ganado: ${playerLabel(g.leader)} (GameStats)` : "Todavía nadie ganó una partida"),
    );
  }

  private card(g: GameManifest, key: string): CardEntry {
    const initial = g.name.slice(0, 1).toUpperCase();
    const icon = g.icon
      ? el("img", { class: "game-icon", src: g.icon, alt: "", width: 64, height: 64, loading: "lazy" })
      : el("span", { class: "game-icon placeholder", "aria-hidden": "true", text: initial });
    if (icon instanceof HTMLImageElement)
      icon.addEventListener("error", () => icon.replaceWith(
        el("span", { class: "game-icon placeholder", "aria-hidden": "true", text: initial })), { once: true });

    const play = el("button", { type: "button", class: "btn primary play", "aria-label": `Jugar ${g.name}` },
      svgIcon("play", "btn-svg"), "¡A jugar!");
    play.addEventListener("click", () => this.onPlay(g.id));
    const live = el("div", { class: "game-live", "aria-label": "En GameStats" });
    // Los modos ya dicen cuántos juegan: no se repite la cantidad de jugadores.
    const MODES: Record<string, [IconName, string]> = {
      "vs-cpu": ["cpu", "Contra la computadora"], "local-2p": ["users", "2 personas, misma pantalla"], solo: ["user", "Un jugador"],
    };

    const card = el("article", { class: "game-card", "data-game": g.id },
      el("div", { class: "game-banner", "aria-hidden": "true" }, icon),
      el("div", { class: "game-body" },
        el("h3", { class: "game-name", text: g.name }),
        g.description ? el("p", { class: "game-desc", text: g.description }) : null,
        el("ul", { class: "game-meta", "aria-label": "Modos de juego" },
          ...g.modes.map((m) => el("li", {},
            svgIcon(MODES[m]?.[0] ?? "gamepad", "meta-svg"), MODES[m]?.[1] ?? MODE_LABELS[m] ?? m))),
        live,
        play),
    );
    return { key, card, live, statsId: g.gameStatsId };
  }
}
