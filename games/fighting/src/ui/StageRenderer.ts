/**
 * StageRenderer — el escenario por capas: cielo con degradado (atardecer en el
 * tema claro, noche en el oscuro), montañas lejanas, el patio del dojo con
 * pinos, cerco y faroles, y el piso de madera con su iluminación.
 *
 * Las capas fijas se dibujan una sola vez en canvas aparte (y se vuelven a
 * hacer si cambia el tema o la resolución); en cada cuadro solo se copian con
 * un corrimiento distinto por capa (parallax suave según dónde están los
 * luchadores) y se agregan los detalles que se mueven: neblina, luciérnagas,
 * el titilar de los faroles y la luz del piso bajo cada luchador.
 */
import type { Fighter } from "../domain/fighter/Fighter";
import { withAlpha } from "./color";

type Ctx = CanvasRenderingContext2D;
export type Theme = "light" | "dark";
export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

const W = 960;
const H = 540;
/** Margen de las capas (para el parallax y la sacudida de pantalla). */
const PAD_X = 64;
const PAD_Y = 32;
const FLOOR = 470;

interface Palette {
  sky: [string, string, string, string];
  stars: number;
  orb: { x: number; y: number; r: number; color: string; glow: string };
  far: string; near: string; mist: string;
  hall: string; hallDark: string; roof: string; window: string; windowGlow: string;
  pine: string; fence: string; ground: string;
  lantern: string; lanternGlow: string;
  floorTop: string; floorBottom: string; plank: string; seam: string; edge: string;
  firefly: string;
  vignette: number;
}

const PALETTES: Record<Theme, Palette> = {
  // Atardecer.
  light: {
    sky: ["#3f3f93", "#a2588f", "#f4876a", "#ffcf8a"],
    stars: 0,
    orb: { x: 690, y: 330, r: 64, color: "#fff2c4", glow: "#ffd28a" },
    far: "#8e5d9a", near: "#62437f", mist: "#ffd3b0",
    hall: "#3b2747", hallDark: "#2b1c36", roof: "#24172f", window: "#ffd27c", windowGlow: "#ffb35a",
    pine: "#2c2040", fence: "#2a1d33", ground: "#3a2840",
    lantern: "#3a2a44", lanternGlow: "#ffbf6a",
    floorTop: "#c48d5c", floorBottom: "#6d4529", plank: "#a87449", seam: "#4a2c18", edge: "#ffd9a6",
    firefly: "#fff1b8",
    vignette: 0.35,
  },
  // Noche.
  dark: {
    sky: ["#060a1c", "#141c45", "#33295c", "#5b3f6e"],
    stars: 140,
    orb: { x: 740, y: 112, r: 30, color: "#f4eed6", glow: "#a9b8ff" },
    far: "#1d2349", near: "#151a36", mist: "#9aa6e0",
    hall: "#121631", hallDark: "#0c0f24", roof: "#090b1b", window: "#ffb35c", windowGlow: "#ff9a3c",
    pine: "#0b1024", fence: "#0d1023", ground: "#11152c",
    lantern: "#151a33", lanternGlow: "#ffa64d",
    floorTop: "#6a4a33", floorBottom: "#24170f", plank: "#58392a", seam: "#1c110a", edge: "#ffc38a",
    firefly: "#c9ff9e",
    vignette: 0.5,
  },
};

interface Layer { canvas: HTMLCanvasElement; parallax: number }

