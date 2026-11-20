/**
 * Estados del luchador — patrón State.
 *
 *   idle ⇄ walk          (moverse / soltar)
 *   idle|walk ─W/↑──► jump ──aterriza──► idle
 *   idle|walk|jump ─golpe──► attack ──termina──► idle (o jump si sigue en el aire)
 *   idle|walk ─bloqueo──► block ──suelta──► idle
 *   cualquiera ─recibe golpe──► hit ──se recupera──► idle
 *   cualquiera ─vida 0──► ko (final)
 *
 * Cada estado decide qué hace con la intención del jugador y a qué estado
 * pasa; Fighter no tiene un if por cada combinación. update devuelve el
 * estado siguiente (o nada para quedarse).
 */
import type { Move } from "../CombatRules";
import type { Fighter } from "./Fighter";
import type { Intent } from "./Intent";

export type FighterStateName = "idle" | "walk" | "jump" | "attack" | "block" | "hit" | "ko";

export abstract class FighterState {
  abstract readonly name: FighterStateName;
  /** Si en este estado los golpes de frente se bloquean. */
  readonly blocking: boolean = false;
  /** Si en este estado se puede recibir un golpe. */
  readonly vulnerable: boolean = true;
  /** Si en este estado el luchador se gira para mirar al rival. */
  readonly canTurn: boolean = false;

  enter(_f: Fighter): void {}
  abstract update(f: Fighter, intent: Intent, dt: number): FighterState | void;
}

/** Lo que pueden hacer idle y walk (en el piso y libres). */
abstract class GroundFree extends FighterState {
  override readonly canTurn = true;

  protected common(f: Fighter, i: Intent): FighterState | void {
    if (i.attack) return new AttackState(i.down ? "kick" : "punch");
    if (i.block) return new BlockState();
    if (i.jump) return new JumpState(i.move);
  }
}

export class IdleState extends GroundFree {
  readonly name = "idle";
  override enter(f: Fighter): void { f.vx = 0; }
  update(f: Fighter, i: Intent): FighterState | void {
    if (!f.grounded) return new JumpState(0, false);
    return this.common(f, i) ?? (i.move !== 0 ? new WalkState() : undefined);
  }
}

export class WalkState extends GroundFree {
  readonly name = "walk";
  update(f: Fighter, i: Intent, dt: number): FighterState | void {
    if (!f.grounded) return new JumpState(0, false);
    const next = this.common(f, i);
    if (next) return next;
    // Soltar es frenar en seco (para medir bien las distancias, como en casi todos los juegos de pelea).
    if (i.move === 0) return new IdleState();
    // Hacia atrás se camina un poco más lento. Se acelera hasta esa velocidad;
    // al cambiar de sentido, el doble de rápido.
    const backwards = i.move !== f.facing;
    const target = i.move * f.physics.walkSpeed * (backwards ? 0.8 : 1);
    const turning = f.vx !== 0 && Math.sign(f.vx) !== i.move;
    f.vx = approach(f.vx, target, f.physics.walkAccel * (turning ? 2 : 1) * dt);
  }
}

export class JumpState extends FighterState {
  readonly name = "jump";

  /** dir: hacia dónde salta. takeoff: false si ya estaba en el aire (se cayó, no saltó). */
  constructor(private readonly dir: -1 | 0 | 1, readonly takeoff = true) { super(); }

  override enter(f: Fighter): void {
    if (!this.takeoff) return;
    f.vy = -f.physics.jumpSpeed;
    f.vx = this.dir * f.physics.walkSpeed;
  }

  update(f: Fighter, i: Intent): FighterState | void {
    // Golpe en el aire: siempre patada.
    if (i.attack) return new AttackState("kick");
    if (f.grounded && f.vy >= 0) return new IdleState();
  }
}

export class AttackState extends FighterState {
  readonly name = "attack";
  /** Si este golpe ya tocó al rival (conectó o lo bloquearon): un golpe toca una sola vez. */
  connected = false;
  /** Si ya se avisó que falló (para que salga un solo ATTACK fallado). */
  private whiffed = false;

  constructor(readonly move: Move) { super(); }

  override enter(f: Fighter): void {
    if (f.grounded) f.vx = 0;
  }

  update(f: Fighter, _i: Intent, dt: number): FighterState | void {
    const rules = f.rules;
    const elapsed = f.stateTime;
    // En el piso no se camina golpeando; solo se frena un empujón (el de la pared, por ejemplo).
    if (f.grounded) f.vx = friction(f.vx, f.physics.friction, dt);
    // Terminó la parte activa sin tocar a nadie: un golpe al aire.
    if (!this.connected && !this.whiffed && elapsed >= rules.move(this.move).startup + rules.move(this.move).active) {
      this.whiffed = true;
      f.signal({ kind: "whiff", move: this.move });
    }
    if (elapsed >= rules.duration(this.move)) return f.grounded ? new IdleState() : new JumpState(0, false);
  }

  /** Si en este instante puede conectar. */
  isActive(f: Fighter): boolean {
    return !this.connected && f.rules.isActive(this.move, f.stateTime);
  }
}

export class BlockState extends FighterState {
  readonly name = "block";
  override readonly blocking = true;
  override readonly canTurn = true;

  override enter(f: Fighter): void { f.vx = 0; }

  update(f: Fighter, i: Intent, dt: number): FighterState | void {
    // El empujón del bloqueo se frena solo; mientras dure el bloqueo-aturdimiento no se suelta.
    f.vx = friction(f.vx, f.physics.friction * 1.35, dt);
    if (f.stateTime < f.blockstunUntil) return;
    if (!i.block) return new IdleState();
  }
}

export class HitState extends FighterState {
  readonly name = "hit";

  constructor(private readonly duration: number, private readonly pushDir: -1 | 1, private readonly push: number) { super(); }

  override enter(f: Fighter): void {
    f.vx = this.pushDir * this.push;
  }

  update(f: Fighter, _i: Intent, dt: number): FighterState | void {
    f.vx = friction(f.vx, f.physics.friction, dt);
    if (f.stateTime >= this.duration && f.grounded) return new IdleState();
  }
}

export class KoState extends FighterState {
  readonly name = "ko";
  override readonly vulnerable = false;

  constructor(private readonly pushDir: -1 | 1, private readonly push: number) { super(); }

  override enter(f: Fighter): void {
    f.vx = this.pushDir * this.push;
    if (f.grounded) f.vy = -f.physics.jumpSpeed * 0.35; // sale despedido un poco
  }

  update(f: Fighter, _i: Intent, dt: number): void {
    if (f.grounded) f.vx = friction(f.vx, f.physics.friction * 1.35, dt);
  }
}

/** Fricción que no depende de los cuadros por segundo: v · e^(-k·dt). */
function friction(v: number, k: number, dt: number): number {
  const next = v * Math.exp(-k * dt);
  return Math.abs(next) < 1 ? 0 : next;
}

/** Acerca v a target sin pasarse, a lo sumo step. */
function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}
