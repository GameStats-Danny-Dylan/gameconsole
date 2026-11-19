/**
 * MatchTile — una partida en la cuadrícula: título, estado, botones y el iframe.
 * Se dibuja de nuevo cada vez que su sesión cambia (Observer).
 */
import type { MatchSession } from "../match/MatchSession";
import type { SessionStatus } from "../match/sessionStates";
import { el } from "./dom";

export interface TileActions {
  restart(tile: MatchTile): void;
  newMatch(tile: MatchTile): void;
  close(tile: MatchTile): void;
}

const STATUS_TEXT: Record<SessionStatus, string> = {
  loading: "Cargando…",
  ready: "Lista",
  playing: "Jugando",
  paused: "En pausa",
  stopping: "Cerrando…",
  finished: "Terminada",
  error: "Error",
};

export class MatchTile {
  readonly element = el("article", { class: "match-tile" });
  private readonly title = el("h3", {});
  private readonly players = el("p", { class: "match-players" });
  private readonly status = el("span", { class: "match-status" });
  private readonly detail = el("p", { class: "match-detail", role: "status" });
  private readonly pauseButton = el("button", { type: "button", class: "btn small" });
  private readonly restartButton = el("button", { type: "button", class: "btn small", text: "Reiniciar" });
  private readonly newButton = el("button", { type: "button", class: "btn small", text: "Nueva partida" });
  private readonly closeButton = el("button", { type: "button", class: "btn small danger", text: "Cerrar" });
  /** Donde va el iframe. Es siempre el mismo elemento, aunque cambie la sesión. */
  readonly stage = el("div", { class: "match-stage" });
  private off: (() => void) | null = null;

  constructor(private current: MatchSession, frame: HTMLElement, private readonly actions: TileActions) {
    this.element.append(
      el("header", { class: "match-head" },
        el("div", { class: "match-names" }, this.title, this.players), this.status),
      this.stage,
      el("footer", { class: "match-bar" },
        this.detail,
        el("div", { class: "match-buttons" }, this.pauseButton, this.restartButton, this.newButton, this.closeButton)),
    );

    this.pauseButton.addEventListener("click", () => {
      if (this.current.status === "paused") this.current.resume();
      else this.current.pause("user");
    });
    this.restartButton.addEventListener("click", () => this.actions.restart(this));
    this.newButton.addEventListener("click", () => this.actions.newMatch(this));
    this.closeButton.addEventListener("click", () => this.actions.close(this));
    // Un clic en la partida le da el foco a su iframe, para que reciba las teclas.
    this.element.addEventListener("click", (e) => {
      if (!(e.target instanceof HTMLButtonElement)) this.current.focus();
    });
    this.attach(current, frame);
  }

  get session(): MatchSession { return this.current; }

  /** Pone otra sesión en este mismo lugar (Reiniciar). */
  attach(session: MatchSession, frame: HTMLElement): void {
    this.off?.();
    this.current = session;
    this.stage.replaceChildren(frame);
    this.off = session.onChange(() => this.render());
    this.render();
  }

  detach(): void { this.off?.(); this.off = null; }

  private render(): void {
    const s = this.current;
    const ctx = s.context;
    this.title.textContent = s.manifest.name;
    this.players.textContent = ctx.players.map((p) => p.name).join(" vs ");
    this.element.dataset.status = s.status;

    this.status.textContent = STATUS_TEXT[s.status];
    this.status.className = `match-status ${s.status}`;

    this.pauseButton.textContent = s.status === "paused" ? "Reanudar" : "Pausar";
    this.pauseButton.disabled = s.status !== "playing" && s.status !== "paused";
    this.pauseButton.classList.toggle("primary", s.resumeHint);
    const busy = s.status === "stopping";
    this.restartButton.disabled = busy;
    this.closeButton.disabled = busy;

    this.detail.textContent = this.detailText();
  }

  private detailText(): string {
    const s = this.current;
    if (s.status === "error") return s.error ?? "La partida falló.";
    if (s.status === "paused")
      return s.pauseReason === "hidden"
        ? (s.resumeHint ? "Se pausó mientras no estaba a la vista. Pulsa Reanudar." : "Pausada: no está a la vista.")
        : "Pausada.";
    if (s.status === "finished" && s.result) {
      if (s.result.reason === "stopped") return "Partida detenida.";
      const winner = s.context.players.find((p) => p.playerId === s.result!.winner);
      return winner ? `Ganó ${winner.name}.` : "Sin ganador.";
    }
    return "";
  }
}
