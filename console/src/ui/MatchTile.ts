/**
 * MatchTile — una partida en la cuadrícula: título, estado, botones y el iframe.
 * Se dibuja de nuevo cada vez que su sesión cambia (Observer).
 *
 * Usabilidad (heurísticas de Nielsen):
 * - "Cómo se juega" siempre a mano durante la partida (reconocer en vez de recordar).
 * - Cerrar (siempre) y Reiniciar (si la partida sigue) piden confirmar: los
 *   botones se cambian por una pregunta con «Cancelar» y «Sí, …», sin ventanas
 *   emergentes (prevención de errores, control del usuario). Esc cancela.
 * - Todos los botones van arriba, junto al título: el juego usa el resto del alto.
 * - Si la partida no tiene el teclado, se avisa cómo dárselo.
 * - Con error, el mensaje dice qué hacer y "Reiniciar" pasa a "Reintentar".
 */
import type { MatchSession } from "../match/MatchSession";
import type { SessionStatus } from "../match/sessionStates";
import { el } from "./dom";
import { hasHowTo, renderHowTo } from "./howTo";

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

export class MatchTile {
  readonly element = el("article", { class: "match-tile" });
  private readonly title = el("h3", {});
  private readonly players = el("p", { class: "match-players" });
  private readonly status = el("span", { class: "match-status" });
  private readonly detail = el("p", { class: "match-detail", role: "status" });
  private readonly howButton = el("button", { type: "button", class: "btn small ghost", "aria-expanded": "false" });
  private readonly pauseButton = el("button", { type: "button", class: "btn small" });
  private readonly restartButton = el("button", { type: "button", class: "btn small" });
  private readonly newButton = el("button", { type: "button", class: "btn small" });
  private readonly closeButton = el("button", { type: "button", class: "btn small danger" });
  private readonly buttons = el("div", { class: "match-buttons" });
  /** La pregunta de confirmación: reemplaza a los botones mientras está abierta. */
  private readonly confirmBox = el("div", { class: "match-confirm", role: "group", hidden: true });
  private readonly howTo = el("section", { class: "tile-howto", hidden: true, "aria-label": "Cómo se juega" });
  /** Donde va el iframe. Es siempre el mismo elemento, aunque cambie la sesión. */
  readonly stage = el("div", { class: "match-stage" });
  private off: (() => void) | null = null;
  private hasFocus = false;
  private lastStatus: SessionStatus | null = null;

  constructor(private current: MatchSession, frame: HTMLElement, private readonly actions: TileActions) {
    this.buttons.append(this.howButton, this.pauseButton, this.restartButton, this.newButton, this.closeButton);
    this.element.append(
      el("header", { class: "match-head" },
        el("div", { class: "match-names" },
          el("div", { class: "match-title" }, this.title, this.status), this.players, this.detail),
        this.buttons, this.confirmBox),
      el("div", { class: "match-body" }, this.stage, this.howTo),
    );
    label(this.howButton, "?", "Cómo se juega");
    label(this.newButton, "＋", "Nueva partida");

    this.pauseButton.addEventListener("click", () => {
      if (this.current.status === "paused") this.current.resume();
      else this.current.pause("user");
    });
    this.restartButton.addEventListener("click", () => {
      if (!this.inProgress()) { this.actions.restart(this); return; }
      this.askConfirm("¿Reiniciar la partida?", "La que se está jugando terminará sin ganador.", "↻", "Sí, reiniciar",
        () => this.actions.restart(this));
    });
    this.newButton.addEventListener("click", () => this.actions.newMatch(this));
    this.closeButton.addEventListener("click", () =>
      this.askConfirm("¿Cerrar la partida?",
        this.inProgress() ? "Terminará sin ganador." : "Se quita de la pantalla.", "✕", "Sí, cerrar",
        () => this.actions.close(this)));
    this.howButton.addEventListener("click", () => this.toggleHowTo());
    this.element.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.confirmBox.hidden) { e.preventDefault(); this.cancelConfirm(); }
    });

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
    this.off?.(); this.off = null;
    window.removeEventListener("blur", this.onWindowFocus);
    window.removeEventListener("focus", this.onWindowFocus);
  }

  /** Le da el teclado a la partida (al abrirla). */
  focusGame(): void { this.current.focus(); setTimeout(this.checkFocus, 0); }

  // ------------------------------------------------------------------

  private inProgress(): boolean {
    const s = this.current.status;
    return s === "playing" || s === "paused";
  }

  /** Cambia los botones por la pregunta: «Cancelar» (con el foco) o confirmar. */
  private askConfirm(question: string, consequence: string, icon: string, yes: string, action: () => void): void {
    const cancel = el("button", { type: "button", class: "btn small" });
    label(cancel, "←", "Cancelar");
    const ok = el("button", { type: "button", class: "btn small danger solid" });
    label(ok, icon, yes);
    cancel.addEventListener("click", () => this.cancelConfirm());
    ok.addEventListener("click", () => { this.hideConfirm(); action(); });
    this.confirmBox.replaceChildren(
      el("p", { class: "confirm-text" }, el("strong", { text: question }), " ", consequence),
      el("div", { class: "confirm-buttons" }, cancel, ok));
    this.buttons.hidden = true;
    this.confirmBox.hidden = false;
    cancel.focus();
  }

  private hideConfirm(): void {
    this.confirmBox.hidden = true;
    this.confirmBox.replaceChildren();
    this.buttons.hidden = false;
  }

  private cancelConfirm(): void {
    this.hideConfirm();
    this.focusGame();
  }

  private toggleHowTo(force?: boolean): void {
    const show = force ?? this.howTo.hidden;
    this.howTo.hidden = !show;
    this.howButton.setAttribute("aria-expanded", String(show));
    this.howButton.classList.toggle("active", show);
  }

  private renderHowTo(): void {
    const h = this.current.manifest.instructions ?? this.current.manifest.howToPlay;
    this.howButton.hidden = !hasHowTo(h);
    const close = el("button", { type: "button", class: "btn primary", text: "Entendido, volver al juego" });
    close.addEventListener("click", () => { this.toggleHowTo(false); this.focusGame(); });
    this.howTo.replaceChildren(
      el("header", { class: "tile-howto-head" }, el("h4", { text: `Cómo se juega ${this.current.manifest.name}` })),
      hasHowTo(h) ? renderHowTo(h) : "", close);
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

    if (s.status === "paused") label(this.pauseButton, "▶", "Reanudar"); else label(this.pauseButton, "⏸", "Pausar");
    this.pauseButton.disabled = s.status !== "playing" && s.status !== "paused";
    this.pauseButton.classList.toggle("primary", s.resumeHint);
    const busy = s.status === "stopping";
    label(this.restartButton, "↻", s.status === "error" ? "Reintentar" : s.status === "finished" ? "Jugar otra" : "Reiniciar");
    label(this.closeButton, "✕", "Cerrar");
    this.restartButton.classList.toggle("primary", s.status === "error" || s.status === "finished");
    this.restartButton.disabled = busy;
    this.closeButton.disabled = busy;

    this.detail.textContent = this.detailText();
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
      return `${winner ? `¡Ganó ${winner.name}!` : "Sin ganador."} «Jugar otra» empieza una igual.`;
    }
    if (s.status === "playing" && !this.hasFocus) return "Haz clic en el juego para usar el teclado.";
    return "";
  }
}

/** Texto del botón con su ícono (el ícono es decorativo: el lector de pantalla lee el texto). */
function label(button: HTMLButtonElement, icon: string, text: string): void {
  button.replaceChildren(el("span", { class: "btn-icon", "aria-hidden": "true", text: icon }), text);
}