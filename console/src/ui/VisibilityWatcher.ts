/**
 * VisibilityWatcher — decide si el iframe de cada partida se ve (protocolo,
 * sección 4, "Partidas ocultas").
 *
 * Una partida NO se ve si la pestaña está oculta (visibilitychange), si su
 * iframe salió de la pantalla (IntersectionObserver) o si la consola la tapa
 * (setCovered). Los paneles laterales de nueva partida y estadísticas NO tapan:
 * dejan las partidas a la vista. Le avisa a la sesión, que decide si manda
 * PAUSE "hidden".
 */
import type { MatchSession } from "../match/MatchSession";

/** Parte del iframe que tiene que estar en pantalla para contar como "se ve". */
const MIN_VISIBLE_RATIO = 0.2;

export class VisibilityWatcher {
  private readonly watched = new Map<Element, { session: MatchSession; onScreen: boolean }>();
  private readonly observer: IntersectionObserver | null;
  private covered = false;

  constructor(private readonly doc: Document = document) {
    this.observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
          for (const e of entries) {
            const w = this.watched.get(e.target);
            if (!w) continue;
            w.onScreen = e.isIntersecting && e.intersectionRatio >= MIN_VISIBLE_RATIO;
            this.apply(w.session, w.onScreen);
          }
        }, { threshold: [0, MIN_VISIBLE_RATIO, 0.5, 1] })
      : null;
    doc.addEventListener("visibilitychange", () => this.applyAll());
  }

  watch(element: Element, session: MatchSession): void {
    this.watched.set(element, { session, onScreen: true });
    this.observer?.observe(element);
    this.apply(session, true);
  }

  unwatch(element: Element): void {
    this.observer?.unobserve(element);
    this.watched.delete(element);
  }

  /** La consola tapa (o deja de tapar) todas las partidas. */
  setCovered(covered: boolean): void {
    this.covered = covered;
    this.applyAll();
  }

  private applyAll(): void {
    for (const w of this.watched.values()) this.apply(w.session, w.onScreen);
  }

  private apply(session: MatchSession, onScreen: boolean): void {
    session.setVisible(onScreen && !this.covered && this.doc.visibilityState === "visible");
  }
}
