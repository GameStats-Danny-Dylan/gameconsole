/**
 * FighterRenderer — dibuja a un luchador articulado en el canvas: sombra en el
 * piso, piernas, torso con su ropa, cabeza (pelo y cara) y brazos, en el orden
 * de atrás hacia adelante. Las extremidades de atrás van más oscuras para dar
 * profundidad. Mira siempre hacia donde mira el luchador (facing).
 *
 * Solo lee: la pose sale de PoseAnimator y la geometría de Skeleton. Nunca
 * cambia al luchador ni su HitBox.
 */
import type { Fighter } from "../domain/fighter/Fighter";
import { mix, shade, withAlpha } from "./color";
import { lookOf, type Look } from "./looks";
import { PoseAnimator, KO_FALL, type AnimContext } from "./pose/PoseAnimator";
import { BONES, solve, type Pose, type Skeleton, type Vec } from "./pose/Skeleton";

type Ctx = CanvasRenderingContext2D;

const OUTLINE = "#120c14";
const TAU = Math.PI * 2;

export class FighterRenderer {
  private readonly animator = new PoseAnimator();

  /** La pose que tendría el luchador ahora (las pruebas la usan para comparar con las HitBox). */
  poseOf(f: Fighter, anim: AnimContext): Pose {
    return this.animator.poseFor(f, anim);
  }

  /** Sombra en el piso: más chica y más clara cuanto más alto está. */
  drawShadow(c: Ctx, f: Fighter, anim: AnimContext): void {
    const height = Math.max(0, f.arena.floorY - f.y);
    const lift = Math.min(1, height / 200);
    let cx = f.x, rx = 44 * (1 - lift * 0.45);
    if (f.stateName === "ko") {
      const fall = Math.min(1, f.stateTime / KO_FALL);
      cx -= f.facing * 62 * fall;
      rx += 46 * fall;
    } else if (f.attack && f.attack.move === "kick" && f.grounded) {
      cx += f.facing * 10;
    }
    c.fillStyle = withAlpha("#000000", 0.38 * (1 - lift * 0.6));
    c.beginPath();
    c.ellipse(cx, f.arena.floorY + 3, rx, 9 * (1 - lift * 0.4), 0, 0, TAU);
    c.fill();
    void anim;
  }

  draw(c: Ctx, f: Fighter, anim: AnimContext): void {
    const pose = this.animator.poseFor(f, anim);
    const s = solve(pose);
    const look = tinted(lookOf(f.character), flashOf(f));

    c.save();
    c.translate(f.x, f.y);
    c.scale(f.facing, 1);
    if (pose.rot !== 0 || pose.lift !== 0) {
      c.translate(0, -pose.lift);
      c.rotate(-pose.rot);
    }
    c.lineJoin = "round";
    c.lineCap = "round";

    const sway = this.sway(f, anim);
    const P = canvasPoints(s);
    const back = (color: string) => shade(color, -0.3);

    // Detrás de todo: la coleta o las puntas de la faja.
    if (look.sash) this.sash(c, P, look, sway);

    // Brazo y pierna de atrás.
    this.arm(c, P.shoulderBack, P.elbowBack, P.handBack, look, back, s, pose.armBack.upper + pose.armBack.lower);
    this.leg(c, P.hipBack, P.kneeBack, P.ankleBack, P.toeBack, look, back);

    // Pierna de adelante detrás del torso, salvo cuando patea (la pierna va adelante).
    const kicking = f.attack?.move === "kick";
    if (!kicking) this.leg(c, P.hipFront, P.kneeFront, P.ankleFront, P.toeFront, look, (x) => x);
    this.torso(c, P, s, look);
    if (kicking) this.leg(c, P.hipFront, P.kneeFront, P.ankleFront, P.toeFront, look, (x) => x);

    // Cuello y cabeza.
    blob(c, P.neck, P.headBase, 5, 5, look.skin);
    drawHead(c, look, P.head, s.headAngle, 1, sway);

    // Brazo de adelante (el que golpea), encima de todo.
    this.arm(c, P.shoulderFront, P.elbowFront, P.handFront, look, (x) => x, s, pose.armFront.upper + pose.armFront.lower);

    if (f.stateName === "block") this.guard(c, P, f);
    c.restore();
  }

