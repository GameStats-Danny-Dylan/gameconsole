/**
 * CanvasView — la vista de la pelea en un <canvas>. Coordina a los que dibujan
 * (cada uno con lo suyo): StageRenderer (escenario por capas), FighterRenderer
 * (los luchadores articulados), EffectsRenderer (chispas, polvo, combo) y
 * HudRenderer (marcador y carteles). El mundo se dibuja a través de la cámara
 * de los efectos (sacudida y zoom); el marcador queda fijo.
 *
 * Solo lee la pelea y los efectos; nunca los cambia. Dibuja en coordenadas
 * lógicas de la arena (960 × 540) y escala al tamaño real del canvas. El
 * escenario cambia con el tema (atardecer en claro, noche en oscuro).
 */
import type { Fighter } from "../domain/fighter/Fighter";
import type { FightingMatch } from "../domain/FightingMatch";
import { SLOT1_KEYS, SLOT2_KEYS, type KeyBindings } from "../input/ControlScheme";
import type { FightView, ViewModel } from "../game/ports";
import { EffectsRenderer } from "./EffectsRenderer";
import { FighterRenderer } from "./FighterRenderer";
import { HudRenderer } from "./HudRenderer";
import { lookOf } from "./looks";
import type { AnimContext } from "./pose/PoseAnimator";
import { StageRenderer, type Theme } from "./StageRenderer";

const W = 960;
const H = 540;

export class CanvasView implements FightView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly legend: HTMLElement;
  private readonly stage = new StageRenderer((w, h) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  });
  private readonly fighters = new FighterRenderer();
  private readonly hud = new HudRenderer();
  private readonly effects = new EffectsRenderer();
  private namesShown = false;
  private last: ViewModel | null = null;

  constructor(root: HTMLElement) {
    const wrap = document.createElement("div");
    wrap.className = "fight";
    const stage = document.createElement("div");
    stage.className = "fight-stage";
    this.canvas = document.createElement("canvas");
    this.canvas.className = "fight-canvas";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "Pelea");
    this.canvas.addEventListener("pointerdown", () => { window.focus(); this.canvas.focus(); });
    stage.append(this.canvas);
    this.legend = document.createElement("div");
    this.legend.className = "fight-legend";
    wrap.append(stage, this.legend);
    root.replaceChildren(wrap);

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("el navegador no puede dibujar en canvas");
    this.ctx = ctx;

    new MutationObserver(() => this.redraw())
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    new ResizeObserver(() => this.resize()).observe(stage);
    // El aviso de foco aparece y se va sin esperar un cuadro.
    window.addEventListener("focus", () => this.redraw());
    window.addEventListener("blur", () => this.redraw());
    this.resize();
  }

  render(vm: ViewModel): void {
    this.last = vm;
    if (!this.namesShown) this.renderLegend(vm.match);
    this.draw(vm);
  }

  private redraw(): void {
    if (this.last) this.draw(this.last);
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.redraw();
  }

  private renderLegend(match: FightingMatch): void {
    this.namesShown = true;
    const [a, b] = match.fighters;
    const sound = document.createElement("span");
    sound.className = "fight-sound";
    const m = document.createElement("kbd");
    m.textContent = "M";
    sound.append(m, " sonido");
    this.legend.replaceChildren(legendFor(a, SLOT1_KEYS), sound, legendFor(b, SLOT2_KEYS));
  }

  // ------------------------------------------------------------------
  // Dibujo
  // ------------------------------------------------------------------

  private draw(vm: ViewModel): void {
    const c = this.ctx;
    const sx = this.canvas.width / W, sy = this.canvas.height / H;
    c.setTransform(sx, 0, 0, sy, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "source-over";

    const m = vm.match;
    const fx = vm.fx;
    const clock = fx?.clock ?? 0;
    const theme: Theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const [a, b] = m.fighters;

    // El mundo, a través de la cámara (sacudida y zoom).
    c.save();
    const cam = fx?.camera;
    if (cam) {
      const z = cam.zoom;
      const fxX = clamp(cam.focusX, W / (2 * z), W - W / (2 * z));
      const fxY = clamp(cam.focusY, H / (2 * z), H - H / (2 * z));
      c.translate(W / 2 + cam.offsetX, H / 2 + cam.offsetY);
      c.scale(z, z);
      c.translate(-fxX, -fxY);
    }
    this.stage.drawBackground(c, theme, Math.max(sx, sy), clock, (a.x + b.x) / 2, m.fighters);
    const anim = (f: Fighter): AnimContext => ({
      clock,
      landing: fx?.of(f).landing ?? 0,
      victory: fx?.of(f).victory ?? 0,
    });
    for (const f of m.fighters) this.fighters.drawShadow(c, f, anim(f));
    // El que está en KO va detrás; si no, el que ataca va adelante.
    const order = [...m.fighters].sort((x, y) => depth(x) - depth(y));
    for (const f of order) this.fighters.draw(c, f, anim(f));
    if (fx) this.effects.drawParticles(c, fx);
    c.restore();
    this.stage.drawVignette(c);
    if (fx) this.effects.drawScreenFlash(c, fx);

    this.hud.draw(c, vm, fx);
    if (fx && vm.status !== "paused") this.effects.drawCombos(c, fx);
    this.hud.drawBanners(c, vm);
    if (vm.muted) this.hud.drawMuted(c);
    if (vm.status === "playing" && typeof document !== "undefined" && !document.hasFocus()) this.hud.drawFocusHint(c);
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Orden de dibujo: KO atrás, el que golpea adelante. */
function depth(f: Fighter): number {
  if (f.knockedOut) return 0;
  if (f.attack) return 2;
  return 1;
}

// ------------------------------------------------------------------
// Leyenda de controles (DOM, debajo del canvas)
// ------------------------------------------------------------------

const KEY_LABEL: Record<string, string> = {
  ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓",
};
const keyLabel = (code: string) => KEY_LABEL[code] ?? code.replace(/^Key/, "");

function legendFor(f: Fighter, k: KeyBindings): HTMLElement {
  const box = document.createElement("div");
  box.className = `fight-keys ${f.side}`;
  const who = document.createElement("strong");
  who.textContent = f.name;
  who.style.setProperty("--player", lookOf(f.character).accent);
  box.append(who);
  const items: [string[], string][] = [
    [[k.left, k.right], "caminar"],
    [[k.up], "saltar"],
    [[k.attack], "golpe"],
    [[k.down, k.attack], "patada"],
    [[k.block], "bloqueo"],
  ];
  for (const [codes, label] of items) {
    const item = document.createElement("span");
    codes.forEach((code, i) => {
      if (i > 0) item.append(codes.length === 2 && label === "patada" ? "+" : " ");
      const kbd = document.createElement("kbd");
      kbd.textContent = keyLabel(code);
      item.append(kbd);
    });
    item.append(` ${label}`);
    box.append(item);
  }
  return box;
}
