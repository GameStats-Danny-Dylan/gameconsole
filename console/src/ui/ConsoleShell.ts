/**
 * ConsoleShell — arma la página: cabecera, guía, partidas abiertas, menú y los
 * dos paneles laterales (nueva partida y estadísticas).
 *
 * Facade: main.ts solo llama a mount(); por dentro el shell conecta el
 * catálogo, el menú, el formulario, la cuadrícula de partidas y las
 * estadísticas, que no se conocen entre sí (elegir un juego abre el
 * formulario; el formulario abre una partida en la cuadrícula; si un juego se
 * va del registry, el formulario lo marca como no disponible, pero sus
 * partidas abiertas siguen).
 *
 * Estadísticas es un panel lateral: mientras está abierto, las partidas se
 * corren a un lado y siguen jugándose. Nueva partida ocupa toda la pantalla.
 */
import type { GameManifest, MatchContext } from "@gameconsole/sdk";
import { appHeader } from "@gameconsole/sdk/theme";
import type { CatalogSnapshot, GameCatalog } from "../catalog/GameCatalog";
import type { LiveStats } from "../catalog/LiveStats";
import type { MatchSessionFactory } from "../match/MatchSessionFactory";
import type { EventSender } from "../sending/EventSender";
import { el } from "./dom";
import { GameMenu } from "./GameMenu";
import { MatchFormView } from "./MatchFormView";
import { MatchGrid } from "./MatchGrid";
import { sendIndicator } from "./SendIndicator";
import { StatsDrawer } from "./StatsDrawer";
import { Toasts } from "./Toasts";
import { VisibilityWatcher } from "./VisibilityWatcher";
import { Hero } from "./Hero";

export interface ShellDeps {
  catalog: GameCatalog;
  sessions: MatchSessionFactory;
  /** Para mostrar en la cabecera cómo va el envío a GameStats. */
  sender?: EventSender;
  /** Lo que dice GameStats de cada juego, para las tarjetas del menú. */
  live?: LiveStats;
}

export class ConsoleShell {
  private readonly status = el("p", { class: "signal", role: "status" });
  private readonly menu = new GameMenu((id) => this.openForm(id));
  private readonly form = new MatchFormView((ctx, m) => this.startMatch(ctx, m));
  private readonly stats = new StatsDrawer("/panel/");
  private readonly watcher = new VisibilityWatcher();
  private readonly toasts = new Toasts();
  private readonly grid: MatchGrid;

  constructor(private readonly root: HTMLElement, private readonly deps: ShellDeps) {
    this.grid = new MatchGrid(deps.sessions, this.watcher, (m) => this.openForm(m.id, m), this.toasts);
  }

  mount(): void {
    // En la cabecera, solo botones. Los estados van aparte, en la barra de estado:
    // así la información nunca parece algo que se pueda pulsar.
    const statsButton = el("button", { type: "button", class: "btn stats-link", "aria-controls": "stats" },
      el("span", { class: "btn-icon", "aria-hidden": "true", text: "📊" }), "Estadísticas");
    statsButton.addEventListener("click", () => { this.form.close(); this.stats.toggle(); });
    this.stats.element.id = "stats";

    // Estado del sistema: información (texto con punto de color), dentro de la portada.
    const statusbar = el("div", { class: "statusbar", "aria-label": "Estado del sistema" },
      this.status,
      ...(this.deps.sender ? [sendIndicator(this.deps.sender)] : []));

    const hero = new Hero(statusbar, () => this.menu.element.scrollIntoView({ behavior: "smooth", block: "start" }));

    // Cabecera: la marca "DnD Games" (DnD en rojo) y solo botones a la derecha.
    const header = appHeader("DnD Games", "", hero.button, statsButton);
    header.querySelector("h1")!.replaceChildren(el("span", { class: "brand-dnd", text: "DnD" }), " Games");
    this.root.append(
      header,
      hero.element,
      this.grid.element,
      this.menu.element,
    );
    document.body.append(this.form.element, this.stats.element, this.toasts.element);

    // Si GameStats deja de responder (o vuelve), se avisa una vez: los eventos no se pierden.
    let failing = false;
    this.deps.sender?.onChange((s) => {
      if (s.failing === failing) return;
      failing = s.failing;
      this.toasts.show(failing
        ? "GameStats no responde. Las jugadas se guardan y se mandan solas cuando vuelva."
        : "GameStats volvió: se mandó todo lo pendiente.", failing ? "warn" : "good");
    });

    // Estadísticas: panel lateral (la página le deja lugar). Nueva partida:
    // pantalla completa (la página de atrás no se desplaza mientras está abierta).
    const sync = () => {
      document.body.classList.toggle("drawer-open", this.stats.isOpen);
      document.body.classList.toggle("modal-open", this.form.element.open);
      statsButton.classList.toggle("active", this.stats.isOpen);
      statsButton.setAttribute("aria-expanded", String(this.stats.isOpen));
    };
    this.form.onToggle = (open) => { if (open) this.stats.close(); sync(); };
    this.stats.onToggle = sync;
    sync();

    this.deps.catalog.subscribe((s) => this.catalogChanged(s));
    this.deps.live?.subscribe((snap) => this.menu.setLive(snap));
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
      s.status === "online" ? ["ok", `${n} ${n === 1 ? "juego disponible" : "juegos disponibles"}`] :
      ["bad", "Sin conexión con los juegos"];
    this.status.className = `signal ${cls}`.trim();
    this.status.replaceChildren(el("span", { class: "icon", "aria-hidden": "true", text: "●" }), text);
    this.status.title = s.status === "offline"
      ? "El servicio que lista los juegos no responde: se muestra la última lista conocida y se reintenta solo."
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
    this.form.open(manifest);
    this.form.setAvailable(this.deps.catalog.find(gameId) !== undefined);
  }

  private startMatch(ctx: MatchContext, manifest: GameManifest): void {
    this.grid.open(manifest, ctx);
  }
}
