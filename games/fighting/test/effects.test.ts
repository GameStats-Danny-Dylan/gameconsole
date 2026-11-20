/** EffectsSystem: el estado de la presentación que avanza con el tiempo de la pelea. */
import { describe, expect, test } from "vitest";
import { FightingMatch } from "../src/domain/FightingMatch";
import { NO_INTENT, intent } from "../src/domain/fighter/Intent";
import { EffectsSystem, LANDING_TIME, TRAIL_HOLD, TRAIL_SPEED } from "../src/fx/EffectsSystem";

const DT = 1 / 60;
const PLAYERS = [
  { playerId: "ana", name: "Ana", slot: 1 },
  { playerId: "beto", name: "Beto", slot: 2 },
];

function run(m: FightingMatch, fx: EffectsSystem, seconds: number, a = NO_INTENT): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    m.step(DT, [a, NO_INTENT]);
    fx.update(DT, m);
    a = { ...a, attack: false, jump: false };
  }
}

describe("EffectsSystem", () => {
  test("estela de vida: espera quieta y después baja hasta la vida real", () => {
    const m = new FightingMatch(PLAYERS);
    const fx = new EffectsSystem();
    const beto = m.fighters[1];
    fx.update(DT, m);
    beto.receiveHit(30, beto.x - 40);
    fx.update(DT, m);
    expect(fx.of(beto).trail).toBe(1);
    run(m, fx, TRAIL_HOLD - 0.05);
    expect(fx.of(beto).trail).toBe(1); // todavía espera
    run(m, fx, 0.1 + 0.15);
    const t = fx.of(beto).trail;
    expect(t).toBeLessThan(1);
    expect(t).toBeGreaterThan(0.7);
    run(m, fx, 0.3 / TRAIL_SPEED + 0.1);
    expect(fx.of(beto).trail).toBeCloseTo(0.7);
  });

  test("el reloj y la estela no avanzan sin tiempo (pausa)", () => {
    const m = new FightingMatch(PLAYERS);
    const fx = new EffectsSystem();
    run(m, fx, 0.5);
    const clock = fx.clock;
    m.fighters[1].receiveHit(30, 0);
    fx.update(DT, m);
    run(m, fx, 1);
    const trail = fx.of(m.fighters[1]).trail;
    for (let i = 0; i < 100; i++) fx.update(0, m);
    expect(fx.clock).toBeCloseTo(clock + 1 + DT);
    expect(fx.of(m.fighters[1]).trail).toBe(trail);
  });

  test("aterrizar flexiona las rodillas un momento", () => {
    const m = new FightingMatch(PLAYERS);
    const fx = new EffectsSystem();
    for (let i = 0; i < 200 && m.currentRound.phase !== "fight"; i++) { m.step(DT, [NO_INTENT, NO_INTENT]); fx.update(DT, m); }
    run(m, fx, DT, intent({ jump: true }));
    let landed = false;
    for (let i = 0; i < 120 && !landed; i++) { run(m, fx, DT); landed = fx.of(m.fighters[0]).landing === 1; }
    expect(landed).toBe(true);
    run(m, fx, LANDING_TIME + DT);
    expect(fx.of(m.fighters[0]).landing).toBe(0);
  });
});
