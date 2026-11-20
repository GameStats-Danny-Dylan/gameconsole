/**
 * EffectsSystem — el estado de la presentación que cambia con el tiempo y que
 * no es parte de la pelea: el reloj de las animaciones, la estela de daño de
 * las barras de vida, el aterrizaje de cada luchador y el festejo del ganador.
 *
 * Es lógica pura (sin canvas): lo avanza el controlador en cada cuadro con el
 * mismo dt que la pelea, así en la pausa todo queda quieto. La vista solo lo lee.
 * Nunca cambia la pelea.
 */
import type { Fighter } from "../domain/fighter/Fighter";
import type { FightingMatch } from "../domain/FightingMatch";

/** Lo que se sigue de cada luchador. */
export interface FighterFx {
  /** Vida "fantasma" (0 a 1): se queda un momento y después baja detrás de la real. */
  trail: number;
  /** Segundos que la estela espera antes de bajar. */
  trailHold: number;
  /** Aterrizaje reciente: 1 al tocar el piso, baja a 0. */
  landing: number;
  /** Festejo del ganador del round (0 a 1). */
  victory: number;
  wasGrounded: boolean;
  lastRatio: number;
}

/** Segundos que la estela de daño espera quieta antes de bajar. */
export const TRAIL_HOLD = 0.45;
/** Lo que baja la estela por segundo (fracción de la barra). */
export const TRAIL_SPEED = 0.6;
/** Segundos que dura la flexión de rodillas al aterrizar. */
export const LANDING_TIME = 0.16;

export class EffectsSystem {
  /** Reloj de la presentación (segundos). */
  clock = 0;
  private readonly fighters = new Map<string, FighterFx>();

  /** Avanza dt segundos mirando la pelea (solo la lee). */
  update(dt: number, match: FightingMatch): void {
    if (dt <= 0) return;
    this.clock += dt;
    const round = match.currentRound;
    const winner = round.phase === "over" && round.result?.kind === "won" ? round.result.winner : null;
    for (const f of match.fighters) {
      const s = this.track(f);
      this.updateTrail(s, f, dt);
      if (f.grounded && !s.wasGrounded && f.stateName !== "ko") s.landing = 1;
      else s.landing = Math.max(0, s.landing - dt / LANDING_TIME);
      s.wasGrounded = f.grounded;
      const celebrating = winner === f.playerId && round.elapsedInPhase > 0.5;
      s.victory = celebrating ? Math.min(1, s.victory + dt / 0.35) : Math.max(0, s.victory - dt / 0.2);
    }
  }

  /** Lo de un luchador (se crea la primera vez). */
  of(f: Fighter): Readonly<FighterFx> {
    return this.track(f);
  }

  private track(f: Fighter): FighterFx {
    let s = this.fighters.get(f.playerId);
    if (!s) {
      const r = f.health / f.maxHealth;
      s = { trail: r, trailHold: 0, landing: 0, victory: 0, wasGrounded: f.grounded, lastRatio: r };
      this.fighters.set(f.playerId, s);
    }
    return s;
  }

  private updateTrail(s: FighterFx, f: Fighter, dt: number): void {
    const ratio = f.health / f.maxHealth;
    if (ratio < s.lastRatio) s.trailHold = TRAIL_HOLD; // golpe nuevo: la estela espera otra vez
    s.lastRatio = ratio;
    if (ratio >= s.trail) { s.trail = ratio; s.trailHold = 0; return; } // vida llena (round nuevo)
    if (s.trailHold > 0) s.trailHold = Math.max(0, s.trailHold - dt);
    else s.trail = Math.max(ratio, s.trail - TRAIL_SPEED * dt);
  }
}
