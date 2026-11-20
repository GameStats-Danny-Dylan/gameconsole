/** Reglas de combate: daño, bloqueo, alcance, tiempos de los golpes y la mayoría de rounds. */
import { describe, expect, test } from "vitest";
import { CombatRules, DEFAULT_RULES, type Combatant } from "../src/domain/CombatRules";
import { HitBox } from "../src/domain/HitBox";

const rules = new CombatRules();
const fighter = (p: Partial<Combatant> = {}): Combatant => ({ health: 100, blocking: false, facing: 1, x: 0, ...p });

describe("HitBox", () => {
  test("se superponen; compartir solo un borde no cuenta", () => {
    const a = new HitBox(0, 0, 10, 10);
    expect(a.intersects(new HitBox(5, 5, 10, 10))).toBe(true);
    expect(a.intersects(new HitBox(10, 0, 10, 10))).toBe(false);
    expect(a.translate(3, 4)).toMatchObject({ x: 3, y: 4, right: 13, bottom: 14 });
  });
});

describe("CombatRules", () => {
  test("daño: el del golpe; la patada pega más que el puño", () => {
    expect(rules.resolve("punch", fighter(), fighter({ x: 50, facing: -1 }))).toEqual({ kind: "hit", damage: DEFAULT_RULES.moves.punch.damage });
    expect(rules.move("kick").damage).toBeGreaterThan(rules.move("punch").damage);
  });

  test("el daño se recorta a la vida que le queda al rival (nunca pasa de la vida máxima)", () => {
    expect(rules.resolve("kick", fighter(), fighter({ health: 4, x: 50, facing: -1 }))).toEqual({ kind: "hit", damage: 4 });
  });

  test("bloqueo de frente: sin daño", () => {
    const attacker = fighter({ x: 0, facing: 1 });
    const defender = fighter({ x: 60, facing: -1, blocking: true }); // mira hacia el que pega
    expect(rules.resolve("kick", attacker, defender)).toEqual({ kind: "blocked" });
  });

  test("bloqueo de espaldas no sirve", () => {
    const attacker = fighter({ x: 0, facing: 1 });
    const defender = fighter({ x: 60, facing: 1, blocking: true }); // le da la espalda
    expect(rules.resolve("punch", attacker, defender).kind).toBe("hit");
  });

  test("alcance: la patada llega más lejos que el puño", () => {
    const body = new HitBox(0, 320, 64, 150);
    const near = new HitBox(64 + 50, 320, 64, 150);  // a 50 px
    const mid = new HitBox(64 + 75, 320, 64, 150);   // a 75 px
    const far = new HitBox(64 + 120, 320, 64, 150);  // a 120 px
    expect(rules.inRange("punch", body, 1, near)).toBe(true);
    expect(rules.inRange("punch", body, 1, mid)).toBe(false);
    expect(rules.inRange("kick", body, 1, mid)).toBe(true);
    expect(rules.inRange("kick", body, 1, far)).toBe(false);
    // de espaldas no alcanza
    expect(rules.inRange("kick", body, -1, near)).toBe(false);
  });

  test("tiempos: el golpe solo conecta en su parte activa", () => {
    const p = rules.move("punch");
    expect(rules.isActive("punch", 0)).toBe(false);
    expect(rules.isActive("punch", p.startup)).toBe(true);
    expect(rules.isActive("punch", p.startup + p.active)).toBe(false);
    expect(rules.duration("punch")).toBeCloseTo(p.startup + p.active + p.recovery);
  });

  test("mayoría de rounds: 1 de 1, 2 de 3, 3 de 5", () => {
    expect([1, 3, 5].map(CombatRules.roundsToWin)).toEqual([1, 2, 3]);
  });
});
