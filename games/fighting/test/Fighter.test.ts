/** Estados del luchador (patrón State) y sus transiciones. */
import { describe, expect, test } from "vitest";
import { Arena } from "../src/domain/Arena";
import { CombatRules } from "../src/domain/CombatRules";
import { Fighter } from "../src/domain/fighter/Fighter";
import { FighterFactory, ROSTER } from "../src/domain/fighter/FighterFactory";
import { intent, NO_INTENT, type Intent } from "../src/domain/fighter/Intent";

const DT = 1 / 60;
const arena = new Arena();
const rules = new CombatRules();
const factory = new FighterFactory(arena, rules);

function make(slot = 1): Fighter {
  return factory.create({ playerId: `p${slot}`, name: `P${slot}`, slot });
}

/** Avanza `seconds` con la misma intención (el flanco de golpe/salto solo el primer cuadro). */
function hold(f: Fighter, i: Intent, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) {
    f.update(i, DT);
    i = { ...i, attack: false, jump: false };
  }
}

describe("FighterFactory", () => {
  test("slot 1 a la izquierda mirando a la derecha, slot 2 al revés; personaje por slot", () => {
    const [a, b] = factory.createPair([
      { playerId: "beto", name: "Beto", slot: 2 },
      { playerId: "ana", name: "Ana", slot: 1 },
    ]);
    expect([a.playerId, a.side, a.facing, a.character]).toEqual(["ana", "left", 1, ROSTER[1].id]);
    expect([b.playerId, b.side, b.facing, b.character]).toEqual(["beto", "right", -1, ROSTER[2].id]);
    expect(a.x).toBeLessThan(b.x);
  });

  test("necesita exactamente los slots 1 y 2 con playerId distintos", () => {
    expect(() => factory.createPair([{ playerId: "a", name: "A", slot: 1 }])).toThrow();
    expect(() => factory.createPair([{ playerId: "a", name: "A", slot: 1 }, { playerId: "a", name: "B", slot: 2 }])).toThrow();
  });
});

describe("Fighter: estados", () => {
  test("idle ⇄ walk", () => {
    const f = make();
    expect(f.stateName).toBe("idle");
    const x0 = f.x;
    hold(f, intent({ move: 1 }), 0.3);
    expect(f.stateName).toBe("walk");
    expect(f.x).toBeGreaterThan(x0);
    hold(f, NO_INTENT, DT);
    expect(f.stateName).toBe("idle");
    expect(f.vx).toBe(0);
  });

  test("jump: sube, cae y aterriza en idle", () => {
    const f = make();
    hold(f, intent({ jump: true }), DT * 3);
    expect(f.stateName).toBe("jump");
    expect(f.grounded).toBe(false);
    hold(f, NO_INTENT, 1.5);
    expect(f.grounded).toBe(true);
    expect(f.stateName).toBe("idle");
  });

  test("attack: puño en el piso, patada con abajo o en el aire; vuelve a idle al terminar", () => {
    const f = make();
    f.update(intent({ attack: true }), DT);
    expect(f.stateName).toBe("attack");
    expect(f.attack?.move).toBe("punch");
    hold(f, NO_INTENT, rules.duration("punch") + DT);
    expect(f.stateName).toBe("idle");

    f.update(intent({ attack: true, down: true }), DT);
    expect(f.attack?.move).toBe("kick");
    hold(f, NO_INTENT, rules.duration("kick") + DT);

    hold(f, intent({ jump: true }), DT * 4);
    f.update(intent({ attack: true }), DT);
    expect(f.attack?.move).toBe("kick");
  });

  test("durante un golpe no se camina ni se vuelve a golpear", () => {
    const f = make();
    f.update(intent({ attack: true }), DT);
    const x = f.x;
    const first = f.attack;
    f.update(intent({ attack: true, move: 1 }), DT);
    expect(f.stateName).toBe("attack");
    expect(f.attack).toBe(first); // es el mismo golpe, no uno nuevo
    expect(f.x).toBe(x);
  });

  test("golpe al aire: avisa una sola vez (whiff)", () => {
    const f = make();
    f.update(intent({ attack: true }), DT);
    hold(f, NO_INTENT, rules.duration("punch") + DT);
    expect(f.drainSignals()).toEqual([{ kind: "whiff", move: "punch" }]);
    expect(f.drainSignals()).toEqual([]);
  });

  test("golpe que conectó: no avisa whiff", () => {
    const f = make();
    f.update(intent({ attack: true }), DT);
    f.markConnected();
    hold(f, NO_INTENT, rules.duration("punch") + DT);
    expect(f.drainSignals()).toEqual([]);
  });

  test("block: se queda quieto mientras se sostiene y suelta a idle", () => {
    const f = make();
    hold(f, intent({ block: true, move: 1 }), 0.3);
    expect(f.stateName).toBe("block");
    expect(f.blocking).toBe(true);
    hold(f, NO_INTENT, DT);
    expect(f.stateName).toBe("idle");
  });

  test("block: un golpe bloqueado frena un momento antes de poder soltar", () => {
    const f = make();
    hold(f, intent({ block: true }), DT);
    f.receiveBlock(f.x + 50);
    f.update(NO_INTENT, DT);
    expect(f.stateName).toBe("block");      // sigue frenado aunque soltó
    hold(f, NO_INTENT, rules.config.blockstun + DT);
    expect(f.stateName).toBe("idle");
  });

  test("hit: recibe daño, queda aturdido, es empujado y se recupera", () => {
    const f = make();
    const x = f.x;
    f.receiveHit(10, f.x + 40); // golpe desde la derecha
    expect(f.health).toBe(90);
    expect(f.stateName).toBe("hit");
    hold(f, intent({ attack: true }), DT); // aturdido: no puede golpear
    expect(f.stateName).toBe("hit");
    expect(f.x).toBeLessThan(x);            // empujado hacia la izquierda
    hold(f, NO_INTENT, rules.config.hitstun);
    expect(f.stateName).toBe("idle");
  });

  test("un golpe interrumpe el ataque propio", () => {
    const f = make();
    f.update(intent({ attack: true, down: true }), DT);
    f.receiveHit(5, f.x + 40);
    expect(f.stateName).toBe("hit");
    expect(f.attack).toBeNull();
  });

  test("ko: con la vida en 0 queda en KO para siempre y no recibe más golpes", () => {
    const f = make();
    f.receiveHit(100, f.x + 40);
    expect(f.health).toBe(0);
    expect(f.stateName).toBe("ko");
    expect(f.vulnerable).toBe(false);
    hold(f, intent({ move: 1, attack: true, jump: true }), 2);
    expect(f.stateName).toBe("ko");
    f.receiveHit(10, f.x);
    expect(f.health).toBe(0);
  });

  test("no sale de la arena", () => {
    const f = make();
    hold(f, intent({ move: -1 }), 5);
    expect(f.body.left).toBeGreaterThanOrEqual(arena.margin - 1e-9);
  });

  test("resetForRound: vida llena, en su lado y en idle", () => {
    const f = make(2);
    f.receiveHit(100, 0);
    f.resetForRound();
    expect([f.health, f.stateName, f.x, f.facing]).toEqual([100, "idle", arena.spawnX("right"), -1]);
  });
});
