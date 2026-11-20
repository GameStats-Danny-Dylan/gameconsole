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
  update(f: Fighter, i: Intent): FighterState | void {
    if (!f.grounded) return new JumpState(0, false);
    const next = this.common(f, i);
    if (next) return next;
    if (i.move === 0) return new IdleState();
    // Hacia atrás se camina un poco más lento (como en casi todos los juegos de pelea).
    const backwards = i.move !== f.facing;
    f.vx = i.move * f.physics.walkSpeed * (backwards ? 0.8 : 1);
  }
}

export class JumpState extends FighterState {
  readonly name = "jump";

  /** dir: hacia dónde salta. takeoff: false si ya estaba en el aire (se cayó, no saltó). */
  constructor(private readonly dir: -1 | 0 | 1, private readonly takeoff = true) { super(); }

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

  update(f: Fighter): FighterState | void {
    const rules = f.rules;
    const elapsed = f.stateTime;
    if (f.grounded) f.vx = 0;
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

  update(f: Fighter, i: Intent): FighterState | void {
    // El empujón del bloqueo se frena solo; mientras dure el bloqueo-aturdimiento no se suelta.
    f.vx *= 0.8;
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

  update(f: Fighter): FighterState | void {
    f.vx *= 0.85;
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

  update(f: Fighter): void {
    if (f.grounded) f.vx *= 0.8;
  }
}
