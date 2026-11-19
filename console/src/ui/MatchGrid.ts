/**
 * MatchGrid — las partidas abiertas, en una cuadrícula. Varias a la vez: las
 * que están a la vista siguen corriendo en paralelo.
 *
 * - Reiniciar: STOP a la sesión actual y, cuando cierra, una nueva en el mismo
 *   lugar con los mismos jugadores y opciones (otro matchId).
 * - Nueva partida: vuelve al formulario de ese juego sin cerrar las demás.
 * - Cerrar: STOP y quita la tarjeta cuando la sesión cerró.
 */
import type { GameManifest, MatchContext } from "@gameconsole/sdk";
import { IframeFrame } from "../match/MatchFrame";
import type { MatchSession } from "../match/MatchSession";
import type { MatchSessionFactory } from "../match/MatchSessionFactory";
import { el } from "./dom";
import { MatchTile, type TileActions } from "./MatchTile";
import type { VisibilityWatcher } from "./VisibilityWatcher";

export class MatchGrid {
  readonly element = el("section", { class: "matches", "aria-label": "Partidas" });
  private readonly grid = el("div", { class: "match-grid" });
  private readonly count = el("span", { class: "chip" });
  private readonly tiles = new Set<MatchTile>();
  private readonly actions: TileActions = {
    restart: (t) => void this.restart(t),
    newMatch: (t) => this.onNewMatch(t.session.manifest),
    close: (t) => void this.close(t),
  };

  constructor(
    private readonly factory: MatchSessionFactory,
    private readonly watcher: VisibilityWatcher,
    private readonly onNewMatch: (manifest: GameManifest) => void,
  ) {
    this.element.append(
      el("div", { class: "section-head row" }, el("h2", { text: "Partidas" }), this.count),
      this.grid,
    );
    this.update();
  }

  open(manifest: GameManifest, context: MatchContext): void {
    const session = this.factory.create(manifest, context);
    const tile = new MatchTile(session, frameElement(session), this.actions);
    this.tiles.add(tile);
    this.grid.append(tile.element);
    this.watcher.watch(tile.stage, session);
    this.update();
    tile.element.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  private async restart(tile: MatchTile): Promise<void> {
    const old = tile.session;
    await old.stop("user");
    if (!this.tiles.has(tile)) return;   // la cerraron mientras tanto
    const session = this.factory.restart(old);
    tile.attach(session, frameElement(session));
    this.watcher.watch(tile.stage, session);
  }

  private async close(tile: MatchTile): Promise<void> {
    await tile.session.stop("user");
    this.watcher.unwatch(tile.stage);
    tile.detach();
    tile.element.remove();
    this.tiles.delete(tile);
    this.update();
  }

  private update(): void {
    const n = this.tiles.size;
    this.element.hidden = n === 0;
    this.count.textContent = `${n} ${n === 1 ? "abierta" : "abiertas"}`;
    this.grid.dataset.count = String(Math.min(n, 3));
  }
}

function frameElement(session: MatchSession): HTMLElement {
  if (!(session.frame instanceof IframeFrame)) throw new Error("la cuadrícula necesita un iframe real");
  return session.frame.element;
}
