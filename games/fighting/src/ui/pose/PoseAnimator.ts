/**
 * PoseAnimator — elige la pose del luchador según su estado (patrón State del
 * dominio) y el tiempo en ese estado: respiración en idle, ciclo de piernas al
 * caminar, salto, puño con el brazo extendido, patada, bloqueo, golpeado y la
 * caída del KO.
 *
 * Es de solo lectura: mira al luchador y devuelve ángulos. No cambia nada del
 * dominio, así que las animaciones nunca mueven una HitBox (hay pruebas de eso).
 * Los tiempos del golpe salen de CombatRules: el brazo (o la pierna) llega a
 * estirarse justo cuando el golpe se vuelve activo.
 */
import type { Fighter } from "../../domain/fighter/Fighter";
import { blend, type Limb, type Pose } from "./Skeleton";

/** Lo que la pose necesita además del luchador (todo de la presentación). */
export interface AnimContext {
  /** Reloj de la presentación (segundos; se detiene en la pausa). */
  clock: number;
  /** Aterrizaje reciente (1 recién cae, baja a 0): flexiona las rodillas. */
  landing: number;
  /** Festejo del ganador del round (0 a 1). */
  victory: number;
}

const L = (upper: number, lower: number, tip?: number): Limb => (tip === undefined ? { upper, lower } : { upper, lower, tip });

const pose = (p: Partial<Pose>): Pose => ({ ...STANCE, ...p });

/** Guardia: de lado, rodillas flexionadas y los puños delante de la cara. */
const STANCE: Pose = {
  shiftX: 0, hipY: null, lean: 0.06, headTilt: 0.04, breath: 0,
  armFront: L(0.55, 2.0), armBack: L(0.3, 2.05),
  legFront: L(0.34, -0.44), legBack: L(-0.3, -0.1),
  rot: 0, lift: 0,
};

const PUNCH_CHAMBER = pose({ armFront: L(0.12, 2.45), lean: -0.02, shiftX: -3, armBack: L(0.35, 2.1) });
const PUNCH_OUT = pose({
  armFront: L(Math.PI / 2 - 0.05, 0.04), armBack: L(-0.15, 2.5),
  lean: 0.3, shiftX: 13, headTilt: -0.08,
  legFront: L(0.62, -0.55), legBack: L(-0.62, -0.02),
});

const KICK_CHAMBER = pose({
  legFront: L(1.45, -2.2), legBack: L(-0.1, -0.15), lean: -0.12, shiftX: 4,
  armFront: L(0.8, 1.8), armBack: L(-0.2, 1.9),
});
const KICK_OUT = pose({
  legFront: L(1.3, -0.02, 0.35), legBack: L(-0.14, -0.04), lean: -0.32, shiftX: 18, headTilt: 0.05,
  armFront: L(0.9, 1.7), armBack: L(-0.6, 1.3),
});

const AIR_RISE = pose({
  hipY: 74, legFront: L(1.25, -2.1), legBack: L(0.55, -1.8),
  armFront: L(1.2, 1.5), armBack: L(-0.5, 1.2), lean: 0.15,
});
const AIR_FALL = pose({
  hipY: 74, legFront: L(0.55, -0.9), legBack: L(-0.15, -0.5),
  armFront: L(0.9, 1.6), armBack: L(-0.2, 1.5), lean: 0.05,
});
const AIR_KICK_CHAMBER = pose({
  hipY: 74, legFront: L(1.4, -2.0), legBack: L(0.45, -1.9), lean: -0.05,
  armFront: L(1.1, 1.3), armBack: L(-0.5, 1.2),
});
const AIR_KICK_OUT = pose({
  hipY: 74, shiftX: 6, legFront: L(1.25, -0.05, 0.4), legBack: L(0.45, -1.9), lean: -0.22,
  armFront: L(1.3, 1.0), armBack: L(-0.7, 1.0),
});

/** Bloqueo: agachado, mentón adentro y los dos antebrazos parados delante de la cara. */
const BLOCK = pose({
  lean: -0.1, headTilt: 0.28, shiftX: -3,
  armFront: L(1.3, 1.72), armBack: L(1.05, 1.95),
  legFront: L(0.5, -0.9), legBack: L(-0.42, -0.4),
});

const RECOIL = pose({
  lean: -0.42, headTilt: -0.45, shiftX: -8,
  armFront: L(-0.35, 0.7), armBack: L(-0.6, 0.5),
  legFront: L(0.5, -0.85), legBack: L(-0.3, -0.4),
});

/** Tendido de espaldas (el cuerpo entero se rota): piernas casi rectas y brazos por encima de la cabeza. */
const KO_BODY = pose({
  lean: -0.12, headTilt: -0.3,
  armFront: L(-2.75, 0.25), armBack: L(-2.3, 0.45),
  legFront: L(0.14, -0.28), legBack: L(-0.04, -0.1),
});

const VICTORY = pose({
  armFront: L(2.95, 0.12), armBack: L(0.4, 2.2), lean: -0.03, headTilt: -0.12,
  legFront: L(0.22, -0.2), legBack: L(-0.2, -0.05),
});

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