  /** Arco de guardia delante de los brazos: tenue al bloquear y brillante al frenar un golpe. */
  private guard(c: Ctx, P: CanvasPoints, f: Fighter): void {
    const stun = f.stateTime < f.blockstunUntil ? 1 - f.stateTime / Math.max(0.001, f.blockstunUntil) : 0;
    const settle = Math.min(1, f.stateTime / 0.08);
    const alpha = 0.22 * settle + 0.75 * stun;
    if (alpha <= 0.01) return;
    const cx = P.chest.x + 14, cy = P.chest.y + 4;
    c.save();
    c.globalCompositeOperation = "lighter";
    c.lineCap = "round";
    c.strokeStyle = withAlpha("#5fd4ff", alpha);
    c.lineWidth = 6 + 4 * stun;
    c.beginPath();
    c.arc(cx, cy, 44 + 6 * stun, -1.05, 1.15);
    c.stroke();
    c.strokeStyle = withAlpha("#e8fbff", alpha);
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, 44 + 6 * stun, -0.95, 1.05);
    c.stroke();
    c.restore();
  }

  /** Cuánto se mueven el pelo y la faja (por la velocidad y un vaivén suave). */
  private sway(f: Fighter, anim: AnimContext): number {
    const speed = Math.max(-1, Math.min(1, (f.vx * f.facing) / 300));
    const air = f.grounded ? 0 : Math.max(-1, Math.min(1, f.vy / 800));
    return Math.sin(anim.clock * 3.1 + f.slot) * 0.25 + speed * 0.9 - air * 0.6;
  }

  private arm(c: Ctx, sh: Vec, el: Vec, hand: Vec, look: Look, tone: (c: string) => string, _s: Skeleton, foreAngle: number): void {
    // Brasa: brazos descubiertos. Marea: manga corta y vendas en el antebrazo.
    const sleeve = look.hairStyle === "ponytail";
    blob(c, sh, el, 7, 5.6, tone(sleeve ? look.top : look.skin));
    if (sleeve) {
      c.strokeStyle = tone(look.topTrim);
      c.lineWidth = 2;
      const m = lerpV(sh, el, 0.62);
      const d = norm({ x: el.x - sh.x, y: el.y - sh.y });
      c.beginPath();
      c.moveTo(m.x - d.y * 6, m.y + d.x * 6);
      c.lineTo(m.x + d.y * 6, m.y - d.x * 6);
      c.stroke();
    }
    blob(c, el, hand, 5.6, 4.6, tone(look.wraps ?? look.skin));
    if (look.wraps) {
      // Vueltas de la venda.
      c.strokeStyle = tone(shade(look.wraps, -0.18));
      c.lineWidth = 1.2;
      const d = norm({ x: hand.x - el.x, y: hand.y - el.y });
      for (const k of [0.3, 0.55, 0.8]) {
        const m = lerpV(el, hand, k);
        c.beginPath();
        c.moveTo(m.x - d.y * 4.8 - d.x * 1.5, m.y + d.x * 4.8 - d.y * 1.5);
        c.lineTo(m.x + d.y * 4.8 + d.x * 1.5, m.y - d.x * 4.8 + d.y * 1.5);
        c.stroke();
      }
    } else {
      // Puño del guante (Brasa).
      c.fillStyle = tone(look.accent);
      const d = norm({ x: hand.x - el.x, y: hand.y - el.y });
      c.beginPath();
      c.arc(hand.x - d.x * 3, hand.y - d.y * 3, 5.4, 0, TAU);
      c.fill();
    }
    // Puño: un poco más allá de la muñeca, en la dirección del antebrazo.
    const fist = { x: hand.x + Math.sin(foreAngle) * 3, y: hand.y + Math.cos(foreAngle) * 3 };
    circle(c, fist, BONES.fist, tone(look.gloves));
    c.strokeStyle = withAlpha(OUTLINE, 0.35);
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(fist.x, fist.y, 4, -0.6, 0.9);
    c.stroke();
  }

  private leg(c: Ctx, hip: Vec, knee: Vec, ankle: Vec, toe: Vec, look: Look, tone: (c: string) => string): void {
    blob(c, hip, knee, 9.5, 7, tone(look.pants));
    blob(c, knee, ankle, 7, 5.2, tone(look.pants));
    if (look.shins) blob(c, lerpV(knee, ankle, 0.22), lerpV(knee, ankle, 0.92), 6.4, 5.4, tone(look.shins));
    else {
      // Bota del pantalón (más ancha en el tobillo).
      blob(c, lerpV(knee, ankle, 0.78), ankle, 6.2, 6.6, tone(shade(look.pants, -0.12)));
    }
    // Zapato: del talón a la punta.
    const d = norm({ x: toe.x - ankle.x, y: toe.y - ankle.y });
    const heel = { x: ankle.x - d.x * 3, y: ankle.y - d.y * 3 };
    blob(c, heel, toe, 5, 3.6, tone(look.shoes));
  }

  private torso(c: Ctx, P: CanvasPoints, s: Skeleton, look: Look): void {
    const lean = s.lean;
    const n = { x: Math.cos(lean), y: Math.sin(lean) };      // hacia adelante
    const u = { x: Math.sin(lean), y: -Math.cos(lean) };     // hacia arriba
    const H = P.hip, C = P.chest;
    const hw = look.hips / 2, sw = look.shoulders / 2;
    const hb = { x: H.x - n.x * hw, y: H.y - n.y * hw };
    const hf = { x: H.x + n.x * hw, y: H.y + n.y * hw };
    const sb = { x: C.x - n.x * sw, y: C.y - n.y * sw };
    const sf = { x: C.x + n.x * sw, y: C.y + n.y * sw };

    const shape = (grow: number) => {
      c.beginPath();
      c.moveTo(hb.x - n.x * grow, hb.y - n.y * grow);
      c.lineTo(sb.x - n.x * grow, sb.y - n.y * grow);
      c.quadraticCurveTo(C.x + u.x * (9 + grow), C.y + u.y * (9 + grow), sf.x + n.x * grow, sf.y + n.y * grow);
      const mid = lerpV(sf, hf, 0.45);
      c.quadraticCurveTo(mid.x + n.x * (5 + grow), mid.y + n.y * (5 + grow), hf.x + n.x * grow, hf.y + n.y * grow);
      c.quadraticCurveTo(H.x - u.x * (5 + grow), H.y - u.y * (5 + grow), hb.x - n.x * grow, hb.y - n.y * grow);
      c.closePath();
    };
    shape(1.8);
    c.fillStyle = OUTLINE;
    c.fill();
    shape(0);
    c.fillStyle = look.top;
    c.fill();

    // Sombra del lado de atrás (volumen).
    c.save();
    shape(0);
    c.clip();
    c.fillStyle = withAlpha("#000000", 0.2);
    c.beginPath();
    c.moveTo(hb.x - n.x * 4, hb.y - n.y * 4);
    c.lineTo(sb.x - n.x * 4, sb.y - n.y * 4);
    c.lineTo(sb.x + n.x * sw * 0.55, sb.y + n.y * sw * 0.55);
    c.lineTo(hb.x + n.x * hw * 0.4, hb.y + n.y * hw * 0.4);
    c.fill();
    // Luz sobre el pecho.
    c.fillStyle = withAlpha("#ffffff", 0.12);
    c.beginPath();
    c.ellipse(C.x + n.x * sw * 0.45 - u.x * 6, C.y + n.y * sw * 0.45 - u.y * 6, 6, 11, lean, 0, TAU);
    c.fill();

    if (look.hairStyle === "ponytail") {
      // Chaqueta cruzada: la solapa va del hombro de adelante a la cadera de atrás.
      c.strokeStyle = look.topTrim;
      c.lineWidth = 2.6;
      c.beginPath();
      c.moveTo(C.x + n.x * 6 + u.x * 6, C.y + n.y * 6 + u.y * 6);
      c.lineTo(H.x - n.x * 4 + u.x * 9, H.y - n.y * 4 + u.y * 9);
      c.stroke();
      c.beginPath();
      c.moveTo(C.x - n.x * 7 + u.x * 6, C.y - n.y * 7 + u.y * 6);
      c.lineTo(C.x + n.x * 2 - u.x * 4, C.y + n.y * 2 - u.y * 4);
      c.stroke();
    } else {
      // Ribete en el escote y las sisas.
      c.strokeStyle = look.topTrim;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(sb.x + n.x * 4, sb.y + n.y * 4);
      c.quadraticCurveTo(C.x + u.x * 7, C.y + u.y * 7, sf.x - n.x * 4, sf.y - n.y * 4);
      c.stroke();
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(C.x + n.x * 3 + u.x * 6, C.y + n.y * 3 + u.y * 6);
      c.lineTo(C.x + n.x * 6 - u.x * 6, C.y + n.y * 6 - u.y * 6);
      c.stroke();
    }
    c.restore();

    // Cinturón o faja.
    const b0 = { x: H.x + u.x * 2, y: H.y + u.y * 2 }, b1 = { x: H.x + u.x * 10, y: H.y + u.y * 10 };
    c.fillStyle = look.belt;
    c.strokeStyle = OUTLINE;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(b0.x - n.x * (hw + 1), b0.y - n.y * (hw + 1));
    c.lineTo(b1.x - n.x * (hw + 0.5), b1.y - n.y * (hw + 0.5));
    c.lineTo(b1.x + n.x * (hw + 1.5), b1.y + n.y * (hw + 1.5));
    c.lineTo(b0.x + n.x * (hw + 2), b0.y + n.y * (hw + 2));
    c.closePath();
    c.fill();
    c.stroke();
    if (look.sash) {
      // Nudo de la faja, adelante.
      circle(c, { x: (b0.x + b1.x) / 2 + n.x * (hw - 2), y: (b0.y + b1.y) / 2 + n.y * (hw - 2) }, 4, look.sash);
    }
  }

  /** Las puntas de la faja, que flotan detrás (más con la velocidad). */
  private sash(c: Ctx, P: CanvasPoints, look: Look, sway: number): void {
    const H = P.hip;
    const start = { x: H.x - 12, y: H.y - 6 };
    for (const [k, len] of [[0, 26], [1, 20]] as const) {
      const wave = Math.sin(sway * 2 + k * 1.7) * 4;
      const end = { x: start.x - len * (0.75 + Math.max(0, sway) * 0.3), y: start.y + 18 - Math.max(0, sway) * 9 + wave };
      const ctrl = { x: start.x - len * 0.4, y: start.y + 4 - wave };
      c.strokeStyle = OUTLINE;
      c.lineWidth = 7.5 - k;
      c.beginPath();
      c.moveTo(start.x, start.y);
      c.quadraticCurveTo(ctrl.x, ctrl.y, end.x, end.y);
      c.stroke();
      c.strokeStyle = k === 0 ? look.sash! : shade(look.sash!, -0.18);
      c.lineWidth = 4.5 - k;
      c.stroke();
    }
  }
}

