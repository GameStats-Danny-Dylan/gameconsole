/**
 * CanvasView — dibuja la pelea en un <canvas> con rectángulos (sin sprites):
 * la arena, los dos luchadores según su estado, las barras de vida, el tiempo
 * del round, el marcador de rounds y los carteles (Round N, ¡Pelea!, KO…).
 *
 * Solo lee la pelea; nunca la cambia. Dibuja en coordenadas lógicas de la
 * arena (960 × 540) y escala al tamaño real del canvas. Los colores salen del
 * tema (variables CSS) y se vuelven a leer cuando cambia.
 */
import type { Fighter } from "../domain/fighter/Fighter";
import type { FightingMatch } from "../domain/FightingMatch";
import type { RoundResult } from "../domain/Round";
import { SLOT1_KEYS, SLOT2_KEYS, type KeyBindings } from "../input/ControlScheme";
import type { FightView, ViewModel } from "../game/ports";

interface Palette {
  bg: string; surface: string; surface2: string; fg: string; muted: string;
  accent: string; line: string; danger: string; ok: string; floor: string; sky: string;
}

const W = 960;
const H = 540;

export class CanvasView implements FightView {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly legend: HTMLElement;
  private palette: Palette;
  private paletteDirty = false;
  /** Vida "fantasma" de cada barra: baja despacio detrás de la real. */
  private readonly trail = new Map<string, number>();
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
    this.palette = readPalette();

    new MutationObserver(() => { this.paletteDirty = true; this.redraw(); })
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

  // ------------------------------------------------------------------
  // Leyenda de controles (DOM, debajo del canvas)
  // ------------------------------------------------------------------

  private renderLegend(match: FightingMatch): void {
    this.namesShown = true;
    const [a, b] = match.fighters;
    this.legend.replaceChildren(legendFor(a, SLOT1_KEYS), legendFor(b, SLOT2_KEYS));
  }

  // ------------------------------------------------------------------
  // Dibujo
  // ------------------------------------------------------------------

  private draw(vm: ViewModel): void {
    if (this.paletteDirty) { this.palette = readPalette(); this.paletteDirty = false; }
    const c = this.ctx;
    const sx = this.canvas.width / W, sy = this.canvas.height / H;
    c.setTransform(sx, 0, 0, sy, 0, 0);
    c.clearRect(0, 0, W, H);

    const m = vm.match;
    this.drawArena(m);
    // El que está en KO se dibuja primero (queda detrás).
    const order = [...m.fighters].sort((x, y) => Number(y.knockedOut) - Number(x.knockedOut));
    for (const f of order) this.drawFighter(f);
    this.drawHud(m);
    this.drawBanner(vm);
    if (vm.status === "playing" && typeof document !== "undefined" && !document.hasFocus()) this.drawFocusHint();
  }

  private drawArena(m: FightingMatch): void {
    const c = this.ctx, p = this.palette, floor = m.arena.floorY;
    const sky = c.createLinearGradient(0, 0, 0, floor);
    sky.addColorStop(0, p.sky);
    sky.addColorStop(1, p.surface2);
    c.fillStyle = sky;
    c.fillRect(0, 0, W, floor);

    // Fondo del dojo: columnas y una viga.
    c.fillStyle = withAlpha(p.accent, 0.10);
    for (const x of [90, 330, 600, 840]) c.fillRect(x, 150, 30, floor - 150);
    c.fillRect(60, 140, W - 120, 18);
    c.fillStyle = withAlpha(p.accent, 0.06);
    c.fillRect(380, 200, 200, 120);

    c.fillStyle = p.floor;
    c.fillRect(0, floor, W, H - floor);
    c.fillStyle = withAlpha(p.fg, 0.08);
    for (let x = 0; x < W; x += 80) c.fillRect(x, floor, 2, H - floor);
    c.fillStyle = withAlpha(p.accent, 0.6);
    c.fillRect(0, floor, W, 3);
  }

