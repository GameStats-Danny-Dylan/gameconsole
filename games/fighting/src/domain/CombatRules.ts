/**
 * CombatRules — los números y las reglas del combate: daño, bloqueo, alcance,
 * tiempos de cada golpe, aturdimiento y la ventana del combo.
 *
 * Patrón Strategy: FightingMatch y los estados del luchador no tienen números
 * escritos; le preguntan todo a un CombatRules. Otras reglas (más daño, rounds
 * más cortos) son otra instancia con otra configuración, sin tocar la lógica.
 */
import { HitBox } from "./HitBox";

export type Move = "punch" | "kick";

export interface MoveSpec {
  /** Daño nominal (antes de recortarlo a la vida que le queda al rival). */
  damage: number;
  /** Segundos antes de que el golpe pueda conectar. */
  startup: number;
  /** Segundos en que el golpe puede conectar. */
  active: number;
  /** Segundos de recuperación después (aquí se puede castigar al que falló). */
  recovery: number;
  /** Cuánto se extiende el golpe por delante del cuerpo. */
  reach: number;
  /** Altura del golpe, medida desde los pies hacia arriba (centro del golpe). */
  height: number;
  /** Grosor vertical del golpe. */
  thickness: number;
}

export interface RulesConfig {
  maxHealth: number;
  roundSeconds: number;
  /** Aturdimiento del que recibe un golpe. */
  hitstun: number;
  /** Lo que se frena el que bloquea un golpe. */
  blockstun: number;
  /** Velocidad con la que el golpe empuja al que lo recibe. */
  knockback: number;
  /** Máximo de segundos entre dos golpes conectados para que sigan siendo combo. */
  comboWindow: number;
  moves: Record<Move, MoveSpec>;
}

export const DEFAULT_RULES: RulesConfig = {
  maxHealth: 100,
  roundSeconds: 60,
  // Menor que un puño completo (0,32 s): entre dos golpes el rival alcanza a
  // bloquear, así no hay combos infinitos contra la pared.
  hitstun: 0.28,
  blockstun: 0.18,
  knockback: 260,
  comboWindow: 0.75,
  moves: {
    punch: { damage: 7, startup: 0.07, active: 0.09, recovery: 0.16, reach: 62, height: 105, thickness: 22 },
    kick: { damage: 11, startup: 0.13, active: 0.11, recovery: 0.28, reach: 86, height: 55, thickness: 26 },
  },
};

/** Lo que pasa cuando un golpe alcanza al rival. */
export type HitOutcome =
  | { kind: "hit"; damage: number }
  | { kind: "blocked" };

/** Lo mínimo que las reglas necesitan saber de un luchador. */
export interface Combatant {
  readonly health: number;
  readonly blocking: boolean;
  /** 1 si mira a la derecha, -1 si mira a la izquierda. */
  readonly facing: 1 | -1;
  readonly x: number;
}

export class CombatRules {
  constructor(readonly config: RulesConfig = DEFAULT_RULES) {}

  move(m: Move): MoveSpec { return this.config.moves[m]; }

  /** Duración total del golpe (arranque + activo + recuperación). */
  duration(m: Move): number {
    const s = this.move(m);
    return s.startup + s.active + s.recovery;
  }

  /** Si en ese momento del golpe (segundos desde que empezó) puede conectar. */
  isActive(m: Move, elapsed: number): boolean {
    const s = this.move(m);
    return elapsed >= s.startup && elapsed < s.startup + s.active;
  }

  /** La zona que alcanza el golpe, delante del cuerpo del que pega. */
  attackBox(m: Move, body: HitBox, facing: 1 | -1): HitBox {
    const s = this.move(m);
    const y = body.bottom - s.height - s.thickness / 2;
    const x = facing === 1 ? body.right : body.left - s.reach;
    return new HitBox(x, y, s.reach, s.thickness);
  }

  /** Alcance: el golpe toca el cuerpo del rival. */
  inRange(m: Move, attackerBody: HitBox, facing: 1 | -1, defenderBody: HitBox): boolean {
    return this.attackBox(m, attackerBody, facing).intersects(defenderBody);
  }

  /**
   * Bloqueo: solo sirve si el que bloquea mira hacia el que pega (un golpe por
   * la espalda entra igual).
   */
  blocks(defender: Combatant, attacker: Combatant): boolean {
    if (!defender.blocking) return false;
    const towardAttacker = Math.sign(attacker.x - defender.x) || defender.facing;
    return defender.facing === towardAttacker;
  }

  /**
   * Daño: el del golpe, recortado a la vida que le queda al rival (así la suma
   * de daños de un round nunca pasa de la vida máxima). Bloqueado: 0.
   */
  resolve(m: Move, attacker: Combatant, defender: Combatant): HitOutcome {
    if (this.blocks(defender, attacker)) return { kind: "blocked" };
    const damage = Math.max(0, Math.min(this.move(m).damage, defender.health));
    return { kind: "hit", damage };
  }

  /** Rounds que hay que ganar para llevarse la pelea (mayoría: 1 de 1, 2 de 3, 3 de 5). */
  static roundsToWin(rounds: number): number {
    return Math.floor(rounds / 2) + 1;
  }
}