/** Segundos que tarda en caer el KO. */
export const KO_FALL = 0.6;

export class PoseAnimator {
  poseFor(f: Fighter, ctx: AnimContext): Pose {
    switch (f.stateName) {
      case "idle": return this.idle(f, ctx);
      case "walk": return this.walk(f, ctx);
      case "jump": return this.air(f);
      case "attack": return this.attack(f, ctx);
      case "block": return this.block(f);
      case "hit": return this.hit(f);
      case "ko": return this.ko(f);
    }
  }

  private idle(f: Fighter, ctx: AnimContext): Pose {
    const b = Math.sin(ctx.clock * 2.4 + (f.slot === 2 ? 1.3 : 0));
    const sink = b * 0.03 + ctx.landing * 0.5;
    let p = pose({
      breath: b,
      lean: STANCE.lean + b * 0.015 + ctx.landing * 0.1,
      armFront: L(STANCE.armFront.upper + b * 0.03, STANCE.armFront.lower),
      armBack: L(STANCE.armBack.upper + b * 0.025, STANCE.armBack.lower),
      legFront: L(STANCE.legFront.upper + sink * 0.5, STANCE.legFront.lower - sink),
      legBack: L(STANCE.legBack.upper - sink * 0.3, STANCE.legBack.lower - sink * 0.6),
    });
    if (ctx.victory > 0) p = blend(p, VICTORY, easeInOut(ctx.victory));
    return p;
  }

  private walk(f: Fighter, ctx: AnimContext): Pose {
    // Hacia atrás, el ciclo de piernas va al revés.
    const sense = f.vx * f.facing >= 0 ? 1 : -1;
    const phase = f.stateTime * 11 * sense;
    const swing = (o: number, base: number) =>
      L(base + 0.38 * Math.sin(phase + o), -0.12 - 0.75 * Math.max(0, Math.cos(phase + o)));
    const bob = Math.sin(phase * 2);
    return pose({
      lean: 0.12, breath: bob * 0.3,
      legFront: swing(0, 0.14), legBack: swing(Math.PI, -0.06),
      armFront: L(STANCE.armFront.upper + 0.05 * bob, STANCE.armFront.lower),
      armBack: L(STANCE.armBack.upper - 0.04 * bob, STANCE.armBack.lower),
      headTilt: 0.04,
    });
  }

  private air(f: Fighter): Pose {
    // Subiendo: recogido; bajando: estira las piernas para caer.
    return blend(AIR_RISE, AIR_FALL, clamp01((f.vy + 500) / 1000));
  }

  private attack(f: Fighter, ctx: AnimContext): Pose {
    const atk = f.attack!;
    const spec = f.rules.move(atk.move);
    const u = f.stateTime;
    const air = !f.grounded;
    const [rest, chamber, out] = atk.move === "punch"
      ? [air ? AIR_FALL : this.idle(f, { ...ctx, victory: 0 }), PUNCH_CHAMBER, PUNCH_OUT]
      : air ? [AIR_FALL, AIR_KICK_CHAMBER, AIR_KICK_OUT] : [STANCE, KICK_CHAMBER, KICK_OUT];

    // Arranque: carga (60 %) y se estira (40 %), justo hasta que el golpe es activo.
    if (u < spec.startup) {
      const t = u / spec.startup;
      return t < 0.6 ? blend(rest, chamber, easeOut(t / 0.6)) : blend(chamber, out, easeOut((t - 0.6) / 0.4));
    }
    // Activo: estirado del todo.
    if (u < spec.startup + spec.active) return out;
    // Recuperación: vuelve a la guardia.
    const r = clamp01((u - spec.startup - spec.active) / spec.recovery);
    return blend(out, air ? AIR_FALL : STANCE, easeInOut(r));
  }

  private block(f: Fighter): Pose {
    // Al frenar un golpe, se echa un poco atrás.
    const push = f.stateTime < f.blockstunUntil ? 1 - f.stateTime / Math.max(0.001, f.blockstunUntil) : 0;
    const settle = easeOut(clamp01(f.stateTime / 0.06));
    const p = blend(STANCE, BLOCK, settle);
    return push > 0 ? { ...p, lean: p.lean - 0.12 * push, shiftX: p.shiftX - 5 * push } : p;
  }

  private hit(f: Fighter): Pose {
    const k = 1 - clamp01(f.stateTime / f.rules.config.hitstun);
    const p = blend(STANCE, RECOIL, easeOut(k));
    return f.grounded ? p : { ...p, hipY: 74 };
  }

  private ko(f: Fighter): Pose {
    const t = f.stateTime;
    const fall = clamp01(t / KO_FALL);
    // Primero se dobla hacia atrás; después cae de espaldas con un rebote.
    const body = blend(RECOIL, KO_BODY, easeOut(clamp01(t / 0.25)));
    const bounce = t > KO_FALL && t < KO_FALL + 0.3 ? Math.sin(((t - KO_FALL) / 0.3) * Math.PI) : 0;
    return {
      ...body,
      hipY: f.grounded ? null : 74,
      rot: fall * fall * (Math.PI / 2 - 0.05) - bounce * 0.07,
      lift: fall * 10 + bounce * 6,
    };
  }
}
