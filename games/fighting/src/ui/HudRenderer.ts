/**
 * HudRenderer — el marcador clásico, encima del escenario: barras de vida con
 * estela de daño, retrato y nombre de cada luchador, medallones de rounds
 * ganados, el reloj grande y los carteles animados ("Round N", "¡Pelea!",
 * "KO", el ganador, la pausa).
 *
 * Solo lee la pelea y los efectos; los carteles se animan con el tiempo de la
 * fase del round, así en la pausa quedan quietos.
 */
import type { Fighter } from "../domain/fighter/Fighter";
import type { FightingMatch } from "../domain/FightingMatch";
import type { RoundResult } from "../domain/Round";
import type { EffectsSystem } from "../fx/EffectsSystem";
import type { ViewModel } from "../game/ports";
import { shade, withAlpha } from "./color";
import { drawHead } from "./FighterRenderer";
import { lookOf } from "./looks";

type Ctx = CanvasRenderingContext2D;

const W = 960;
const H = 540;
const BAR_W = 340;
const BAR_H = 24;
const BAR_Y = 26;
const BAR_X = 88;
const SLANT = 12;
const FONT = "'Segoe UI', system-ui, -apple-system, Roboto, sans-serif";
const GOLD = "#ffd36b";

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
/** Se pasa un poco y vuelve (para los carteles que "golpean"). */
const easeBack = (t: number) => { const s = 2.2, x = clamp01(t) - 1; return 1 + (s + 1) * x * x * x + s * x * x; };

export class HudRenderer {
  draw(c: Ctx, vm: ViewModel, fx: EffectsSystem | null): void {
    const m = vm.match;
    m.fighters.forEach((f, i) => this.side(c, m, f, i === 0, fx));
    this.timer(c, m);
  }

  // ------------------------------------------------------------------
  // Barras, retratos y rounds
  // ------------------------------------------------------------------

  private side(c: Ctx, m: FightingMatch, f: Fighter, left: boolean, fx: EffectsSystem | null): void {
    const look = lookOf(f.character);
    const x0 = left ? BAR_X : W - BAR_X - BAR_W;
    const ratio = f.health / f.maxHealth;
    const trail = fx ? Math.max(ratio, fx.of(f).trail) : ratio;
    const clock = fx?.clock ?? 0;

    // Placa de fondo.
    c.fillStyle = withAlpha("#07060d", 0.72);
    barPath(c, x0 - 6, BAR_Y - 6, BAR_W + 12, BAR_H + 12, SLANT + 2, left);
    c.fill();

    c.save();
    barPath(c, x0, BAR_Y, BAR_W, BAR_H, SLANT, left);
    c.clip();
    c.fillStyle = "#2a0b12";
    c.fillRect(x0 - SLANT, BAR_Y, BAR_W + 2 * SLANT, BAR_H);
    // La vida se vacía desde afuera hacia el centro (lo que queda, pegado al reloj).
    const span = (r: number): [number, number] => {
      const w = (BAR_W + SLANT) * r;
      return left ? [x0 + BAR_W - w, w] : [x0 - SLANT, w];
    };
    const [tx, tw] = span(trail);
    c.fillStyle = "#ff3d3d";
    c.fillRect(tx, BAR_Y, tw, BAR_H);
    const [hx, hw] = span(ratio);
    const low = ratio <= 0.3;
    const g = c.createLinearGradient(0, BAR_Y, 0, BAR_Y + BAR_H);
    if (low) {
      const pulse = 0.5 + 0.5 * Math.sin(clock * 9);
      g.addColorStop(0, shade("#ff9b3d", 0.25 * pulse));
      g.addColorStop(1, "#e2461f");
    } else {
      g.addColorStop(0, "#fff27a");
      g.addColorStop(0.55, "#ffc93c");
      g.addColorStop(1, "#f08a1c");
    }
    c.fillStyle = g;
    c.fillRect(hx, BAR_Y, hw, BAR_H);
    // Brillo y marcas cada 10 %.
    c.fillStyle = withAlpha("#ffffff", 0.28);
    c.fillRect(x0 - SLANT, BAR_Y + 2, BAR_W + 2 * SLANT, 5);
    c.fillStyle = withAlpha("#000000", 0.22);
    for (let k = 1; k < 10; k++) c.fillRect(x0 + (BAR_W * k) / 10 - (left ? 0 : SLANT / 2), BAR_Y, 1.5, BAR_H);
    c.restore();

    c.strokeStyle = GOLD;
    c.lineWidth = 2;
    barPath(c, x0, BAR_Y, BAR_W, BAR_H, SLANT, left);
    c.stroke();

    // Retrato.
    const px = left ? 46 : W - 46, py = 44, pr = 32;
    c.save();
    c.beginPath();
    c.arc(px, py, pr, 0, Math.PI * 2);
    const bg = c.createRadialGradient(px, py - 10, 4, px, py, pr);
    bg.addColorStop(0, shade(look.accent, 0.25));
    bg.addColorStop(1, shade(look.accent, -0.55));
    c.fillStyle = bg;
    c.fill();
    c.clip();
    c.translate(px, py + 8);
    c.scale(left ? 1 : -1, 1);
    // Hombros y cabeza del personaje.
    c.fillStyle = look.top;
    c.beginPath();
    c.ellipse(-2, 34, 30, 16, 0, 0, Math.PI * 2);
    c.fill();
    drawHead(c, look, { x: 0, y: -2 }, 0.05, 1.65, Math.sin(clock * 2) * 0.2);
    c.restore();
    c.strokeStyle = GOLD;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(px, py, pr, 0, Math.PI * 2);
    c.stroke();

    // Nombre y personaje (sin pisar los medallones: con nombres largos, la letra se achica).
    c.textBaseline = "top";
    c.textAlign = left ? "left" : "right";
    const nx = left ? x0 - 4 : x0 + BAR_W + 4;
    const room = BAR_W - m.roundsToWin * 26 - 14;
    const name = f.name.toUpperCase();
    c.font = `italic 900 19px ${FONT}`;
    let nameW = c.measureText(name).width;
    const size = nameW > room ? Math.max(11, Math.floor((19 * room) / nameW)) : 19;
    if (size !== 19) { c.font = `italic 900 ${size}px ${FONT}`; nameW = c.measureText(name).width; }
    c.lineWidth = 4;
    c.strokeStyle = withAlpha("#000000", 0.75);
    c.strokeText(name, nx, BAR_Y + BAR_H + 7 + (19 - size) / 2);
    c.fillStyle = "#ffffff";
    c.fillText(name, nx, BAR_Y + BAR_H + 7 + (19 - size) / 2);
    c.font = `italic 800 12px ${FONT}`;
    const label = `${left ? "J1" : "J2"} · ${capitalize(f.character)}`;
    if (nameW + 10 + c.measureText(label).width <= room) {
      c.fillStyle = look.accent;
      const lx = nx + (left ? nameW + 10 : -nameW - 10);
      c.strokeText(label, lx, BAR_Y + BAR_H + 13);
      c.fillText(label, lx, BAR_Y + BAR_H + 13);
    }

    // Medallones: uno por round que hace falta ganar.
    const wins = m.winsOf(f.playerId);
    for (let k = 0; k < m.roundsToWin; k++) {
      const cx = left ? x0 + BAR_W - 10 - k * 26 : x0 + 10 + k * 26;
      medal(c, cx, BAR_Y + BAR_H + 18, k < wins);
    }
  }