/**
 * La cabeza: pelo, cara y oreja, girada con el torso. También se usa para el
 * retrato del marcador (scale > 1). center: centro de la cabeza (canvas).
 */
export function drawHead(c: Ctx, look: Look, center: Vec, angle: number, scale: number, sway: number): void {
  c.save();
  c.translate(center.x, center.y);
  c.rotate(angle);
  c.scale(scale, scale);
  c.lineJoin = "round";
  c.lineCap = "round";

  if (look.hairStyle === "ponytail") {
    // Coleta: sale de atrás de la cabeza y cuelga con el movimiento.
    const end = { x: -30 - Math.max(0, sway) * 8, y: 16 - Math.max(0, sway) * 12 + Math.sin(sway * 3) * 2 };
    const ctrl = { x: -24, y: -6 };
    c.strokeStyle = OUTLINE;
    c.lineWidth = 10;
    c.beginPath();
    c.moveTo(-9, -6);
    c.quadraticCurveTo(ctrl.x, ctrl.y, end.x, end.y);
    c.stroke();
    c.strokeStyle = look.hair;
    c.lineWidth = 6.5;
    c.stroke();
    c.lineWidth = 3;
    c.strokeStyle = shade(look.hair, 0.25);
    c.beginPath();
    c.moveTo(-14, -8);
    c.quadraticCurveTo(-22, -4, end.x + 4, end.y - 3);
    c.stroke();
    circle(c, { x: -11, y: -6 }, 3.2, look.topTrim);
  }

  // Cara y mandíbula.
  c.fillStyle = OUTLINE;
  c.beginPath();
  c.ellipse(0, 0, 14.3, 15.2, 0, 0, TAU);
  c.ellipse(4.5, 6.5, 9.6, 7.6, 0, 0, TAU);
  c.fill();
  c.fillStyle = look.skin;
  c.beginPath();
  c.ellipse(0, 0, 12.5, 13.5, 0, 0, TAU);
  c.ellipse(4.5, 6.5, 8, 6, 0, 0, TAU);
  c.fill();
  // Sombra de la nuca.
  c.fillStyle = withAlpha("#000000", 0.14);
  c.beginPath();
  c.ellipse(-6, 3, 6, 10, 0.2, 0, TAU);
  c.fill();
  // Nariz.
  c.fillStyle = look.skin;
  c.strokeStyle = OUTLINE;
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(11.8, -1);
  c.lineTo(15, 3.2);
  c.lineTo(11.6, 4.2);
  c.fill();
  c.stroke();
  // Oreja.
  circle(c, { x: -2.5, y: 1.5 }, 3.2, shade(look.skin, -0.12));

  // Pelo.
  c.fillStyle = look.hair;
  c.strokeStyle = OUTLINE;
  c.lineWidth = 1.8;
  c.beginPath();
  if (look.hairStyle === "crest") {
    c.moveTo(-12.5, 4);
    c.lineTo(-14, -6);
    c.lineTo(-12, -14);
    c.lineTo(-7, -13);
    c.lineTo(-5, -21);
    c.lineTo(-0.5, -15);
    c.lineTo(3, -22);
    c.lineTo(6, -15);
    c.lineTo(11, -18);
    c.lineTo(11.5, -10);
    c.lineTo(13.5, -6);
    c.lineTo(8, -7.5);
    c.lineTo(2, -6);
    c.lineTo(-3, -4);
    c.lineTo(-6, 2);
  } else {
    c.moveTo(-12.5, 6);
    c.quadraticCurveTo(-15, -12, -2, -15);
    c.quadraticCurveTo(11, -15.5, 13.5, -5);
    c.lineTo(9, -6.5);
    c.lineTo(7, -3.5);
    c.lineTo(4, -6.5);
    c.quadraticCurveTo(-2, -5, -5, 1);
    c.lineTo(-7, 6);
  }
  c.closePath();
  c.fill();
  c.stroke();
  // Brillo del pelo.
  c.strokeStyle = withAlpha("#ffffff", 0.22);
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(-8, -10);
  c.quadraticCurveTo(-2, -14, 5, -12);
  c.stroke();

  // Ojo y ceja (decidida).
  c.fillStyle = "#ffffff";
  c.beginPath();
  c.ellipse(7, -0.5, 2.8, 2.1, 0, 0, TAU);
  c.fill();
  c.fillStyle = look.eye;
  c.beginPath();
  c.arc(8, -0.3, 1.5, 0, TAU);
  c.fill();
  c.strokeStyle = OUTLINE;
  c.lineWidth = 2.1;
  c.beginPath();
  c.moveTo(3.2, -5.4);
  c.lineTo(10.5, -3.3);
  c.stroke();
  // Boca.
  c.lineWidth = 1.3;
  c.beginPath();
  c.moveTo(9.8, 8.2);
  c.lineTo(6.2, 8.6);
  c.stroke();
  c.restore();
}

