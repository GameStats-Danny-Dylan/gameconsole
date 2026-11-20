/**
 * Fighter — un luchador: posición, velocidad, vida y su estado actual
 * (patrón State, ver states.ts). Encapsula la física simple (gravedad, piso,
 * paredes) y deja que el estado decida qué hacer con la intención del jugador.
 *
 * No emite eventos: avisa "señales" (por ejemplo, un golpe al aire) que la
 * pelea recoge después de cada paso con drainSignals().
 */
import type { Arena } from "../Arena";
import type { CombatRules, Combatant, Move } from "../CombatRules";
import { HitBox } from "../HitBox";
import { InputBuffer } from "./InputBuffer";
import type { Intent } from "./Intent";
import {
  AttackState, BlockState, HitState, IdleState, JumpState, KoState,
  type FighterState, type FighterStateName,
} from "./states";

export interface Physics {
  width: number;
  height: number;
  walkSpeed: number;
  jumpSpeed: number;
  gravity: number;
  /** Aceleración al caminar (px/s²): arranca en unos cuadros, no a velocidad plena de golpe. */
  walkAccel: number;
  /** Fricción (1/s) que frena los empujones: la velocidad se multiplica por e^(-friction·dt). */
  friction: number;
  /** Arco del salto: cerca de la cima (|vy| < apexSpeed) la gravedad baja a apexGravity y al caer sube a fallGravity. */
  apexSpeed: number;
  apexGravity: number;
  fallGravity: number;
  /** Segundos que se recuerda un golpe o salto pulsado antes de poder hacerlo (InputBuffer). */
  inputBuffer: number;
}

export const DEFAULT_PHYSICS: Physics = {
  width: 64,
  height: 150,
  walkSpeed: 290,
  jumpSpeed: 820,
  gravity: 2400,
  walkAccel: 2600,
  friction: 10,
  apexSpeed: 170,
  apexGravity: 0.55,
  fallGravity: 1.2,
  inputBuffer: 0.1,
};

export type Side = "left" | "right";

/** Lo que identifica a un luchador (lo arma FighterFactory). */
export interface FighterSpec {
  playerId: string;
  name: string;
  slot: number;
  side: Side;
  character: string;
  color: string;
}

/** Algo que pasó dentro del luchador y que la pelea tiene que saber. */
export type FighterSignal = { kind: "whiff"; move: Move };

export class Fighter implements Combatant {
  readonly playerId: string;
  readonly name: string;
  readonly slot: number;
  readonly side: Side;
  readonly character: string;
  readonly color: string;

  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  facing: 1 | -1;
  /** Segundos en el estado actual. */
  stateTime = 0;
  /** Hasta qué stateTime dura el frenazo de un bloqueo. */
  blockstunUntil = 0;

  private hp: number;
  private current: FighterState = new IdleState();
  private readonly signals: FighterSignal[] = [];
  private readonly buffer: InputBuffer;

  constructor(
    spec: FighterSpec,
    readonly arena: Arena,
    readonly rules: CombatRules,
    readonly physics: Physics = DEFAULT_PHYSICS,
  ) {
    this.playerId = spec.playerId;
    this.name = spec.name;
    this.slot = spec.slot;
    this.side = spec.side;
    this.character = spec.character;
    this.color = spec.color;
    this.facing = spec.side === "left" ? 1 : -1;
    this.hp = rules.config.maxHealth;
    this.buffer = new InputBuffer(physics.inputBuffer);
    this.resetForRound();
  }

  // ------------------------------------------------------------------
  // Lectura
  // ------------------------------------------------------------------

  get health(): number { return this.hp; }
  get maxHealth(): number { return this.rules.config.maxHealth; }
  get state(): FighterState { return this.current; }
  get stateName(): FighterStateName { return this.current.name; }
  get blocking(): boolean { return this.current.blocking; }
  get vulnerable(): boolean { return this.current.vulnerable; }
  get knockedOut(): boolean { return this.current.name === "ko"; }
  get grounded(): boolean { return this.y >= this.arena.floorY; }

