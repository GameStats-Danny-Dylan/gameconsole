/**
 * ConsoleShell — arma la página: cabecera, menú y formulario.
 *
 * Mediator: el menú, el formulario y el catálogo no se conocen entre sí; el
 * shell recibe lo que pasa en cada uno y decide a quién avisar (elegir un
 * juego abre el formulario; si ese juego se va del registry, el formulario lo
 * marca como no disponible).
 */
import type { GameManifest, MatchContext } from "@gameconsole/sdk";
import { appHeader } from "@gameconsole/sdk/theme";
import type { CatalogSnapshot, GameCatalog } from "../catalog/GameCatalog";
import { el } from "./dom";
import { GameMenu } from "./GameMenu";
import { MatchFormView } from "./MatchFormView";

export class ConsoleShell {
  private readonly status = el("p", { class: "status", role: "status" });
  private readonly notice = el("p", { class: "notice", role: "status", hidden: true });
  private readonly menu = new GameMenu((id) => this.play(id));
  private readonly form = new MatchFormView((ctx, m) => this.matchReady(ctx, m));

  constructor(private readonly root: HTMLElement, private readonly catalog: GameCatalog) {}

  mount(): void {
    // El panel es otra app (/panel/): se abre aparte para no cerrar las partidas de la consola.
    const panel = el("a", { class: "nav-link", href: "/panel/", target: "_blank", rel: "noopener", text: "Estadísticas" });
    this.root.append(
      appHeader("Consola", "Elige un juego y arma la partida", this.status, panel),
      this.notice,
      this.menu.element,
      this.form.element,
    );
    this.catalog.subscribe((s) => this.catalogChanged(s));
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

  private play(gameId: string): void {
    const manifest = this.catalog.find(gameId);
    if (manifest) this.form.open(manifest);
  }

  /** La partida ya tiene su MatchContext. Abrirla en un iframe es el siguiente bloque. */
  private matchReady(ctx: MatchContext, manifest: GameManifest): void {
    console.info("[consola] partida lista", ctx);
    const who = ctx.players.map((p) => p.name).join(" vs ");
    this.notice.textContent = `Partida de ${manifest.name} lista (${who}). Las partidas se abren en el siguiente bloque.`;
    this.notice.hidden = false;
  }
}
