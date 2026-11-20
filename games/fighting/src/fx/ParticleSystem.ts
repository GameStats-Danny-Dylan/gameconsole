/**
 * ParticleSystem — chispas de impacto, esquirlas del bloqueo, anillos de
 * golpe y polvo al caminar y al aterrizar. Cada partícula vive un tiempo fijo
 * y desaparece; hay un tope para que el costo por cuadro no crezca.
 *
 * Es lógica pura: la vista las dibuja leyendo `items`.
 */
export type ParticleKind = "spark" | "shard" | "ring" | "dust" | "flash" | "star";

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Segundos de vida total y los que ya vivió. */
  life: number;
  age: number;
  size: number;
  /** Cuánto crece por segundo (polvo, anillos). */
  grow: number;
  color: string;
  gravity: number;
  /** Frenado del aire (1/s). */
  drag: number;
}

export const MAX_PARTICLES = 320;

export class ParticleSystem {
  readonly items: Particle[] = [];

  constructor(readonly max = MAX_PARTICLES) {}

  spawn(p: Omit<Particle, "age">): void {
    if (this.items.length >= this.max) this.items.shift(); // la más vieja deja lugar
    this.items.push({ ...p, age: 0 });
  }

  update(dt: number): void {
    if (dt <= 0) return;
    let w = 0;
    for (const p of this.items) {
      p.age += dt;
      if (p.age >= p.life) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy = p.vy * k + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      this.items[w++] = p;
    }
    this.items.length = w;
  }

  get count(): number { return this.items.length; }

  clear(): void { this.items.length = 0; }
}