/** Generador con semilla (las estrellas y las vetas salen iguales siempre). */
function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class StageRenderer {
  private layers: Layer[] = [];
  private vignette: HTMLCanvasElement | null = null;
  private builtFor = "";

  constructor(private readonly makeCanvas: CanvasFactory) {}

  /**
   * Fondo y piso. focusX: centro de los luchadores (para el parallax).
   * res: píxeles reales por unidad lógica (las capas se dibujan a esa resolución).
   */
  drawBackground(c: Ctx, theme: Theme, res: number, clock: number, focusX: number, fighters: readonly Fighter[]): void {
    this.ensure(theme, res);
    const p = PALETTES[theme];
    const pan = Math.max(-1, Math.min(1, (focusX - W / 2) / (W / 2)));
    for (const [i, layer] of this.layers.entries()) {
      const dx = -pan * layer.parallax * PAD_X;
      c.drawImage(layer.canvas, -PAD_X + dx, -PAD_Y, W + 2 * PAD_X, H + 2 * PAD_Y);
      if (i === 1) this.drawMist(c, p, clock, dx);
      if (i === 2) this.drawLights(c, p, clock, dx);
    }
    this.drawFloorLights(c, p, fighters);
    this.drawFireflies(c, p, clock);
  }

  /** Viñeta (oscurece los bordes). Va encima de todo lo del mundo, debajo del marcador. */
  drawVignette(c: Ctx): void {
    if (this.vignette) c.drawImage(this.vignette, 0, 0, W, H);
  }

  // ------------------------------------------------------------------
  // Capas fijas
  // ------------------------------------------------------------------

  private ensure(theme: Theme, res: number): void {
    const r = Math.max(1, Math.min(3, Math.round(res * 4) / 4));
    const key = `${theme}@${r}`;
    if (key === this.builtFor) return;
    this.builtFor = key;
    const p = PALETTES[theme];
    const make = (paint: (c: Ctx) => void, parallax: number): Layer => {
      const canvas = this.makeCanvas(Math.ceil((W + 2 * PAD_X) * r), Math.ceil((H + 2 * PAD_Y) * r));
      const c = canvas.getContext("2d")!;
      c.setTransform(r, 0, 0, r, PAD_X * r, PAD_Y * r);
      paint(c);
      return { canvas, parallax };
    };
    this.layers = [
      make((c) => this.paintSky(c, p), 0.0),
      make((c) => this.paintMountains(c, p), 0.12),
      make((c) => this.paintCourtyard(c, p), 0.32),
      make((c) => this.paintFloor(c, p), 0),
    ];
    const v = this.makeCanvas(Math.ceil(W * r), Math.ceil(H * r));
    const vc = v.getContext("2d")!;
    vc.setTransform(r, 0, 0, r, 0, 0);
    const g = vc.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.72);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${p.vignette})`);
    vc.fillStyle = g;
    vc.fillRect(0, 0, W, H);
    this.vignette = v;
  }

  private paintSky(c: Ctx, p: Palette): void {
    const g = c.createLinearGradient(0, -PAD_Y, 0, FLOOR);
    g.addColorStop(0, p.sky[0]);
    g.addColorStop(0.45, p.sky[1]);
    g.addColorStop(0.78, p.sky[2]);
    g.addColorStop(1, p.sky[3]);
    c.fillStyle = g;
    c.fillRect(-PAD_X, -PAD_Y, W + 2 * PAD_X, H + 2 * PAD_Y);

    const rand = rng(7);
    for (let i = 0; i < p.stars; i++) {
      const x = -PAD_X + rand() * (W + 2 * PAD_X), y = -PAD_Y + rand() * 300;
      c.fillStyle = withAlpha("#ffffff", 0.25 + rand() * 0.6 * (1 - y / 320));
      c.fillRect(x, y, rand() < 0.1 ? 2 : 1.2, rand() < 0.1 ? 2 : 1.2);
    }

    const o = p.orb;
    const glow = c.createRadialGradient(o.x, o.y, o.r * 0.6, o.x, o.y, o.r * 4.5);
    glow.addColorStop(0, withAlpha(o.glow, 0.55));
    glow.addColorStop(1, withAlpha(o.glow, 0));
    c.fillStyle = glow;
    c.beginPath();
    c.arc(o.x, o.y, o.r * 4.5, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = o.color;
    c.beginPath();
    c.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    c.fill();
    if (p.stars > 0) {
      // Manchas de la luna.
      c.fillStyle = withAlpha("#c9c2a8", 0.45);
      for (const [dx, dy, r] of [[-9, -6, 6], [8, 7, 4.5], [4, -12, 3], [-4, 12, 3.5]])
        { c.beginPath(); c.arc(o.x + dx, o.y + dy, r, 0, Math.PI * 2); c.fill(); }
    }

    // Nubes largas.
    c.fillStyle = withAlpha(p.stars ? "#8d93c9" : "#ffe1c4", p.stars ? 0.08 : 0.28);
    for (const [x, y, w, h] of [[120, 150, 320, 14], [520, 95, 260, 10], [610, 230, 380, 16], [-40, 260, 300, 12]]) {
      c.beginPath();
      c.ellipse(x + w / 2, y, w / 2, h, 0, 0, Math.PI * 2);
      c.fill();
    }
  }

  private paintMountains(c: Ctx, p: Palette): void {
    const ridge = (base: number, amp: number, seed: number, color: string) => {
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(-PAD_X, FLOOR);
      for (let x = -PAD_X; x <= W + PAD_X; x += 8) {
        const t = x * 0.006 + seed;
        const y = base - amp * (0.55 * Math.sin(t) + 0.3 * Math.sin(t * 2.3 + 1.7) + 0.15 * Math.sin(t * 5.1 + seed));
        c.lineTo(x, y);
      }
      c.lineTo(W + PAD_X, FLOOR);
      c.closePath();
      c.fill();
    };
    ridge(300, 70, 1.3, p.far);
    // Neblina entre las dos cordilleras.
    const g = c.createLinearGradient(0, 300, 0, 420);
    g.addColorStop(0, withAlpha(p.mist, 0));
    g.addColorStop(1, withAlpha(p.mist, 0.18));
    c.fillStyle = g;
    c.fillRect(-PAD_X, 300, W + 2 * PAD_X, 120);
    ridge(372, 45, 4.1, p.near);
  }

  private paintCourtyard(c: Ctx, p: Palette): void {
    // Suelo de atrás.
    c.fillStyle = p.ground;
    c.fillRect(-PAD_X, 438, W + 2 * PAD_X, FLOOR - 438);

    for (const [x, h, s] of [[118, 236, 1], [196, 170, 2], [796, 246, 3], [872, 176, 4], [-30, 190, 5], [1000, 200, 6]])
      this.pine(c, x, 442, h, p.pine, s);
    this.hall(c, p);
    this.fence(c, p);
    for (const x of [250, 710]) this.stoneLantern(c, x, p);
  }

  private pine(c: Ctx, x: number, base: number, h: number, color: string, seed: number): void {
    const rand = rng(seed * 31);
    c.fillStyle = color;
    c.fillRect(x - 4, base - h * 0.35, 8, h * 0.35);
    const tiers = 5;
    for (let i = 0; i < tiers; i++) {
      const t = i / tiers;
      const y = base - h * (0.22 + t * 0.72);
      const w = (1 - t * 0.75) * h * 0.36;
      c.beginPath();
      c.moveTo(x - w, y + h * 0.16);
      for (let k = 0; k <= 6; k++) {
        const kx = x - w + (2 * w * k) / 6;
        c.lineTo(kx, y + h * 0.16 + (k % 2 ? -4 - rand() * 4 : 0));
      }
      c.lineTo(x + w, y + h * 0.16);
      c.lineTo(x + (rand() - 0.5) * 6, y - h * 0.08);
      c.closePath();
      c.fill();
    }
  }

  private hall(c: Ctx, p: Palette): void {
    // Plataforma y cuerpo.
    c.fillStyle = p.hallDark;
    c.fillRect(322, 438, 316, 32);
    c.fillStyle = p.hall;
    c.fillRect(348, 352, 264, 88);
    // Ventanas de papel iluminadas, con su enrejado.
    for (const [x0, door] of [[360, false], [424, false], [488, true], [552, false]] as const) {
      const w = 50;
      if (door) {
        c.fillStyle = p.hallDark;
        c.fillRect(x0, 372, w, 66);
        c.fillStyle = withAlpha(p.window, 0.28);
        c.fillRect(x0 + 4, 376, w - 8, 60);
        continue;
      }
      const g = c.createLinearGradient(0, 376, 0, 428);
      g.addColorStop(0, withAlpha(p.window, 0.95));
      g.addColorStop(1, withAlpha(p.windowGlow, 0.75));
      c.fillStyle = g;
      c.fillRect(x0, 376, w, 52);
      c.fillStyle = withAlpha(p.hallDark, 0.85);
      for (let k = 1; k < 4; k++) c.fillRect(x0 + (w * k) / 4 - 1, 376, 2, 52);
      for (let k = 1; k < 3; k++) c.fillRect(x0, 376 + (52 * k) / 3 - 1, w, 2);
    }
    // Columnas.
    c.fillStyle = p.hallDark;
    for (const x of [344, 412, 476, 540, 608]) c.fillRect(x, 352, 10, 88);
    // Techo con aleros curvos.
    c.fillStyle = p.roof;
    c.beginPath();
    c.moveTo(292, 336);
    c.quadraticCurveTo(318, 352, 350, 350);
    c.lineTo(610, 350);
    c.quadraticCurveTo(642, 352, 668, 336);
    c.lineTo(572, 292);
    c.lineTo(388, 292);
    c.closePath();
    c.fill();
    c.fillRect(382, 284, 196, 10);
    // Segundo piso, más chico.
    c.fillStyle = p.hall;
    c.fillRect(420, 262, 120, 26);
    c.fillStyle = withAlpha(p.window, 0.8);
    for (let k = 0; k < 3; k++) c.fillRect(432 + k * 34, 268, 26, 14);
    c.fillStyle = p.roof;
    c.beginPath();
    c.moveTo(398, 268);
    c.quadraticCurveTo(414, 276, 428, 274);
    c.lineTo(532, 274);
    c.quadraticCurveTo(546, 276, 562, 268);
    c.lineTo(520, 238);
    c.lineTo(440, 238);
    c.closePath();
    c.fill();
    c.fillRect(434, 232, 92, 7);
  }

  private fence(c: Ctx, p: Palette): void {
    c.fillStyle = p.fence;
    c.fillRect(-PAD_X, 426, W + 2 * PAD_X, 5);
    c.fillRect(-PAD_X, 446, W + 2 * PAD_X, 4);
    for (let x = -PAD_X + 10; x < W + PAD_X; x += 58) {
      if (x > 320 && x < 640) continue; // delante del dojo, abierto
      c.fillRect(x, 418, 8, 52);
      c.fillRect(x - 2, 416, 12, 4);
    }
  }

  private stoneLantern(c: Ctx, x: number, p: Palette): void {
    c.fillStyle = p.lantern;
    c.fillRect(x - 13, 458, 26, 12);
    c.fillRect(x - 5, 432, 10, 26);
    c.fillRect(x - 12, 426, 24, 6);
    c.fillRect(x - 10, 406, 20, 20);
    c.fillStyle = withAlpha(p.lanternGlow, 0.9);
    c.fillRect(x - 6, 410, 12, 12);
    c.fillStyle = p.lantern;
    c.beginPath();
    c.moveTo(x - 19, 407);
    c.lineTo(x, 393);
    c.lineTo(x + 19, 407);
    c.closePath();
    c.fill();
  }

  private paintFloor(c: Ctx, p: Palette): void {
    const bottom = H + PAD_Y;
    const g = c.createLinearGradient(0, FLOOR, 0, bottom);
    g.addColorStop(0, p.floorTop);
    g.addColorStop(1, p.floorBottom);
    c.fillStyle = g;
    c.fillRect(-PAD_X, FLOOR, W + 2 * PAD_X, bottom - FLOOR);

    // Tablas en perspectiva: las juntas van hacia un punto de fuga detrás del dojo.
    const vx = W / 2, vy = FLOOR - 520;
    const spread = (bottom - vy) / (FLOOR - vy);
    const rand = rng(99);
    const step = 52;
    for (let xt = -PAD_X - step * 2; xt < W + PAD_X + step * 2; xt += step) {
      const xb = vx + (xt - vx) * spread, xb2 = vx + (xt + step - vx) * spread;
      c.fillStyle = withAlpha(rand() < 0.5 ? "#000000" : p.plank, 0.05 + rand() * 0.12);
      c.beginPath();
      c.moveTo(xt, FLOOR);
      c.lineTo(xt + step, FLOOR);
      c.lineTo(xb2, bottom);
      c.lineTo(xb, bottom);
      c.closePath();
      c.fill();
      c.strokeStyle = withAlpha(p.seam, 0.55);
      c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(xt, FLOOR);
      c.lineTo(xb, bottom);
      c.stroke();
      // Cortes entre tablas, escalonados.
      const cut = FLOOR + 14 + rand() * (bottom - FLOOR - 28);
      const k = (cut - vy) / (FLOOR - vy);
      c.beginPath();
      c.moveTo(vx + (xt - vx) * k, cut);
      c.lineTo(vx + (xt + step - vx) * k, cut);
      c.stroke();
    }
    // Brillo del piso y borde iluminado.
    const sheen = c.createRadialGradient(W / 2, FLOOR + 8, 20, W / 2, FLOOR + 8, W * 0.6);
    sheen.addColorStop(0, withAlpha(p.edge, 0.2));
    sheen.addColorStop(1, withAlpha(p.edge, 0));
    c.fillStyle = sheen;
    c.fillRect(-PAD_X, FLOOR, W + 2 * PAD_X, bottom - FLOOR);
    c.fillStyle = withAlpha("#000000", 0.35);
    c.fillRect(-PAD_X, FLOOR - 3, W + 2 * PAD_X, 3);
    c.fillStyle = withAlpha(p.edge, 0.55);
    c.fillRect(-PAD_X, FLOOR, W + 2 * PAD_X, 2);
  }

  // ------------------------------------------------------------------
  // Detalles que se mueven
  // ------------------------------------------------------------------

  private drawMist(c: Ctx, p: Palette, clock: number, dx: number): void {
    for (let i = 0; i < 3; i++) {
      const span = W + 700;
      const x = ((clock * (9 + i * 4) + i * 420) % span) - 350 + dx;
      const y = 392 + i * 14;
      const g = c.createRadialGradient(x, y, 10, x, y, 280);
      g.addColorStop(0, withAlpha(p.mist, 0.16));
      g.addColorStop(1, withAlpha(p.mist, 0));
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(x, y, 280, 34, 0, 0, Math.PI * 2);
      c.fill();
    }
  }

  private drawLights(c: Ctx, p: Palette, clock: number, dx: number): void {
    c.save();
    c.globalCompositeOperation = "lighter";
    for (const [i, x] of [250, 710].entries()) {
      const flicker = 0.75 + 0.12 * Math.sin(clock * 7.3 + i * 2) + 0.08 * Math.sin(clock * 13.1 + i);
      const g = c.createRadialGradient(x + dx, 416, 2, x + dx, 416, 70);
      g.addColorStop(0, withAlpha(p.lanternGlow, 0.5 * flicker));
      g.addColorStop(1, withAlpha(p.lanternGlow, 0));
      c.fillStyle = g;
      c.fillRect(x + dx - 70, 346, 140, 140);
    }
    // Resplandor de las ventanas del dojo.
    const g = c.createRadialGradient(480 + dx, 405, 30, 480 + dx, 405, 230);
    g.addColorStop(0, withAlpha(p.windowGlow, 0.16 + 0.02 * Math.sin(clock * 2.1)));
    g.addColorStop(1, withAlpha(p.windowGlow, 0));
    c.fillStyle = g;
    c.fillRect(250 + dx, 280, 460, 200);
    c.restore();
  }

  /** Un charco de luz en el piso bajo cada luchador. */
  private drawFloorLights(c: Ctx, p: Palette, fighters: readonly Fighter[]): void {
    c.save();
    c.globalCompositeOperation = "lighter";
    for (const f of fighters) {
      const g = c.createRadialGradient(f.x, FLOOR + 14, 4, f.x, FLOOR + 14, 120);
      g.addColorStop(0, withAlpha(p.edge, 0.13));
      g.addColorStop(1, withAlpha(p.edge, 0));
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(f.x, FLOOR + 14, 120, 34, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  private drawFireflies(c: Ctx, p: Palette, clock: number): void {
    c.save();
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 14; i++) {
      const x = ((i * 173.7 + clock * (6 + (i % 5) * 3)) % (W + 40)) - 20;
      const y = 250 + (i % 7) * 26 + Math.sin(clock * 0.9 + i * 1.7) * 16;
      const a = 0.25 + 0.35 * Math.max(0, Math.sin(clock * (1.3 + (i % 3) * 0.4) + i));
      c.fillStyle = withAlpha(p.firefly, a);
      c.beginPath();
      c.arc(x, y, 1.6 + (i % 3) * 0.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = withAlpha(p.firefly, a * 0.18);
      c.beginPath();
      c.arc(x, y, 6, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
}
