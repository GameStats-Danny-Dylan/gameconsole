/**
 * EffectsSystem — el estado de la presentación que cambia con el tiempo y que
 * no es parte de la pelea: el reloj de las animaciones, la estela de daño de
 * las barras de vida, el aterrizaje y el festejo de cada luchador, las
 * partículas (chispas, esquirlas, polvo), la cámara (sacudida y zoom), el
 * contador de combo y el destello del KO.
 *
 * Facade: el controlador solo le avisa de los impactos (onImpact) y lo avanza
 * (update); la vista solo lo lee. Es lógica pura (sin canvas) y nunca cambia
 * la pelea. Lo avanza el mismo reloj que la pelea, así en la pausa todo queda
 * quieto.
 */
import type { Fighter } from "../domain/fighter/Fighter";
import type { FightingMatch, Impact } from "../domain/FightingMatch";
import { KO_FALL } from "../ui/pose/PoseAnimator";
import { CameraRig } from "./CameraRig";
import { ParticleSystem } from "./ParticleSystem";

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
  /** Distancia caminada desde la última nube de polvo. */
  stride: number;
  /** Ya levantó el polvo de la caída del KO. */
  koDust: boolean;
}

/** El contador de combo de un lado. */
export interface ComboFx {
  hits: number;
  damage: number;
  /** Segundos desde el último golpe del combo. */
  age: number;
  color: string;
}

/** Segundos que la estela de daño espera quieta antes de bajar. */
export const TRAIL_HOLD = 0.45;
/** Lo que baja la estela por segundo (fracción de la barra). */
export const TRAIL_SPEED = 0.6;
/** Segundos que dura la flexión de rodillas al aterrizar. */
export const LANDING_TIME = 0.16;
/** Segundos que se ve el contador de combo después del último golpe. */
export const COMBO_SHOW = 1.3;
/** Segundos del destello de pantalla del KO. */
export const KO_FLASH = 0.16;

/** Sacudida de pantalla (px, segundos) por tipo de golpe. */
export const SHAKE = {
  blocked: [1.5, 0.08],
  punch: [2.5, 0.12],
  kick: [6, 0.22],
  ko: [13, 0.5],
  koLanding: [5, 0.2],
} as const;

const ACCENTS = ["#ff5a36", "#34c8f0"];
const DUST = "#d8c3a2";

