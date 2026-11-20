/**
 * Skeleton — el cuerpo articulado de un luchador, solo geometría (sin canvas).
 *
 * Una Pose dice los ángulos (torso, cabeza, cada brazo y cada pierna); solve()
 * calcula dónde queda cada articulación (cinemática directa). Coordenadas
 * locales: x hacia donde mira el luchador, y hacia arriba, origen en sus pies.
 *
 * Ángulos de los segmentos: 0 apunta hacia abajo, π/2 hacia adelante, π hacia
 * arriba. `upper` es absoluto; `lower` es relativo al segmento de arriba (la
 * rodilla dobla con valores negativos y el codo con positivos).
 */
export interface Vec { x: number; y: number }

export interface Limb {
  upper: number;
  lower: number;
  /** Ángulo del pie respecto de la canilla (por defecto, plano: π/2). Solo piernas. */
  tip?: number;
}

export interface Pose {
  /** Cadera hacia adelante (px). */
  shiftX: number;
  /** Altura de la cadera; null: la pone el pie más bajo en el piso. */
  hipY: number | null;
  /** Inclinación del torso (+ hacia adelante). */
  lean: number;
  /** Inclinación de la cabeza respecto del torso. */
  headTilt: number;
  /** Respiración (-1 a 1): estira un poco el torso. */
  breath: number;
  armFront: Limb;
  armBack: Limb;
  legFront: Limb;
  legBack: Limb;
  /** Rotación de todo el cuerpo hacia atrás alrededor de los pies (caída del KO). */
  rot: number;
  /** Altura extra del cuerpo entero (rebote al caer). */
  lift: number;
}

export interface Skeleton {
  hip: Vec;
  hipFront: Vec;
  hipBack: Vec;
  neck: Vec;
  /** Centro de los hombros (sobre el eje del torso). */
  chest: Vec;
  head: Vec;
  /** Ángulo de la cabeza (lean + headTilt). */
  headAngle: number;
  lean: number;
  shoulderFront: Vec; elbowFront: Vec; handFront: Vec;
  shoulderBack: Vec; elbowBack: Vec; handBack: Vec;
  kneeFront: Vec; ankleFront: Vec; toeFront: Vec;
  kneeBack: Vec; ankleBack: Vec; toeBack: Vec;
}

/** Largo de cada hueso (px). Un luchador de pie mide ~150 (lo mismo que su HitBox). */
export const BONES = {
  thigh: 37,
  shin: 35,
  /** Altura del tobillo sobre la suela. */
  foot: 4,
  toe: 13,
  torso: 46,
  neck: 7,
  head: 13,
  upperArm: 28,
  forearm: 26,
  fist: 7,
} as const;

const dir = (a: number): Vec => ({ x: Math.sin(a), y: -Math.cos(a) });
const add = (p: Vec, d: Vec, k: number): Vec => ({ x: p.x + d.x * k, y: p.y + d.y * k });

/** Cuánto baja una pierna desde la cadera hasta la suela. */
export function legReach(l: Limb): number {
  return BONES.thigh * Math.cos(l.upper) + BONES.shin * Math.cos(l.upper + l.lower) + BONES.foot;
}

export function solve(p: Pose): Skeleton {
  const hipY = p.hipY ?? Math.max(legReach(p.legFront), legReach(p.legBack));
  const hip = { x: p.shiftX, y: hipY };
  const up: Vec = { x: Math.sin(p.lean), y: Math.cos(p.lean) };
  const fwd: Vec = { x: Math.cos(p.lean), y: -Math.sin(p.lean) };
  const torso = BONES.torso + p.breath * 1.2;
  const neck = add(hip, up, torso);
  const chest = add(hip, up, torso - 6);
  const headAngle = p.lean + p.headTilt;
  const head = add(neck, { x: Math.sin(headAngle), y: Math.cos(headAngle) }, BONES.neck + BONES.head - 4);

  const arm = (shoulder: Vec, l: Limb) => {
    const elbow = add(shoulder, dir(l.upper), BONES.upperArm);
    return { shoulder, elbow, hand: add(elbow, dir(l.upper + l.lower), BONES.forearm) };
  };
  const leg = (joint: Vec, l: Limb) => {
    const knee = add(joint, dir(l.upper), BONES.thigh);
    const shin = l.upper + l.lower;
    const ankle = add(knee, dir(shin), BONES.shin);
    // El pie sale del tobillo hacia adelante (plano en el piso si la canilla está vertical).
    const toe = add({ x: ankle.x, y: ankle.y - BONES.foot }, dir(shin + (l.tip ?? Math.PI / 2)), BONES.toe);
    return { knee, ankle, toe };
  };

  const af = arm(add(chest, fwd, 4), p.armFront);
  const ab = arm(add(chest, fwd, -4), p.armBack);
  const hipFront = add(hip, fwd, 3);
  const hipBack = add(hip, fwd, -3);
  const lf = leg(hipFront, p.legFront);
  const lb = leg(hipBack, p.legBack);

  return {
    hip, hipFront, hipBack, neck, chest, head, headAngle, lean: p.lean,
    shoulderFront: af.shoulder, elbowFront: af.elbow, handFront: af.hand,
    shoulderBack: ab.shoulder, elbowBack: ab.elbow, handBack: ab.hand,
    kneeFront: lf.knee, ankleFront: lf.ankle, toeFront: lf.toe,
    kneeBack: lb.knee, ankleBack: lb.ankle, toeBack: lb.toe,
  };
}

/** La punta del puño delantero (local). */
export function fistTip(s: Skeleton, p: Pose): Vec {
  return add(s.handFront, dir(p.armFront.upper + p.armFront.lower), BONES.fist);
}

/** Pasa un punto local a coordenadas de la arena (x, y = pies del luchador; facing ±1). */
export function toWorld(v: Vec, x: number, y: number, facing: 1 | -1): Vec {
  return { x: x + facing * v.x, y: y - v.y };
}

// ------------------------------------------------------------------
// Mezcla de poses (para pasar de una a otra en el tiempo)
// ------------------------------------------------------------------

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpLimb = (a: Limb, b: Limb, t: number): Limb => ({
  upper: lerp(a.upper, b.upper, t),
  lower: lerp(a.lower, b.lower, t),
  tip: a.tip === undefined && b.tip === undefined ? undefined
    : lerp(a.tip ?? Math.PI / 2, b.tip ?? Math.PI / 2, t),
});

export function blend(a: Pose, b: Pose, t: number): Pose {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    shiftX: lerp(a.shiftX, b.shiftX, t),
    hipY: a.hipY === null || b.hipY === null ? (t < 0.5 ? a.hipY : b.hipY) : lerp(a.hipY, b.hipY, t),
    lean: lerp(a.lean, b.lean, t),
    headTilt: lerp(a.headTilt, b.headTilt, t),
    breath: lerp(a.breath, b.breath, t),
    armFront: lerpLimb(a.armFront, b.armFront, t),
    armBack: lerpLimb(a.armBack, b.armBack, t),
    legFront: lerpLimb(a.legFront, b.legFront, t),
    legBack: lerpLimb(a.legBack, b.legBack, t),
    rot: lerp(a.rot, b.rot, t),
    lift: lerp(a.lift, b.lift, t),
  };
}
