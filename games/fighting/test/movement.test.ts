/**
 * Movimiento y equilibrio: buffer de entrada, aceleración y fricción, el arco
 * del salto, el empuje contra la pared (sin combos infinitos) y los avisos de
 * impacto para la presentación (que no cambian los hechos).
 */
import { describe, expect, test } from "vitest";
import { Arena } from "../src/domain/Arena";
import { CombatRules } from "../src/domain/CombatRules";
import { FightingMatch, type FightFact, type Impact } from "../src/domain/FightingMatch";
import { FighterFactory } from "../src/domain/fighter/FighterFactory";
import { InputBuffer } from "../src/domain/fighter/InputBuffer";
import { intent, NO_INTENT, type Intent } from "../src/domain/fighter/Intent";

const DT = 1 / 60;
const arena = new Arena();
const rules = new CombatRules();
const factory = new FighterFactory(arena, rules);
const PLAYERS = [
  { playerId: "ana", name: "Ana", slot: 1 },
  { playerId: "beto", name: "Beto", slot: 2 },
];

function fightReady() {
  const m = new FightingMatch(PLAYERS, 3);
  const facts: FightFact[] = [];
  const impacts: Impact[] = [];
  m.facts.on((f) => facts.push(f));
  m.impacts.on((i) => impacts.push(i));
  for (let i = 0; i < 200 && m.currentRound.phase !== "fight"; i++) m.step(DT, [NO_INTENT, NO_INTENT]);
  return { m, facts, impacts };
}

function run(m: FightingMatch, seconds: number, a: Intent = NO_INTENT, b: Intent = NO_INTENT): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    m.step(DT, [a, b]);
    a = { ...a, attack: false, jump: false };
    b = { ...b, attack: false, jump: false };
  }
}

describe("InputBuffer", () => {
  test("recuerda una pulsación durante su ventana y después la olvida", () => {
    const buf = new InputBuffer(0.1);
    expect(buf.feed(intent({ attack: true }), DT).attack).toBe(true);
    expect(buf.feed(NO_INTENT, DT).attack).toBe(true);
    for (let i = 0; i < 6; i++) buf.feed(NO_INTENT, DT);
    expect(buf.feed(NO_INTENT, DT).attack).toBe(false);
  });

  test("una patada guardada sigue siendo patada aunque se suelte abajo", () => {
    const buf = new InputBuffer(0.1);
    buf.feed(intent({ attack: true, down: true }), DT);
    expect(buf.feed(NO_INTENT, DT)).toMatchObject({ attack: true, down: true });
  });

  test("un golpe pulsado al final de otro sale apenas termina el primero, una sola vez", () => {
    const f = factory.create({ playerId: "p1", name: "P", slot: 1 });
    f.update(intent({ attack: true }), DT);
    const first = f.attack!;
    // Se pulsa 3 cuadros antes de que termine el puño: antes se perdía.
    while (f.stateTime < rules.duration("punch") - 3 * DT) f.update(NO_INTENT, DT);
    f.update(intent({ attack: true }), DT);
    expect(f.attack).toBe(first);
    let second = null;
    for (let i = 0; i < 6 && !second; i++) {
      f.update(NO_INTENT, DT);
      if (f.attack && f.attack !== first) second = f.attack;
    }
    expect(second).not.toBeNull();
    // Y no sale un tercero solo.
    for (let i = 0; i < 60; i++) f.update(NO_INTENT, DT);
    expect(f.stateName).toBe("idle");
  });
});

describe("aceleración, fricción y salto", () => {
  test("caminar acelera en unos cuadros hasta la velocidad máxima y soltar frena en seco", () => {
    const f = factory.create({ playerId: "p1", name: "P", slot: 1 });
    f.update(intent({ move: 1 }), DT); // idle -> walk
    f.update(intent({ move: 1 }), DT);
    const v1 = f.vx;
    expect(v1).toBeGreaterThan(0);
    expect(v1).toBeLessThan(f.physics.walkSpeed);
    for (let i = 0; i < 15; i++) f.update(intent({ move: 1 }), DT);
    expect(f.vx).toBe(f.physics.walkSpeed);
    f.update(NO_INTENT, DT);
    expect(f.vx).toBe(0);
  });

  test("el empujón de un golpe se frena con fricción (igual a 30 o a 144 cuadros por segundo)", () => {
    const travel = (fps: number) => {
      const f = factory.create({ playerId: "p1", name: "P", slot: 1 });
      const x0 = f.x;
      f.receiveHit(5, f.x + 40);
      for (let t = 0; t < rules.config.hitstun; t += 1 / fps) f.update(NO_INTENT, 1 / fps);
      return x0 - f.x;
    };
    const slow = travel(30), fast = travel(144);
    expect(slow).toBeGreaterThan(15);
    expect(Math.abs(slow - fast)).toBeLessThan(5);
  });

  test("el salto sube rápido, cuelga en la cima y aterriza", () => {
    const f = factory.create({ playerId: "p1", name: "P", slot: 1 });
    f.update(intent({ jump: true }), DT);
    const samples: { t: number; vy: number; y: number }[] = [];
    let t = 0;
    while (!f.grounded || t === 0) {
      f.update(NO_INTENT, DT);
      t += DT;
      samples.push({ t, vy: f.vy, y: f.y });
      if (t > 2) throw new Error("no aterriza");
    }
    const apex = Math.min(...samples.map((s) => s.y));
    const height = arena.floorY - apex;
    expect(height).toBeGreaterThan(120);
    expect(height).toBeLessThan(180);
    // Tiempo cerca de la cima (a menos de 15 px): más que con gravedad pareja.
    const hang = samples.filter((s) => s.y - apex < 15).length * DT;
    const plain = 2 * Math.sqrt((2 * 15) / f.physics.gravity);
    expect(hang).toBeGreaterThan(plain * 1.2);
    expect(t).toBeGreaterThan(0.6);
    expect(t).toBeLessThan(0.95);
  });
});