  /** El cuerpo: x es el centro, y son los pies. */
  get body(): HitBox {
    const { width, height } = this.physics;
    return new HitBox(this.x - width / 2, this.y - height, width, height);
  }

  /** El golpe en curso, si lo hay. */
  get attack(): AttackState | null {
    return this.current instanceof AttackState ? this.current : null;
  }

  /** La zona del golpe si en este instante puede conectar; si no, null. */
  activeAttackBox(): HitBox | null {
    const a = this.attack;
    return a && a.isActive(this) ? this.rules.attackBox(a.move, this.body, this.facing) : null;
  }

  // ------------------------------------------------------------------
  // Paso
  // ------------------------------------------------------------------

  /** Un paso de dt segundos: el estado decide, después la física mueve. */
  update(intent: Intent, dt: number): void {
    this.stateTime += dt;
    const next = this.current.update(this, this.buffer.feed(intent, dt), dt);
    if (next) {
      this.changeState(next);
      if (next instanceof AttackState) this.buffer.consumeAttack();
      if (next instanceof JumpState && next.takeoff) this.buffer.consumeJump();
    }

    if (!this.grounded || this.vy < 0) this.vy += this.physics.gravity * this.gravityScale() * dt;
    this.y += this.vy * dt;
    if (this.y >= this.arena.floorY) {
      this.y = this.arena.floorY;
      this.vy = 0;
    }
    this.x = this.arena.clampX(this.x + this.vx * dt, this.physics.width);
  }

  /** Arco del salto: sube rápido, cuelga un instante en la cima y cae un poco más rápido. */
  private gravityScale(): number {
    const p = this.physics;
    if (Math.abs(this.vy) < p.apexSpeed) return p.apexGravity;
    return this.vy > 0 ? p.fallGravity : 1;
  }

  /** Mira hacia una posición (solo si el estado lo permite: no se gira a mitad de un golpe). */
  faceToward(x: number): void {
    if (!this.current.canTurn || x === this.x) return;
    this.facing = x > this.x ? 1 : -1;
  }

  changeState(next: FighterState): void {
    this.current = next;
    this.stateTime = 0;
    this.blockstunUntil = 0;
    next.enter(this);
  }

  // ------------------------------------------------------------------
  // Golpes
  // ------------------------------------------------------------------

  /**
   * Recibe un golpe que conectó. fromX: de dónde vino (lo empuja hacia el otro lado).
   * Con la vida en 0 pasa a KO; si no, queda aturdido.
   */
  receiveHit(damage: number, fromX: number): void {
    if (!this.vulnerable) return;
    this.hp = Math.max(0, this.hp - damage);
    const dir: -1 | 1 = this.x >= fromX ? 1 : -1;
    const { hitstun, knockback } = this.rules.config;
    this.changeState(this.hp === 0 ? new KoState(dir, knockback * 1.4) : new HitState(hitstun, dir, knockback));
  }

  /** Bloqueó un golpe: se queda bloqueando, un poco empujado. */
  receiveBlock(fromX: number): void {
    if (!(this.current instanceof BlockState)) return;
    const dir: -1 | 1 = this.x >= fromX ? 1 : -1;
    this.vx = dir * this.rules.config.knockback * 0.5;
    this.blockstunUntil = this.stateTime + this.rules.config.blockstun;
  }

  /** Marca el golpe en curso como "ya tocó" (conectó o lo bloquearon). */
  markConnected(): void {
    const a = this.attack;
    if (a) a.connected = true;
  }

  signal(s: FighterSignal): void { this.signals.push(s); }

  drainSignals(): FighterSignal[] { return this.signals.splice(0); }

  // ------------------------------------------------------------------
  // Rounds
  // ------------------------------------------------------------------

  /** Vuelve a su lado, con la vida llena y quieto. */
  resetForRound(): void {
    this.hp = this.rules.config.maxHealth;
    this.x = this.arena.spawnX(this.side);
    this.y = this.arena.floorY;
    this.vx = 0;
    this.vy = 0;
    this.facing = this.side === "left" ? 1 : -1;
    this.signals.length = 0;
    this.buffer.clear();
    this.changeState(new IdleState());
  }
}
