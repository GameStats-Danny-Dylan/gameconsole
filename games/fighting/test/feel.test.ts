/**
 * Sensación de juego: congelado de impacto, cámara lenta, partículas, cámara
 * y su relación con el ciclo (la pausa detiene el tiempo y los efectos).
 */
import { describe, expect, test } from "vitest";
import type { Impact } from "../src/domain/FightingMatch";
import { CameraRig } from "../src/fx/CameraRig";
import { COMBO_SHOW, EffectsSystem, SHAKE } from "../src/fx/EffectsSystem";
import { FINAL_SLOWMO, FINAL_ZOOM } from "../src/fx/GameFeel";
import { FRAME, HitStop, HITSTOP_FRAMES, hitStopFor } from "../src/fx/HitStop";
import { ParticleSystem } from "../src/fx/ParticleSystem";
import { SlowMotion } from "../src/fx/SlowMotion";
import { FightingGame } from "../src/game/FightingGame";
import { SLOT1_KEYS } from "../src/input/ControlScheme";
import { FakeInput, FakeView, ManualFrames, StampHost } from "./support/fakes";

const fakeImpact = (p: Partial<Impact>): Impact => ({
  kind: "hit", move: "punch", damage: 7, chain: 1, ko: false, x: 500, y: 360,
  attacker: { facing: 1, slot: 1 } as Impact["attacker"], defender: { facing: -1, slot: 2 } as Impact["defender"],
  ...p,
});

describe("HitStop", () => {
  test("congela 2 a 4 cuadros según el golpe", () => {
    for (const n of Object.values(HITSTOP_FRAMES)) {
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
    }
    expect(hitStopFor(fakeImpact({ kind: "blocked" }))).toBeCloseTo(2 * FRAME);
    expect(hitStopFor(fakeImpact({ move: "punch" }))).toBeCloseTo(3 * FRAME);
    expect(hitStopFor(fakeImpact({ move: "kick" }))).toBeCloseTo(4 * FRAME);
  });

  test("se come el tiempo justo de los cuadros y devuelve lo que sobra", () => {
    const h = new HitStop();
    h.trigger(3 * FRAME);
    expect([h.consume(FRAME), h.consume(FRAME), h.consume(FRAME)]).toEqual([0, 0, 0]);
    expect(h.active).toBe(false);
    expect(h.consume(FRAME)).toBe(FRAME);
    h.trigger(FRAME);
    expect(h.consume(0.05)).toBeCloseTo(0.05 - FRAME);
  });

  test("dos impactos seguidos: se queda con el más largo, no se suman", () => {
    const h = new HitStop();
    h.trigger(4 * FRAME);
    h.trigger(2 * FRAME);
    expect(h.timeLeft).toBeCloseTo(4 * FRAME);
  });
});

describe("SlowMotion", () => {
  test("va lento y vuelve suave a la velocidad normal", () => {
    const s = new SlowMotion();
    expect(s.scale).toBe(1);
    s.start(1, 0.3);
    expect(s.scale).toBe(0.3);
    s.update(0.8); // queda el 20 %: ya está volviendo
    expect(s.scale).toBeGreaterThan(0.3);
    expect(s.scale).toBeLessThan(1);
    s.update(0.3);
    expect(s.scale).toBe(1);
    expect(s.active).toBe(false);
  });
});

describe("partículas y cámara", () => {
  test("cada partícula dura su vida y desaparece; hay un tope", () => {
    const p = new ParticleSystem(10);
    for (let i = 0; i < 15; i++)
      p.spawn({ kind: "spark", x: 0, y: 0, vx: 100, vy: 0, life: 0.2 + i * 0.01, size: 2, grow: 0, color: "#fff", gravity: 0, drag: 0 });
    expect(p.count).toBe(10);
    p.update(0.1);
    expect(p.count).toBe(10);
    expect(p.items[0].x).toBeCloseTo(10);
    p.update(0.25);
    expect(p.count).toBe(0);
  });

  test("la sacudida se apaga en su duración; el zoom llega a su objetivo", () => {
    const cam = new CameraRig();
    cam.shake(10, 0.3);
    cam.update(0.05);
    expect(Math.abs(cam.offsetX) + Math.abs(cam.offsetY)).toBeGreaterThan(0);
    expect(cam.intensity).toBeLessThanOrEqual(10);
    cam.update(0.26);
    expect([cam.intensity, cam.offsetX, cam.offsetY]).toEqual([0, 0, 0]);
    cam.zoomTo(1.2, 300, 400);
    for (let i = 0; i < 120; i++) cam.update(1 / 60);
    expect(cam.zoom).toBeCloseTo(1.2, 3);
    expect(cam.focusX).toBeCloseTo(300, 0);
    cam.reset();
    expect([cam.zoom, cam.focusX]).toEqual([1, 480]);
  });

  test("un golpe: chispas, sacudida y contador de combo desde el segundo golpe; todo se apaga solo", () => {
    const fx = new EffectsSystem();
    const match = { currentRound: { number: 1, phase: "fight", result: null, elapsedInPhase: 0 }, fighters: [] } as never;
    fx.update(1 / 60, match);
    fx.onImpact(fakeImpact({ move: "kick", damage: 11, chain: 1 }));
    expect(fx.particles.count).toBeGreaterThan(10);
    expect(fx.camera.intensity).toBe(SHAKE.kick[0]);
    expect(fx.combos[0]).toBeNull();
    fx.onImpact(fakeImpact({ damage: 7, chain: 2 }));
    expect(fx.combos[0]).toMatchObject({ hits: 2, damage: 18 });
    fx.onImpact(fakeImpact({ kind: "blocked", damage: 0, chain: 0 }));
    expect(fx.combos[0]).toMatchObject({ hits: 2 });
    for (let t = 0; t < COMBO_SHOW + 0.6; t += 1 / 60) fx.update(1 / 60, match);
    expect(fx.busy).toBe(false);
  });
});