describe("equilibrio: sin combos infinitos", () => {
  test("golpes sin parar contra un rival quieto: el retroceso corta la cadena en pocos golpes", () => {
    const { m, impacts } = fightReady();
    const [a, b] = m.fighters;
    a.x = 450; b.x = 520;
    for (let i = 0; i < 180; i++) m.step(DT, [intent({ attack: i % 4 === 0 }), NO_INTENT]);
    const longest = Math.max(...impacts.map((x) => x.chain));
    expect(longest).toBeGreaterThanOrEqual(2);
    expect(longest).toBeLessThanOrEqual(3);
  });

  test("contra la pared, el empuje lo absorbe el que pega", () => {
    const { m, impacts } = fightReady();
    const [a, b] = m.fighters;
    a.x = arena.minX(a.physics.width); // Ana contra la pared izquierda
    b.x = a.x + 70;
    a.facing = 1; b.facing = -1;
    const bx = b.x;
    for (let i = 0; i < 180; i++) m.step(DT, [NO_INTENT, intent({ attack: i % 4 === 0 })]);
    expect(b.x).toBeGreaterThan(bx + 20); // Beto se alejó solo
    expect(Math.max(...impacts.map((x) => x.chain))).toBeLessThanOrEqual(3);
  });

  test("entre dos puños seguidos el golpeado alcanza a bloquear", () => {
    const { m, facts } = fightReady();
    const [a, b] = m.fighters;
    a.x = 450; b.x = 520;
    run(m, rules.duration("punch") - 2 * DT, intent({ attack: true }));
    // El segundo puño se pulsa antes de que termine el primero (queda en el buffer).
    run(m, 0.5, intent({ attack: true }), intent({ block: true }));
    expect(facts.some((f) => f.kind === "block")).toBe(true);
    expect(b.health).toBe(100 - rules.move("punch").damage);
  });
});

describe("impactos (solo para la presentación)", () => {
  test("avisan el golpe en el cuadro en que toca, con la cadena, el KO y el punto de contacto", () => {
    const { m, facts, impacts } = fightReady();
    const [a, b] = m.fighters;
    a.x = 450; b.x = 520;
    run(m, 0.2, intent({ attack: true }));
    expect(impacts).toHaveLength(1);
    expect(facts).toEqual([]); // el hecho todavía espera la ventana del combo
    const hit = impacts[0];
    expect(hit).toMatchObject({ kind: "hit", move: "punch", damage: 7, chain: 1, ko: false });
    expect(hit.attacker.playerId).toBe("ana");
    expect(hit.x).toBeGreaterThan(a.x);
    expect(hit.x).toBeLessThanOrEqual(b.body.right);

    run(m, rules.duration("punch") - 0.2 + DT);
    run(m, 0.3, intent({ attack: true }));
    expect(impacts).toHaveLength(2);
    expect(impacts.at(-1)!.chain).toBe(2);
  });

  test("un golpe bloqueado también avisa (sin daño) y el último golpe avisa el KO", () => {
    const { m, impacts } = fightReady();
    const [a, b] = m.fighters;
    a.x = 450; b.x = 520;
    run(m, 0.3, intent({ attack: true }), intent({ block: true }));
    expect(impacts.at(-1)).toMatchObject({ kind: "blocked", damage: 0 });
    run(m, 0.3);
    b.receiveHit(b.health - 3, a.x);
    run(m, 0.5);
    a.x = b.x - 70;
    run(m, 0.3, intent({ attack: true }));
    expect(impacts.at(-1)).toMatchObject({ kind: "hit", ko: true });
  });
});
