/**
 * MatchTile — una partida en la cuadrícula: título, estado, botones y el iframe.
 * Se dibuja de nuevo cada vez que su sesión cambia (Observer).
 *
 * Usabilidad (heurísticas de Nielsen):
 * - "Cómo se juega" siempre a mano durante la partida (reconocer en vez de recordar).
 * - Cerrar o reiniciar una partida en curso pide confirmar en el mismo botón,
 *   sin ventanas emergentes (prevención de errores, control del usuario).
 * - Si la partida no tiene el teclado, se avisa cómo dárselo.
 * - Con error, el mensaje dice qué hacer y "Reiniciar" pasa a "Reintentar".
 */
import type { MatchSession } from "../match/MatchSession";
import type { SessionStatus } from "../match/sessionStates";
import { el } from "./dom";
import { howToPlayText } from "./howTo";

export interface TileActions {
  restart(tile: MatchTile): void;
  newMatch(tile: MatchTile): void;
  close(tile: MatchTile): void;
  /** Algo que vale la pena avisar (ganó alguien, falló la partida). */
  notify?(text: string, kind: "good" | "warn" | "info"): void;
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

/** Cuánto espera la confirmación ("¿Seguro?") antes de volver al botón normal. */
export const CONFIRM_MS = 3500;

export class MatchTile {
  readonly element = el("article", { class: "match-tile" });
  private readonly title = el("h3", {});
  private readonly players = el("p", { class: "match-players" });
  private readonly status = el("span", { class: "match-status" });
  private readonly detail = el("p", { class: "match-detail", role: "status" });
  private readonly howButton = el("button", { type: "button", class: "btn small ghost", "aria-expanded": "false", text: "? Cómo se juega" });
  private readonly pauseButton = el("button", { type: "button", class: "btn small" });
  private readonly restartButton = el("button", { type: "button", class: "btn small", text: "Reiniciar" });
  private readonly newButton = el("button", { type: "button", class: "btn small", text: "Nueva partida" });
  private readonly closeButton = el("button", { type: "button", class: "btn small danger", text: "Cerrar" });
  private readonly howTo = el("section", { class: "tile-howto", hidden: true, "aria-label": "Cómo se juega" });
  /** Donde va el iframe. Es siempre el mismo elemento, aunque cambie la sesión. */
  readonly stage = el("div", { class: "match-stage" });
  private off: (() => void) | null = null;
  private hasFocus = false;
  private lastStatus: SessionStatus | null = null;
  private armed: { button: HTMLButtonElement; timer: ReturnType<typeof setTimeout> } | null = null;

  constructor(private current: MatchSession, frame: HTMLElement, private readonly actions: TileActions) {
    this.element.append(
      el("header", { class: "match-head" },
        el("div", { class: "match-names" }, this.title, this.players), this.status),
      el("div", { class: "match-body" }, this.stage, this.howTo),
      el("footer", { class: "match-bar" },
        this.detail,
        el("div", { class: "match-buttons" },
          this.howButton, this.pauseButton, this.restartButton, this.newButton, this.closeButton)),
    );

    this.pauseButton.addEventListener("click", () => {
      if (this.current.status === "paused") this.current.resume();
      else this.current.pause("user");
    });
    this.restartButton.addEventListener("click", () =>
      this.confirmIfPlaying(this.restartButton, "¿Reiniciar? Sí", () => this.actions.restart(this)));
    this.newButton.addEventListener("click", () => this.actions.newMatch(this));
    this.closeButton.addEventListener("click", () =>
      this.confirmIfPlaying(this.closeButton, "¿Cerrar? Sí", () => this.actions.close(this)));
    this.howButton.addEventListener("click", () => this.toggleHowTo());

    // Un clic en la partida le da el foco a su iframe, para que reciba las teclas.
    this.element.addEventListener("click", (e) => {
      if (!(e.target instanceof HTMLButtonElement)) this.focusGame();
    });
    // ¿Tiene el teclado? Al entrar a un iframe no siempre llega focusin a la
    // página, pero la ventana sí pierde el foco (blur): se revisa en cada caso.
    this.element.addEventListener("focusin", this.checkFocus);
    this.element.addEventListener("focusout", () => setTimeout(this.checkFocus, 0));
    window.addEventListener("blur", this.onWindowFocus);
    window.addEventListener("focus", this.onWindowFocus);
    this.attach(current, frame);
  }

  private readonly checkFocus = () => this.setFocus(this.element.contains(document.activeElement));
  private readonly onWindowFocus = () => setTimeout(this.checkFocus, 0);

  get session(): MatchSession { return this.current; }

  /** Pone otra sesión en este mismo lugar (Reiniciar). */
  attach(session: MatchSession, frame: HTMLElement): void {
    this.off?.();
    this.current = session;
    this.stage.replaceChildren(frame);
    this.off = session.onChange(() => this.render());
    this.renderHowTo();
    this.render();
  }