  private timer(c: Ctx, m: FightingMatch): void {
    const r = m.currentRound;
    const secs = Math.ceil(r.timeLeft);
    const urgent = secs <= 10 && r.phase === "fight";
    const cx = W / 2, cy = 46;

    c.save();
    c.beginPath();
    const hw = 46, hh = 36;
    c.moveTo(cx - hw + 12, cy - hh);
    c.lineTo(cx + hw - 12, cy - hh);
    c.lineTo(cx + hw, cy - hh + 14);
    c.lineTo(cx + hw - 8, cy + hh);
    c.lineTo(cx - hw + 8, cy + hh);
    c.lineTo(cx - hw, cy - hh + 14);
    c.closePath();
    const g = c.createLinearGradient(0, cy - hh, 0, cy + hh);
    g.addColorStop(0, "#2b2340");
    g.addColorStop(1, "#0b0913");
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = GOLD;
    c.lineWidth = 2.5;
    c.stroke();

    const beat = urgent ? 1 + 0.08 * Math.max(0, Math.sin(r.timeLeft * Math.PI * 2)) : 1;
    c.translate(cx, cy + 2);
    c.scale(beat, beat);
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `italic 900 44px ${FONT}`;
    c.lineWidth = 6;
    c.strokeStyle = "#000000";
    c.strokeText(String(secs).padStart(2, "0"), 0, 0);
    const tg = c.createLinearGradient(0, -20, 0, 20);
    tg.addColorStop(0, urgent ? "#ffb1a1" : "#ffffff");
    tg.addColorStop(1, urgent ? "#ff3b30" : "#ffd36b");
    c.fillStyle = tg;
    c.fillText(String(secs).padStart(2, "0"), 0, 0);
    c.restore();

    // Número de round.
    c.font = `italic 900 13px ${FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    const label = `ROUND ${r.number}/${m.rounds}`;
    const w = c.measureText(label).width + 20;
    c.fillStyle = withAlpha("#07060d", 0.8);
    roundRect(c, cx - w / 2, 88, w, 20, 10);
    c.fill();
    c.fillStyle = GOLD;
    c.fillText(label, cx, 98.5);
  }

  // ------------------------------------------------------------------
  // Carteles
  // ------------------------------------------------------------------

  drawBanners(c: Ctx, vm: ViewModel): void {
    const m = vm.match;
    const r = m.currentRound;
    const e = r.elapsedInPhase;

    if (vm.stopped) return this.overlay(c, "PARTIDA CERRADA", "La partida terminó antes de tiempo", 0.6);
    if (vm.status === "paused") return this.overlay(c, "PAUSA", "Las teclas no hacen nada hasta que sigas", 0.55);
    if (vm.status === "ready") return this.overlay(c, "¡LISTOS!", "La pelea empieza enseguida", 0.35);

    if (r.phase === "intro") {
      if (e < 1.0) this.roundCall(c, r.number, e, m.rounds);
      else this.fightCall(c, e - 1.0);
      return;
    }
    if (r.phase === "fight" && e < 0.6 && m.rules.config.roundSeconds - r.timeLeft < 1) {
      this.fightCall(c, e + 0.6);
      return;
    }
    if (r.phase === "over") {
      const final = vm.status === "finished";
      if (!final || e < 1.2) this.resultCall(c, r.result, e, final ? null : describe(r.result, m));
      else this.winnerCall(c, vm.winnerName, e - 1.2, describe(r.result, m));
    }
  }

  private roundCall(c: Ctx, n: number, e: number, total: number): void {
    const enter = easeOut(e / 0.22);
    const exit = clamp01((e - 0.82) / 0.18);
    const alpha = enter * (1 - exit);
    band(c, H / 2 - 4, 120 * enter, alpha);
    bigText(c, n === total && total > 1 ? "ROUND FINAL" : `ROUND ${n}`, W / 2, H / 2 - 6, 70, 1.5 - 0.5 * enter + exit * 0.15, alpha,
      ["#ffffff", "#ffd36b"]);
  }

  private fightCall(c: Ctx, t: number): void {
    // t: 0 a 1,2 (0,6 en la presentación y 0,6 ya peleando).
    const s = 2.4 - 1.4 * easeBack(t / 0.24);
    const alpha = clamp01(t / 0.08) * (1 - clamp01((t - 0.95) / 0.25));
    band(c, H / 2 - 4, 130, alpha * 0.9);
    bigText(c, "¡PELEA!", W / 2, H / 2 - 6, 96, s, alpha, ["#fff6c2", "#ff8a1f"], "#3a0a00");
  }

  private resultCall(c: Ctx, result: RoundResult | null, e: number, sub: string | null): void {
    if (!result) return;
    const title = result.kind === "draw" ? (result.method === "double_ko" ? "DOBLE KO" : "TIEMPO")
      : result.method === "ko" ? "K.O." : "TIEMPO";
    const ko = title.includes("K");
    const slam = easeBack(e / 0.2);
    const s = ko ? 3 - 2 * slam : 1.6 - 0.6 * easeOut(e / 0.25);
    const shake = ko && e < 0.35 ? Math.sin(e * 80) * 6 * (1 - e / 0.35) : 0;
    const alpha = clamp01(e / 0.06);
    band(c, H / 2 - 4, sub ? 150 : 130, alpha * 0.85);
    bigText(c, title, W / 2 + shake, H / 2 - 16, ko ? 120 : 84, s, alpha,
      ko ? ["#ffe9a0", "#e8141c"] : ["#ffffff", "#ffd36b"], ko ? "#2a0000" : "#000000");
    if (sub) subText(c, sub, H / 2 + 50, clamp01((e - 0.5) / 0.3));
  }

  private winnerCall(c: Ctx, name: string | null, e: number, sub: string | null): void {
    const enter = easeBack(e / 0.3);
    const alpha = clamp01(e / 0.12);
    band(c, H / 2 - 4, 160, alpha * 0.9);
    const title = name ? `¡${name.toUpperCase()} GANA!` : "EMPATE";
    c.font = `italic 900 80px ${FONT}`;
    const fit = Math.min(1, (W - 120) / Math.max(1, c.measureText(title).width));
    bigText(c, title, W / 2, H / 2 - 16, 80 * fit, 1.6 - 0.6 * enter, alpha, ["#fffbe0", "#ffbf2e"], "#2b1700");
    if (sub) subText(c, name ? "Gana la pelea" : "Nadie gana la pelea", H / 2 + 52, clamp01((e - 0.35) / 0.3));
  }

  private overlay(c: Ctx, title: string, sub: string, dim: number): void {
    c.fillStyle = withAlpha("#05040a", dim);
    c.fillRect(0, 0, W, H);
    band(c, H / 2 - 4, 140, 1);
    bigText(c, title, W / 2, H / 2 - 18, 72, 1, 1, ["#ffffff", "#ffd36b"]);
    subText(c, sub, H / 2 + 42, 1);
  }

  drawFocusHint(c: Ctx): void {
    c.fillStyle = withAlpha("#090d18", 0.8);
    roundRect(c, W / 2 - 230, H - 58, 460, 40, 10);
    c.fill();
    c.fillStyle = "#ffffff";
    c.font = `700 16px ${FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Haz clic en el juego para usar el teclado", W / 2, H - 38);
  }
}

// ------------------------------------------------------------------
// Ayudas
// ------------------------------------------------------------------

function describe(r: RoundResult | null, m: FightingMatch): string | null {
  if (!r) return null;
  if (r.kind === "draw") return "Round empatado: no suma para nadie";
  const name = m.fighters.find((f) => f.playerId === r.winner)?.name ?? r.winner;
  return `${name} gana el round ${m.currentRound.number}`;
}

const capitalize = (s: string) => s.slice(0, 1).toUpperCase() + s.slice(1);

/** Barra inclinada: el lado de adentro (hacia el reloj) va cortado en diagonal. */
function barPath(c: Ctx, x: number, y: number, w: number, h: number, slant: number, left: boolean): void {
  c.beginPath();
  if (left) {
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w - slant, y + h);
    c.lineTo(x - slant, y + h);
  } else {
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w + slant, y + h);
    c.lineTo(x + slant, y + h);
  }
  c.closePath();
}