// ------------------------------------------------------------------
// Ayudas de dibujo
// ------------------------------------------------------------------

interface CanvasPoints {
  hip: Vec; hipFront: Vec; hipBack: Vec; chest: Vec; neck: Vec; head: Vec; headBase: Vec;
  shoulderFront: Vec; elbowFront: Vec; handFront: Vec;
  shoulderBack: Vec; elbowBack: Vec; handBack: Vec;
  kneeFront: Vec; ankleFront: Vec; toeFront: Vec;
  kneeBack: Vec; ankleBack: Vec; toeBack: Vec;
}

/** Puntos del esqueleto en coordenadas del canvas (y hacia abajo). */
function canvasPoints(s: Skeleton): CanvasPoints {
  const v = (p: Vec): Vec => ({ x: p.x, y: -p.y });
  const head = v(s.head);
  return {
    hip: v(s.hip), hipFront: v(s.hipFront), hipBack: v(s.hipBack), chest: v(s.chest), neck: v(s.neck), head,
    headBase: lerpV(v(s.neck), head, 0.45),
    shoulderFront: v(s.shoulderFront), elbowFront: v(s.elbowFront), handFront: v(s.handFront),
    shoulderBack: v(s.shoulderBack), elbowBack: v(s.elbowBack), handBack: v(s.handBack),
    kneeFront: v(s.kneeFront), ankleFront: v(s.ankleFront), toeFront: v(s.toeFront),
    kneeBack: v(s.kneeBack), ankleBack: v(s.ankleBack), toeBack: v(s.toeBack),
  };
}