  private drawFighter(f: Fighter): void {
    const c = this.ctx, p = this.palette;
    const b = f.body;
    const dir = f.facing;
    const state = f.stateName;

    // Sombra en el piso (más chica cuanto más alto salta).
    const lift = Math.min(1, (f.arena.floorY - f.y) / 220);
    c.fillStyle = withAlpha("#000000", 0.22 * (1 - lift * 0.6));
    c.beginPath();
    c.ellipse(f.x, f.arena.floorY + 4, 40 * (1 - lift * 0.4), 8, 0, 0, Math.PI * 2);
    c.fill();

    if (state === "ko") {
      // Tirado en el piso.
      const len = b.height * 0.9, thick = b.width * 0.7;
      const x = f.x - len / 2, y = f.y - thick;
      c.fillStyle = shade(f.color, -0.25);
      c.fillRect(x, y, len, thick);
      c.fillStyle = f.color;
      c.fillRect(x + (dir === 1 ? 0 : len - 34), y - 4, 34, 34);
      return;
    }

    const crouch = state === "attack" && f.attack?.move === "kick" && f.grounded ? 10 : 0;
    const top = b.top + crouch;
    const headSize = 34;
    const torsoTop = top + headSize + 4;
    const legTop = b.bottom - 56;
    const body = f.color;
    const dark = shade(f.color, -0.3);

    // Piernas (al caminar se alternan; en el aire, recogidas).
    const step = state === "walk" ? Math.sin(f.stateTime * 14) * 9 : 0;
    const legH = f.grounded ? 56 : 40;
    c.fillStyle = dark;
    c.fillRect(f.x - 24 + step, legTop, 18, legH);
    c.fillRect(f.x + 6 - step, legTop, 18, legH);

    // Torso y cabeza.
    c.fillStyle = body;
    c.fillRect(b.left + 4, torsoTop, b.width - 8, legTop - torsoTop + 4);
    c.fillRect(f.x - headSize / 2, top, headSize, headSize);
    // Cinta y ojo: hacia dónde mira.
    c.fillStyle = "rgba(17, 22, 40, 0.85)";
    c.fillRect(f.x - headSize / 2, top + 8, headSize, 6);
    c.fillStyle = "#ffffff";
    c.fillRect(f.x + dir * 8 - 3, top + 15, 6, 6);

    // Brazos, golpe o guardia.
    const atk = f.attack;
    if (atk) {
      const spec = f.rules.move(atk.move);
      const active = f.rules.isActive(atk.move, f.stateTime) || atk.connected;
      const t = Math.min(1, f.stateTime / Math.max(0.001, spec.startup));
      const reach = (active ? spec.reach : spec.reach * 0.35 * t) + 6;
      const y = b.bottom - spec.height - spec.thickness / 2;
      const x = dir === 1 ? b.right - 6 : b.left + 6 - reach;
      c.fillStyle = atk.move === "kick" ? dark : body;
      c.fillRect(x, y + 4, reach, spec.thickness - 8);
      if (active && !atk.connected) {
        c.fillStyle = withAlpha("#facc15", 0.9);
        c.fillRect(dir === 1 ? x + reach - 12 : x, y + 2, 12, spec.thickness - 4);
      }
    } else if (state === "block") {
      const x = dir === 1 ? b.right - 2 : b.left - 12;
      c.fillStyle = withAlpha(p.accent, 0.35);
      c.fillRect(x - (dir === 1 ? 0 : 6), torsoTop - 30, 20, 96);
      c.strokeStyle = p.accent;
      c.lineWidth = 3;
      c.strokeRect(x - (dir === 1 ? 0 : 6), torsoTop - 30, 20, 96);
    } else {
      c.fillStyle = shade(f.color, 0.15);
      c.fillRect(f.x + dir * 12 - 7, torsoTop + 10, 14, 40);
    }

    // Golpeado: destello blanco.
    if (state === "hit" && f.stateTime < 0.12) {
      c.fillStyle = withAlpha("#ffffff", 0.7);
      c.fillRect(b.left, top, b.width, b.bottom - top);
    }
  }