function medal(c: Ctx, x: number, y: number, won: boolean): void {
  c.beginPath();
  c.arc(x, y, 9, 0, Math.PI * 2);
  c.fillStyle = withAlpha("#07060d", 0.85);
  c.fill();
  c.lineWidth = 2;
  c.strokeStyle = won ? GOLD : withAlpha("#ffffff", 0.35);
  c.stroke();
  if (!won) return;
  // Estrella dorada.
  const g = c.createRadialGradient(x - 2, y - 3, 1, x, y, 8);
  g.addColorStop(0, "#fff7c8");
  g.addColorStop(1, "#f0a91c");
  c.fillStyle = g;
  c.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 ? 3.2 : 7.2;
    c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
}

/** Franja oscura detrás de un cartel, con filos dorados. */
function band(c: Ctx, cy: number, h: number, alpha: number): void {
  if (alpha <= 0) return;
  const g = c.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0, withAlpha("#05040a", 0));
  g.addColorStop(0.2, withAlpha("#05040a", 0.62 * alpha));
  g.addColorStop(0.8, withAlpha("#05040a", 0.62 * alpha));
  g.addColorStop(1, withAlpha("#05040a", 0));
  c.fillStyle = g;
  c.fillRect(0, cy - h / 2, W, h);
  const e = c.createLinearGradient(0, 0, W, 0);
  e.addColorStop(0, withAlpha(GOLD, 0));
  e.addColorStop(0.5, withAlpha(GOLD, 0.8 * alpha));
  e.addColorStop(1, withAlpha(GOLD, 0));
  c.fillStyle = e;
  c.fillRect(0, cy - h / 2, W, 2);
  c.fillRect(0, cy + h / 2 - 2, W, 2);
}