const lerpV = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const norm = (d: Vec): Vec => { const l = Math.hypot(d.x, d.y) || 1; return { x: d.x / l, y: d.y / l }; };

/** Un segmento cónico (de radio ra a rb) con contorno oscuro. */
function blob(c: Ctx, a: Vec, b: Vec, ra: number, rb: number, color: string): void {
  capsule(c, a, b, ra + 1.7, rb + 1.7);
  c.fillStyle = OUTLINE;
  c.fill();
  capsule(c, a, b, ra, rb);
  c.fillStyle = color;
  c.fill();
}

function capsule(c: Ctx, a: Vec, b: Vec, ra: number, rb: number): void {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  c.beginPath();
  c.moveTo(a.x + nx * ra, a.y + ny * ra);
  c.lineTo(b.x + nx * rb, b.y + ny * rb);
  c.lineTo(b.x - nx * rb, b.y - ny * rb);
  c.lineTo(a.x - nx * ra, a.y - ny * ra);
  c.closePath();
  // Los círculos van con el mismo sentido de giro que el cuadrilátero (si no, quedan huecos).
  c.moveTo(a.x + ra, a.y);
  c.arc(a.x, a.y, ra, 0, TAU, true);
  c.moveTo(b.x + rb, b.y);
  c.arc(b.x, b.y, rb, 0, TAU, true);
}