  private drawHud(m: FightingMatch): void {
    const c = this.ctx, p = this.palette;
    const barW = 360, barH = 22, y = 26;
    m.fighters.forEach((f, i) => {
      const left = i === 0;
      const x = left ? 24 : W - 24 - barW;
      const ratio = f.health / f.maxHealth;
      const trail = this.updateTrail(f.playerId, ratio);

      c.fillStyle = withAlpha(p.surface, 0.85);
      roundRect(c, x - 4, y - 4, barW + 8, barH + 8, 8);
      c.fill();
      c.fillStyle = withAlpha(p.danger, 0.25);
      c.fillRect(x, y, barW, barH);
      // Fantasma (lo que acaba de perder) y vida real. Se vacían hacia el centro.
      c.fillStyle = withAlpha("#ffffff", 0.75);
      c.fillRect(left ? x + barW * (1 - trail) : x, y, barW * trail, barH);
      c.fillStyle = ratio > 0.5 ? p.ok : ratio > 0.25 ? "#f59e0b" : p.danger;
      c.fillRect(left ? x + barW * (1 - ratio) : x, y, barW * ratio, barH);
      c.strokeStyle = p.line;
      c.lineWidth = 2;
      c.strokeRect(x, y, barW, barH);

      // Nombre, personaje y rounds ganados (un punto por round que hace falta).
      c.font = "700 17px 'Segoe UI', system-ui, sans-serif";
      c.textBaseline = "top";
      c.textAlign = left ? "left" : "right";
      c.fillStyle = p.fg;
      const nameX = left ? x : x + barW;
      c.fillText(f.name, nameX, y + barH + 8);
      c.font = "600 12px 'Segoe UI', system-ui, sans-serif";
      c.fillStyle = p.muted;
      c.fillText(`${left ? "J1" : "J2"} · ${f.character}`, nameX, y + barH + 29);

      const wins = m.winsOf(f.playerId);
      for (let k = 0; k < m.roundsToWin; k++) {
        const cx = left ? x + barW - 10 - k * 22 : x + 10 + k * 22;
        c.beginPath();
        c.arc(cx, y + barH + 18, 7, 0, Math.PI * 2);
        c.fillStyle = k < wins ? "#facc15" : withAlpha(p.fg, 0.15);
        c.fill();
        c.strokeStyle = withAlpha(p.fg, 0.35);
        c.lineWidth = 1.5;
        c.stroke();
      }
    });

    // Reloj del round y número de round.
    const r = m.currentRound;
    const secs = Math.ceil(r.timeLeft);
    c.fillStyle = withAlpha(p.surface, 0.92);
    roundRect(c, W / 2 - 42, 14, 84, 52, 10);
    c.fill();
    c.strokeStyle = p.line;
    c.lineWidth = 2;
    c.stroke();
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "800 30px 'Segoe UI', system-ui, sans-serif";
    c.fillStyle = secs <= 10 && r.phase === "fight" ? p.danger : p.fg;
    c.fillText(String(secs), W / 2, 41);
    c.font = "700 13px 'Segoe UI', system-ui, sans-serif";
    c.fillStyle = p.muted;
    c.fillText(`Round ${r.number} de ${m.rounds}`, W / 2, 80);
  }

  private updateTrail(id: string, ratio: number): number {
    const prev = this.trail.get(id) ?? ratio;
    const next = prev > ratio ? Math.max(ratio, prev - 0.012) : ratio;
    this.trail.set(id, next);
    return next;
  }

