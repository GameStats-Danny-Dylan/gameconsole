/**
 * ConsoleShell — arma la página: cabecera, partidas abiertas, menú y formulario.
 *
 * Facade: main.ts solo llama a mount(); por dentro el shell conecta el
 * catálogo, el menú, el formulario y la cuadrícula de partidas, que no se
 * conocen entre sí (elegir un juego abre el formulario; el formulario abre una
 * partida en la cuadrícula; si un juego se va del registry, el formulario lo
 * marca como no disponible, pero sus partidas abiertas siguen).
 */
import type { GameManifest, MatchContext } from "@gameconsole/sdk";
import { appHeader } from "@gameconsole/sdk/theme";
import type { CatalogSnapshot, GameCatalog } from "../catalog/GameCatalog";
import type { MatchSessionFactory } from "../match/MatchSessionFactory";
import type { EventSender } from "../sending/EventSender";
import { el } from "./dom";
import { sendIndicator } from "./SendIndicator";
import { GameMenu } from "./GameMenu";
import { MatchFormView } from "./MatchFormView";
import { MatchGrid } from "./MatchGrid";
import { VisibilityWatcher } from "./VisibilityWatcher";

export interface ShellDeps {
  catalog: GameCatalog;
  sessions: MatchSessionFactory;
  /** Para mostrar en la cabecera cómo va el envío a GameStats. */
  sender?: EventSender;
}

export class ConsoleShell {
  private readonly status = el("p", { class: "status", role: "status" });
  private readonly menu = new GameMenu((id) => this.openForm(id));
  private readonly form = new MatchFormView((ctx, m) => this.startMatch(ctx, m));
  private readonly watcher = new VisibilityWatcher();
  private readonly grid: MatchGrid;

  constructor(private readonly root: HTMLElement, private readonly deps: ShellDeps) {
    this.grid = new MatchGrid(deps.sessions, this.watcher, (m) => this.openForm(m.id, m));
  }

  mount(): void {
    // El panel es otra app (/panel/): se abre aparte para no cerrar las partidas de la consola.
    const panel = el("a", { class: "nav-link", href: "/panel/", target: "_blank", rel: "noopener", text: "Estadísticas" });
    this.root.append(
      appHeader("Consola", "Elige un juego y arma la partida",
        this.status, ...(this.deps.sender ? [sendIndicator(this.deps.sender)] : []), panel),
      this.grid.element,
      this.menu.element,
      this.form.element,
    );
    // El formulario es modal y tapa las partidas: mientras está abierto cuentan como ocultas.
    this.form.element.addEventListener("close", () => this.watcher.setCovered(false));
    this.deps.catalog.subscribe((s) => this.catalogChanged(s));
  }

  private catalogChanged(s: CatalogSnapshot): void {
    this.menu.render(s);
    this.renderStatus(s);
    const open = this.form.openGameId;
    if (open) this.form.setAvailable(s.games.some((g) => g.id === open));
  }

  private renderStatus(s: CatalogSnapshot): void {
    const n = s.games.length;
    const [cls, text] =
      s.status === "loading" ? ["", "Conectando…"] :
      s.status === "online" ? ["ok", `En línea · ${n} ${n === 1 ? "juego" : "juegos"}`] :
      ["bad", "Sin conexión"];
    this.status.className = `status ${cls}`.trim();
    this.status.replaceChildren(el("span", { class: "icon", "aria-hidden": "true", text: "●" }), text);
    this.status.title = s.status === "offline"
      ? "El registry no responde: se muestra la última lista conocida."
      : s.updatedAt ? `Actualizado a las ${s.updatedAt.toLocaleTimeString("es")}` : "";
  }

  /**
   * Abre el formulario de un juego. Desde "Nueva partida" llega el manifiesto
   * de la partida, por si el juego ya no está en el registry (se muestra como
   * no disponible).
   */
  private openForm(gameId: string, fallback?: GameManifest): void {
    const manifest = this.deps.catalog.find(gameId) ?? fallback;
    if (!manifest) return;
    this.watcher.setCovered(true);
    this.form.open(manifest);
    this.form.setAvailable(this.deps.catalog.find(gameId) !== undefined);
  }

  private startMatch(ctx: MatchContext, manifest: GameManifest): void {
    this.grid.open(manifest, ctx);
  }
}