/** Texto grande con contorno grueso y degradado. */
function bigText(c: Ctx, text: string, x: number, y: number, size: number, scale: number, alpha: number,
                 fill: [string, string], stroke = "#000000"): void {
  if (alpha <= 0) return;
  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.scale(scale, scale);
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `italic 900 ${size}px ${FONT}`;
  c.lineJoin = "round";
  c.lineWidth = size * 0.16;
  c.strokeStyle = stroke;
  c.strokeText(text, 0, size * 0.04);
  const g = c.createLinearGradient(0, -size / 2, 0, size / 2);
  g.addColorStop(0, fill[0]);
  g.addColorStop(1, fill[1]);
  c.fillStyle = g;
  c.fillText(text, 0, 0);
  c.lineWidth = 1.5;
  c.strokeStyle = withAlpha("#ffffff", 0.6);
  c.strokeText(text, 0, 0);
  c.restore();
}

function subText(c: Ctx, text: string, y: number, alpha: number): void {
  if (alpha <= 0) return;
  c.save();
  c.globalAlpha = alpha;
  c.font = `italic 800 21px ${FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.lineWidth = 5;
  c.strokeStyle = withAlpha("#000000", 0.8);
  c.strokeText(text, W / 2, y + (1 - alpha) * 10);
  c.fillStyle = "#ffffff";
  c.fillText(text, W / 2, y + (1 - alpha) * 10);
  c.restore();
}

function roundRect(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
