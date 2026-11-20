/**
 * GameFeel — patrón Mediator: une la pelea con todo lo que la hace "sentirse"
 * (congelado de impacto, cámara lenta del KO final y efectos). La pelea no
 * conoce a ninguno; avisa los impactos por su Observer (`impacts`) y GameFeel
 * reparte: congela unos cuadros, lanza chispas, sacude la pantalla...
 *
 * El controlador le pide, cada cuadro, cuánto tiempo puede avanzar la pelea
 * (advance) y después le deja actualizar los efectos (settle). Nada de esto
 * cambia los hechos ni los eventos: solo cuándo y cómo se ven.
 */
import type { FightingMatch, Impact } from "../domain/FightingMatch";
import { EffectsSystem } from "./EffectsSystem";
import { HitStop, hitStopFor } from "./HitStop";
import { SlowMotion } from "./SlowMotion";

/** Cámara lenta del KO que decide la pelea: duración (s reales) y velocidad. */
export const FINAL_SLOWMO = { seconds: 1.3, factor: 0.3 } as const;
/** Zoom leve hacia el que cae en el KO final. */
export const FINAL_ZOOM = 1.16;

export class GameFeel {
  readonly hitStop = new HitStop();
  readonly slowMo = new SlowMotion();
  readonly fx = new EffectsSystem();
  /** El tiempo de la presentación de este cuadro (real × cámara lenta). */
  private presentationDt = 0;

  /** Escucha los impactos de la pelea. */
  watch(match: FightingMatch): void {
    match.impacts.on((i) => this.onImpact(i));
  }

  onImpact(i: Impact): void {
    this.hitStop.trigger(hitStopFor(i));
    this.fx.onImpact(i);
  }

  /** dt real → cuánto puede avanzar la pelea en este cuadro (0 mientras está congelada). */
  advance(realDt: number): number {
    const scale = this.slowMo.scale;
    this.slowMo.update(realDt);
    this.presentationDt = realDt * scale;
    return this.hitStop.consume(this.presentationDt);
  }

  /** Después del paso de la pelea: avanzan los efectos (también durante el congelado). */
  settle(match: FightingMatch): void {
    this.fx.update(this.presentationDt, match);
  }

  /** La pelea terminó: si fue por KO, cámara lenta y zoom hacia el que cae. */
  matchOver(match: FightingMatch): void {
    const r = match.currentRound.result;
    if (!r || r.method === "timeout") return;
    this.slowMo.start(FINAL_SLOWMO.seconds, FINAL_SLOWMO.factor);
    const fallen = match.fighters.filter((f) => f.knockedOut);
    const x = fallen.length === 1 ? fallen[0].x - fallen[0].facing * 30 : (match.fighters[0].x + match.fighters[1].x) / 2;
    this.fx.camera.zoomTo(FINAL_ZOOM, x, match.arena.floorY - 110);
  }
}