  private drawBanner(vm: ViewModel): void {
    const r = vm.match.currentRound;
    let title: string | null = null;
    let subtitle: string | null = null;

    if (vm.stopped) title = "Partida cerrada";
    else if (vm.status === "ready") { title = "¡Listos!"; subtitle = "La pelea empieza enseguida"; }
    else if (vm.status === "paused") { title = "Pausa"; }
    else if (vm.status === "finished") {
      title = vm.winnerName ? `¡${vm.winnerName} gana!` : "Empate";
      subtitle = describe(r.result, vm.match);
    } else if (r.phase === "intro") {
      title = r.elapsedInPhase < 1.0 ? `Round ${r.number}` : "¡Pelea!";
    } else if (r.phase === "fight" && r.elapsedInPhase < 0.6 && r.timeLeft > vm.match.rules.config.roundSeconds - 1) {
      title = "¡Pelea!";
    } else if (r.phase === "over") {
      title = headline(r.result);
      subtitle = describe(r.result, vm.match);
    }
    if (!title) return;

    const c = this.ctx;
    c.fillStyle = withAlpha("#090d18", vm.status === "paused" || vm.stopped ? 0.55 : 0.35);
    c.fillRect(0, H / 2 - 70, W, subtitle ? 140 : 110);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "900 58px 'Segoe UI', system-ui, sans-serif";
    c.lineWidth = 6;
    c.strokeStyle = withAlpha("#000000", 0.5);
    c.strokeText(title, W / 2, H / 2 - 18);
    c.fillStyle = "#ffffff";
    c.fillText(title, W / 2, H / 2 - 18);
    if (subtitle) {
      c.font = "700 20px 'Segoe UI', system-ui, sans-serif";
      c.fillStyle = withAlpha("#ffffff", 0.88);
      c.fillText(subtitle, W / 2, H / 2 + 36);
    }
  }

  private drawFocusHint(): void {
    const c = this.ctx;
    c.fillStyle = withAlpha("#090d18", 0.72);
    roundRect(c, W / 2 - 230, H - 58, 460, 40, 10);
    c.fill();
    c.fillStyle = "#ffffff";
    c.font = "700 16px 'Segoe UI', system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Haz clic en el juego para usar el teclado", W / 2, H - 38);
  }
}

// ------------------------------------------------------------------
// Ayudas
// ------------------------------------------------------------------

function headline(r: RoundResult | null): string {
  if (!r) return "";
  if (r.kind === "draw") return r.method === "double_ko" ? "Doble KO" : "Tiempo";
  return r.method === "ko" ? "KO" : "Tiempo";
}

function describe(r: RoundResult | null, m: FightingMatch): string | null {
  if (!r) return null;
  if (r.kind === "draw") return "Round empatado: no suma para nadie";
  const name = m.fighters.find((f) => f.playerId === r.winner)?.name ?? r.winner;
  return `${name} gana el round ${m.currentRound.number}`;
}

const KEY_LABEL: Record<string, string> = {
  ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓",
};
const keyLabel = (code: string) => KEY_LABEL[code] ?? code.replace(/^Key/, "");

function legendFor(f: Fighter, k: KeyBindings): HTMLElement {
  const box = document.createElement("div");
  box.className = `fight-keys ${f.side}`;
  const who = document.createElement("strong");
  who.textContent = f.name;
  who.style.setProperty("--player", f.color);
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

function readPalette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    bg: v("--bg", "#eef1f8"),
    surface: v("--surface", "#ffffff"),
    surface2: v("--surface-2", "#f4f6fb"),
    fg: v("--fg", "#111628"),
    muted: v("--muted", "#5b6479"),
    accent: v("--accent", "#5b4cf0"),
    line: v("--line", "#dfe3ee"),
    danger: v("--danger", "#dc2626"),
    ok: v("--ok", "#15803d"),
    floor: v("--floor", "#c9b48f"),
    sky: v("--sky", "#dbe4ff"),
  };
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** #rrggbb (o rgb()) con transparencia. Si no lo entiende, lo devuelve igual. */
function withAlpha(color: string, alpha: number): string {
  const rgb = parseColor(color);
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})` : color;
}

/** Aclara (amount > 0) u oscurece (amount < 0) un color. */
function shade(color: string, amount: number): string {
  const rgb = parseColor(color);
  if (!rgb) return color;
  const f = (x: number) => Math.round(amount >= 0 ? x + (255 - x) * amount : x * (1 + amount));
  return `rgb(${f(rgb[0])}, ${f(rgb[1])}, ${f(rgb[2])})`;
}

function parseColor(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(color.trim());
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}