/** Una pelea en el controlador, con los dos pegados y mirándose. */
function setupGame(rounds = 3) {
  const host = new StampHost();
  const view = new FakeView();
  const input = new FakeInput();
  const frames = new ManualFrames();
  const game = new FightingGame(host, view, input, frames);
  game.init({
    gameId: "fighting", matchId: "fighting-feel", mode: "local-2p",
    players: [
      { playerId: "ana", name: "Ana", kind: "human", slot: 1 },
      { playerId: "beto", name: "Beto", kind: "human", slot: 2 },
    ],
    options: { rounds },
  });
  game.start();
  frames.run(2); // pasa la presentación del round
  const [a, b] = game.fight.fighters;
  a.x = 450; b.x = 520;
  return { game, host, view, input, frames };
}

/** Pulsa el golpe de J1 y avanza hasta que el golpe toca (o 30 cuadros). */
function punchUntilImpact(s: ReturnType<typeof setupGame>): void {
  s.input.press(SLOT1_KEYS.attack);
  s.input.release(SLOT1_KEYS.attack);
  for (let i = 0; i < 30 && !s.game.presentation.hitStop.active; i++) s.frames.tick();
}

describe("el congelado de impacto en el ciclo", () => {
  test("al conectar, la pelea y el reloj del round se congelan 3 cuadros; los efectos siguen", () => {
    const s = setupGame();
    punchUntilImpact(s);
    const feel = s.game.presentation;
    expect(feel.hitStop.active).toBe(true);
    const beto = s.game.fight.fighters[1];
    const frozen = { x: beto.x, t: beto.stateTime, clock: s.game.fight.currentRound.timeLeft };
    const particles = feel.fx.particles.items.map((p) => p.age);
    s.frames.tick();
    s.frames.tick();
    expect({ x: beto.x, t: beto.stateTime, clock: s.game.fight.currentRound.timeLeft }).toEqual(frozen);
    expect(feel.fx.particles.items[0].age).toBeGreaterThan(particles[0]);
    for (let i = 0; i < 3; i++) s.frames.tick();
    expect(feel.hitStop.active).toBe(false);
    expect(s.game.fight.currentRound.timeLeft).toBeLessThan(frozen.clock);
  });

  test("una tecla apretada durante el congelado no se pierde", () => {
    const s = setupGame();
    punchUntilImpact(s);
    s.input.press(SLOT1_KEYS.block);
    s.frames.tick(); // congelado
    s.input.release(SLOT1_KEYS.block);
    expect(s.input.wasPressed(SLOT1_KEYS.block)).toBe(true);
  });

  test("la pausa detiene el tiempo y los efectos; al seguir, continúan donde estaban", () => {
    const s = setupGame();
    punchUntilImpact(s);
    s.frames.tick();
    const feel = s.game.presentation;
    const snap = () => ({
      ages: feel.fx.particles.items.map((p) => p.age),
      shake: feel.fx.camera.intensity,
      hitStop: feel.hitStop.timeLeft,
      clock: feel.fx.clock,
      round: s.game.fight.currentRound.timeLeft,
      x: s.game.fight.fighters.map((f) => f.x),
    });
    const before = snap();
    s.game.pause("user");
    s.frames.run(3);
    for (let i = 0; i < 10; i++) s.frames.tick(500);
    expect(snap()).toEqual(before);
    expect(s.view.vm!.status).toBe("paused");
    s.game.resume();
    s.frames.tick(); // el primer cuadro después de seguir no avanza
    expect(snap()).toEqual(before);
    s.frames.run(0.5);
    expect(feel.fx.clock).toBeGreaterThan(before.clock);
    expect(feel.fx.particles.count).toBeLessThan(before.ages.length);
  });

  test("el KO que decide la pelea: cámara lenta y zoom; el final igual termina", () => {
    const s = setupGame(1);
    const beto = s.game.fight.fighters[1];
    beto.receiveHit(beto.health - 3, 0);
    s.frames.run(0.6);
    const [a] = s.game.fight.fighters;
    a.x = beto.x - 70;
    punchUntilImpact(s);
    for (let i = 0; i < 6; i++) s.frames.tick();
    expect(s.game.state).toBe("finished");
    const feel = s.game.presentation;
    expect(feel.slowMo.active).toBe(true);
    expect(feel.slowMo.scale).toBeCloseTo(FINAL_SLOWMO.factor);
    s.frames.run(0.8);
    expect(feel.fx.camera.zoom).toBeGreaterThan(1 + (FINAL_ZOOM - 1) * 0.8);
    s.frames.run(4);
    expect(s.frames.pending).toBe(false);
    expect(s.host.names().slice(-3)).toEqual(["KNOCKDOWN", "ROUND_WON", "MATCH_FINISHED"]);
  });
});