  detach(): void {
    this.off?.(); this.off = null; this.disarm();
    window.removeEventListener("blur", this.onWindowFocus);
    window.removeEventListener("focus", this.onWindowFocus);
  }

  /** Le da el teclado a la partida (al abrirla). */
  focusGame(): void { this.current.focus(); setTimeout(this.checkFocus, 0); }

  // ------------------------------------------------------------------

  /** Si la partida está en juego, el primer clic pide confirmar en el mismo botón. */
  private confirmIfPlaying(button: HTMLButtonElement, question: string, action: () => void): void {
    const s = this.current.status;
    const risky = s === "playing" || s === "paused";
    if (!risky || this.armed?.button === button) { this.disarm(); action(); return; }
    this.disarm();
    const original = button.textContent ?? "";
    button.textContent = question;
    button.classList.add("confirm");
    this.detail.textContent = "La partida en curso terminará sin ganador. Pulsa otra vez para confirmar.";
    const timer = setTimeout(() => this.disarm(), CONFIRM_MS);
    this.armed = { button, timer };
    button.dataset.original = original;
  }

  private disarm(): void {
    if (!this.armed) return;
    clearTimeout(this.armed.timer);
    const b = this.armed.button;
    b.textContent = b.dataset.original ?? b.textContent;
    b.classList.remove("confirm");
    this.armed = null;
    this.render();
  }

  private toggleHowTo(force?: boolean): void {
    const show = force ?? this.howTo.hidden;
    this.howTo.hidden = !show;
    this.howButton.setAttribute("aria-expanded", String(show));
    this.howButton.classList.toggle("active", show);
  }

  private renderHowTo(): void {
    const text = this.current.manifest.howToPlay?.trim();
    this.howButton.hidden = !text;
    const close = el("button", { type: "button", class: "btn small primary", text: "Entendido" });
    close.addEventListener("click", () => { this.toggleHowTo(false); this.current.focus(); });
    this.howTo.replaceChildren(el("h4", { text: "Cómo se juega" }), text ? howToPlayText(text) : "", close);
    this.toggleHowTo(false);
  }

  private setFocus(focused: boolean): void {
    if (focused === this.hasFocus) return;
    this.hasFocus = focused;
    this.render();
  }

  private render(): void {
    const s = this.current;
    const ctx = s.context;
    this.title.textContent = s.manifest.name;
    this.players.textContent = ctx.players.map((p) => p.name).join(" vs ");
    this.element.dataset.status = s.status;
    if (s.status !== this.lastStatus) { this.announce(s.status); this.lastStatus = s.status; }

    this.status.textContent = STATUS_TEXT[s.status];
    this.status.className = `match-status ${s.status}`;

    this.pauseButton.textContent = s.status === "paused" ? "Reanudar" : "Pausar";
    this.pauseButton.disabled = s.status !== "playing" && s.status !== "paused";
    this.pauseButton.classList.toggle("primary", s.resumeHint);
    const busy = s.status === "stopping";
    if (this.armed?.button !== this.restartButton)
      this.restartButton.textContent = s.status === "error" ? "Reintentar" : "Reiniciar";
    this.restartButton.classList.toggle("primary", s.status === "error" || s.status === "finished");
    this.restartButton.disabled = busy;
    this.closeButton.disabled = busy;

    if (!this.armed) this.detail.textContent = this.detailText();
  }

  /** Avisa los cambios importantes una sola vez (Nielsen 1: estado visible). */
  private announce(status: SessionStatus): void {
    const s = this.current;
    const name = s.manifest.name;
    if (status === "finished" && s.result?.reason === "normal") {
      const winner = s.context.players.find((p) => p.playerId === s.result!.winner);
      this.actions.notify?.(winner ? `${name}: ¡ganó ${winner.name}!` : `${name}: terminó sin ganador.`, "good");
    } else if (status === "error") {
      this.actions.notify?.(`${name}: la partida falló. Puedes reintentarla.`, "warn");
    }
  }

  private detailText(): string {
    const s = this.current;
    if (s.status === "error") return s.error ?? "La partida falló. Pulsa «Reintentar».";
    if (s.status === "paused")
      return s.pauseReason === "hidden"
        ? (s.resumeHint ? "Se pausó mientras no estaba a la vista. Pulsa «Reanudar»." : "En pausa: no está a la vista.")
        : "En pausa. Pulsa «Reanudar» para seguir.";
    if (s.status === "finished" && s.result) {
      if (s.result.reason === "stopped") return "Partida detenida.";
      const winner = s.context.players.find((p) => p.playerId === s.result!.winner);
      return `${winner ? `¡Ganó ${winner.name}!` : "Sin ganador."} «Reiniciar» juega otra igual.`;
    }
    if (s.status === "playing" && !this.hasFocus) return "Haz clic en el juego para usar el teclado.";
    return "";
  }
}
