/**
 * EffectsRenderer — dibuja lo que lleva EffectsSystem: las partículas (en el
 * mundo, con la cámara), el destello de pantalla del KO y el contador de combo
 * (en la pantalla, como parte del marcador). Solo lee.
 */
import type { EffectsSystem } from "../fx/EffectsSystem";
import { COMBO_SHOW, KO_FLASH } from "../fx/EffectsSystem";
import type { Particle } from "../fx/ParticleSystem";
import { shade, withAlpha } from "./color";

type Ctx = CanvasRenderingContext2D;

const W = 960;
const H = 540;
const FONT = "'Segoe UI', system-ui, -apple-system, Roboto, sans-serif";

export class EffectsRenderer {
  /** Partículas, en coordenadas del mundo. El polvo va normal; lo que brilla, sumando luz. */
  drawParticles(c: Ctx, fx: EffectsSystem): void {
    const items = fx.particles.items;
    if (!items.length) return;
    for (const p of items) if (p.kind === "dust") this.dust(c, p);
    c.save();
    c.globalCompositeOperation = "lighter";
    c.lineCap = "round";
    for (const p of items) {
      const t = p.age / p.life;
      switch (p.kind) {
        case "spark": this.spark(c, p, t); break;
        case "shard": this.shard(c, p, t); break;
        case "ring": this.ring(c, p, t); break;
        case "flash": this.glow(c, p, t); break;
        case "star": this.star(c, p, t); break;
      }
    }
    c.restore();
  }

  /** Destello blanco de toda la pantalla en el KO. */
  drawScreenFlash(c: Ctx, fx: EffectsSystem): void {
    if (fx.flash <= 0) return;
    c.fillStyle = withAlpha("#ffffff", 0.55 * (fx.flash / KO_FLASH));
    c.fillRect(0, 0, W, H);
  }

  /** "N GOLPES" del lado de quien hace el combo, con un salto en cada golpe. */
  drawCombos(c: Ctx, fx: EffectsSystem): void {
    fx.combos.forEach((combo, slot) => {
      if (!combo) return;
      const left = slot === 0;
      const pop = 1 + 0.45 * Math.max(0, 1 - combo.age / 0.12);
      const alpha = Math.min(1, (COMBO_SHOW - combo.age) / 0.3);
      const x = left ? 34 : W - 34;
      const y = 176;
      c.save();
      c.globalAlpha = Math.max(0, alpha);
      c.translate(x, y);
      c.scale(pop, pop);
      c.textAlign = left ? "left" : "right";
      c.textBaseline = "alphabetic";
      c.lineJoin = "round";
      const num = String(combo.hits);
      c.font = `italic 900 62px ${FONT}`;
      c.lineWidth = 9;
      c.strokeStyle = "#0b0610";
      c.strokeText(num, 0, 0);
      const g = c.createLinearGradient(0, -48, 0, 0);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(1, combo.color);
      c.fillStyle = g;
      c.fillText(num, 0, 0);
      const w = c.measureText(num).width;
      c.font = `italic 900 22px ${FONT}`;
      c.lineWidth = 6;
      const label = "GOLPES";
      const lx = left ? w + 8 : -w - 8;
      c.strokeText(label, lx, -10);
      c.fillStyle = shade(combo.color, 0.35);
      c.fillText(label, lx, -10);
      c.font = `italic 800 14px ${FONT}`;
      c.lineWidth = 4;
      const dmg = `${combo.damage} de daño`;
      c.strokeText(dmg, 0, 22);
      c.fillStyle = "#ffffff";
      c.fillText(dmg, 0, 22);
      c.restore();
    });
  }

  // ------------------------------------------------------------------

  private spark(c: Ctx, p: Particle, t: number): void {
    // Una raya en la dirección en que vuela (más larga cuanto más rápida).
    const len = 0.032;
    c.strokeStyle = withAlpha(p.color, 1 - t);
    c.lineWidth = p.size * (1 - t * 0.6);
    c.beginPath();
    c.moveTo(p.x, p.y);
    c.lineTo(p.x - p.vx * len, p.y - p.vy * len);
    c.stroke();
  }

  private shard(c: Ctx, p: Particle, t: number): void {
    const a = Math.atan2(p.vy, p.vx);
    const s = p.size * (1 - t * 0.5);
    c.fillStyle = withAlpha(p.color, 1 - t);
    c.beginPath();
    c.moveTo(p.x + Math.cos(a) * s * 2.2, p.y + Math.sin(a) * s * 2.2);
    c.lineTo(p.x + Math.cos(a + 2.2) * s, p.y + Math.sin(a + 2.2) * s);
    c.lineTo(p.x + Math.cos(a - 2.2) * s, p.y + Math.sin(a - 2.2) * s);
    c.closePath();
    c.fill();
  }

  private ring(c: Ctx, p: Particle, t: number): void {
    c.strokeStyle = withAlpha(p.color, 0.9 * (1 - t));
    c.lineWidth = 4 * (1 - t) + 0.5;
    c.beginPath();
    c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    c.stroke();
  }

  private glow(c: Ctx, p: Particle, t: number): void {
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
    g.addColorStop(0, withAlpha(p.color, 0.95 * (1 - t)));
    g.addColorStop(1, withAlpha(p.color, 0));
    c.fillStyle = g;
    c.beginPath();
    c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    c.fill();
  }

  /** Estrella de impacto: ocho puntas finas que se abren y se apagan enseguida. */
  private star(c: Ctx, p: Particle, t: number): void {
    const r = p.size, inner = r * 0.22;
    const spin = p.x * 0.07; // cada impacto, un poco girado
    c.fillStyle = withAlpha(p.color, 1 - t * t);
    c.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = spin + (k * Math.PI) / 8;
      const rr = k % 2 ? inner : r * (k % 4 === 0 ? 1 : 0.62);
      c.lineTo(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
  }

  private dust(c: Ctx, p: Particle): void {
    const t = p.age / p.life;
    c.fillStyle = withAlpha(p.color, 0.38 * (1 - t) * Math.min(1, t * 6 + 0.3));
    c.beginPath();
    c.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    c.fill();
  }
}