/** Generador con semilla: las mismas chispas en cada corrida (pruebas). */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class EffectsSystem {
  /** Reloj de la presentación (segundos). */
  clock = 0;
  readonly particles = new ParticleSystem();
  readonly camera = new CameraRig();
  /** Contador de combo por slot (0: izquierda, 1: derecha). */
  readonly combos: [ComboFx | null, ComboFx | null] = [null, null];
  /** Destello blanco de pantalla (segundos que le quedan). */
  flash = 0;
  private readonly fighters = new Map<string, FighterFx>();
  private readonly chainDamage: [number, number] = [0, 0];
  private readonly rand: () => number;
  private round = 0;

  constructor(seed = 1) {
    this.rand = rng(seed);
  }

  // ------------------------------------------------------------------
  // Impactos (los avisa la pelea en el cuadro en que un golpe toca)
  // ------------------------------------------------------------------

  onImpact(i: Impact): void {
    const dir = i.attacker.facing;
    const accent = ACCENTS[i.attacker.slot - 1] ?? "#ffffff";
    if (i.kind === "blocked") {
      this.burst(i.x, i.y, -dir, 10, ["#e8fbff", "#8fe3ff", "#5ab8ff"], "shard", 160, 380, 0.14, 0.26);
      this.particles.spawn({ kind: "flash", x: i.x, y: i.y, vx: 0, vy: 0, life: 0.1, size: 30, grow: 80, color: "#bff1ff", gravity: 0, drag: 0 });
      this.ring(i.x, i.y, 5, 220, "#9fe6ff", 0.16);
      this.camera.shake(...SHAKE.blocked);
      return;
    }
    const heavy = i.move === "kick" || i.ko;
    const n = i.ko ? 26 : heavy ? 15 : 10;
    this.burst(i.x, i.y, dir, n, ["#ffffff", "#fff3a8", "#ffc83d", accent], "spark", 280, i.ko ? 820 : 620, 0.14, i.ko ? 0.42 : 0.3);
    this.ring(i.x, i.y, 6, heavy ? 360 : 250, "#ffffff", i.ko ? 0.26 : 0.18);
    this.particles.spawn({ kind: "flash", x: i.x, y: i.y, vx: 0, vy: 0, life: 0.12, size: heavy ? 52 : 36, grow: 140, color: "#fff6d0", gravity: 0, drag: 0 });
    this.particles.spawn({ kind: "star", x: i.x, y: i.y, vx: 0, vy: 0, life: i.ko ? 0.16 : 0.1, size: i.ko ? 46 : heavy ? 36 : 26, grow: 90, color: "#fffbe6", gravity: 0, drag: 0 });
    const [amp, secs] = i.ko ? SHAKE.ko : heavy ? SHAKE.kick : SHAKE.punch;
    this.camera.shake(amp, secs);
    if (i.ko) this.flash = KO_FLASH;

    // El contador aparece desde el segundo golpe de la cadena (igual que el COMBO del contrato).
    const slot = i.attacker.slot === 1 ? 0 : 1;
    this.chainDamage[slot] = (i.chain >= 2 ? this.chainDamage[slot] : 0) + i.damage;
    if (i.chain >= 2) this.combos[slot] = { hits: i.chain, damage: this.chainDamage[slot], age: 0, color: accent };
  }

  // ------------------------------------------------------------------
  // Paso
  // ------------------------------------------------------------------

  /** Avanza dt segundos mirando la pelea (solo la lee). */
  update(dt: number, match: FightingMatch): void {
    if (dt <= 0) return;
    this.clock += dt;
    if (match.currentRound.number !== this.round) {
      // Round nuevo: la cámara y los efectos vuelven a cero.
      this.round = match.currentRound.number;
      this.camera.reset();
      this.particles.clear();
      this.combos[0] = this.combos[1] = null;
      this.chainDamage[0] = this.chainDamage[1] = 0;
    }
    this.particles.update(dt);
    this.camera.update(dt);
    this.flash = Math.max(0, this.flash - dt);
    for (const [k, c] of this.combos.entries()) {
      if (!c) continue;
      c.age += dt;
      if (c.age > COMBO_SHOW) this.combos[k] = null;
    }

    const round = match.currentRound;
    const winner = round.phase === "over" && round.result?.kind === "won" ? round.result.winner : null;
    for (const f of match.fighters) {
      const s = this.track(f);
      this.updateTrail(s, f, dt);
      const landed = f.grounded && !s.wasGrounded;
      if (landed && f.stateName !== "ko") {
        s.landing = 1;
        this.dust(f.x, f.arena.floorY, 9, 170);
      } else s.landing = Math.max(0, s.landing - dt / LANDING_TIME);
      s.wasGrounded = f.grounded;
      this.walkDust(s, f, dt);
      this.koDust(s, f);
      const celebrating = winner === f.playerId && round.elapsedInPhase > 0.5;
      s.victory = celebrating ? Math.min(1, s.victory + dt / 0.35) : Math.max(0, s.victory - dt / 0.2);
    }
  }

  /** Lo de un luchador (se crea la primera vez). */
  of(f: Fighter): Readonly<FighterFx> {
    return this.track(f);
  }

  /** Si queda algún efecto en curso. */
  get busy(): boolean {
    return this.particles.count > 0 || this.camera.shaking || this.flash > 0 || this.combos.some((c) => c !== null);
  }

  // ------------------------------------------------------------------

  private track(f: Fighter): FighterFx {
    let s = this.fighters.get(f.playerId);
    if (!s) {
      const r = f.health / f.maxHealth;
      s = { trail: r, trailHold: 0, landing: 0, victory: 0, wasGrounded: f.grounded, lastRatio: r, stride: 0, koDust: false };
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

  /** Polvo de los pasos: una nube cada tanto camino recorrido. */
  private walkDust(s: FighterFx, f: Fighter, dt: number): void {
    if (f.stateName !== "walk" || !f.grounded || Math.abs(f.vx) < 60) { s.stride = 0; return; }
    s.stride += Math.abs(f.vx) * dt;
    if (s.stride < 38) return;
    s.stride = 0;
    const back = -Math.sign(f.vx);
    this.particles.spawn({
      kind: "dust", x: f.x + back * 12, y: f.arena.floorY - 3,
      vx: back * (25 + this.rand() * 35), vy: -(15 + this.rand() * 30),
      life: 0.42 + this.rand() * 0.15, size: 3.5 + this.rand() * 2, grow: 14, color: DUST, gravity: -8, drag: 2.5,
    });
  }

  /** La caída del KO levanta polvo y sacude un poco al tocar el piso. */
  private koDust(s: FighterFx, f: Fighter): void {
    if (f.stateName !== "ko") { s.koDust = false; return; }
    if (s.koDust || f.stateTime < KO_FALL || !f.grounded) return;
    s.koDust = true;
    this.dust(f.x - f.facing * 60, f.arena.floorY, 14, 220);
    this.camera.shake(...SHAKE.koLanding);
  }

  private dust(x: number, floor: number, n: number, speed: number): void {
    for (let k = 0; k < n; k++) {
      const side = k % 2 ? 1 : -1;
      this.particles.spawn({
        kind: "dust", x: x + side * (6 + this.rand() * 18), y: floor - 2,
        vx: side * speed * (0.3 + this.rand() * 0.7), vy: -(20 + this.rand() * 60),
        life: 0.45 + this.rand() * 0.25, size: 4 + this.rand() * 3, grow: 18, color: DUST, gravity: -6, drag: 3.5,
      });
    }
  }

  private burst(x: number, y: number, dir: number, n: number, colors: string[], kind: "spark" | "shard",
                vMin: number, vMax: number, lifeMin: number, lifeMax: number): void {
    for (let k = 0; k < n; k++) {
      // Hacia donde va el golpe, abiertas en abanico.
      const a = (this.rand() - 0.5) * 2.1 + (this.rand() < 0.15 ? Math.PI : 0);
      const v = vMin + this.rand() * (vMax - vMin);
      this.particles.spawn({
        kind, x, y,
        vx: Math.cos(a) * v * dir, vy: Math.sin(a) * v - 60,
        life: lifeMin + this.rand() * (lifeMax - lifeMin),
        size: kind === "spark" ? 2.4 + this.rand() * 2.4 : 2.5 + this.rand() * 2.5,
        grow: 0, color: colors[Math.floor(this.rand() * colors.length)], gravity: 900, drag: 5,
      });
    }
  }

  private ring(x: number, y: number, size: number, grow: number, color: string, life: number): void {
    this.particles.spawn({ kind: "ring", x, y, vx: 0, vy: 0, life, size, grow, color, gravity: 0, drag: 0 });
  }
}