function circle(c: Ctx, p: Vec, r: number, color: string): void {
  c.fillStyle = OUTLINE;
  c.beginPath();
  c.arc(p.x, p.y, r + 1.6, 0, TAU);
  c.fill();
  c.fillStyle = color;
  c.beginPath();
  c.arc(p.x, p.y, r, 0, TAU);
  c.fill();
}

/** Destello blanco al recibir un golpe (los primeros cuadros del aturdimiento). */
function flashOf(f: Fighter): number {
  if (f.stateName !== "hit" && f.stateName !== "ko") return 0;
  return f.stateTime < 0.1 ? 0.75 * (1 - f.stateTime / 0.1) : 0;
}

/** El aspecto mezclado con blanco (destello). */
function tinted(look: Look, flash: number): Look {
  if (flash <= 0.01) return look;
  const t = (c: string) => mix(c, "#ffffff", flash);
  return {
    ...look,
    skin: t(look.skin), hair: t(look.hair), top: t(look.top), topTrim: t(look.topTrim), pants: t(look.pants),
    belt: t(look.belt), sash: look.sash && t(look.sash), gloves: t(look.gloves), wraps: look.wraps && t(look.wraps),
    shoes: t(look.shoes), shins: look.shins && t(look.shins), accent: t(look.accent),
  };
}
