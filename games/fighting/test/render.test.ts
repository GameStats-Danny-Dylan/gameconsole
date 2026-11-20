/**
 * El dibujo solo lee: las animaciones (poses, escenario, marcador) nunca
 * cambian al luchador ni sus HitBox, y el puño o el pie dibujados llegan a la
 * zona donde el golpe de verdad conecta.
 */
import { describe, expect, test } from "vitest";
import { Arena } from "../src/domain/Arena";
import { CombatRules } from "../src/domain/CombatRules";
import type { Fighter } from "../src/domain/fighter/Fighter";
import { FighterFactory } from "../src/domain/fighter/FighterFactory";
import { intent, NO_INTENT } from "../src/domain/fighter/Intent";
import type { FightView, ViewModel } from "../src/game/ports";
import { FighterRenderer } from "../src/ui/FighterRenderer";
import { HudRenderer } from "../src/ui/HudRenderer";
import { solve, fistTip, toWorld } from "../src/ui/pose/Skeleton";
import { StageRenderer } from "../src/ui/StageRenderer";
import { fakeContext } from "./support/fakeCanvas";
import { simulate } from "./support/simulate";

const DT = 1 / 60;
const ANIM = { clock: 1.3, landing: 0, victory: 0 };

/** Todo lo que el dibujo no debe tocar de un luchador. */
function snapshot(f: Fighter) {
  const box = f.activeAttackBox();
  return {
    x: f.x, y: f.y, vx: f.vx, vy: f.vy, facing: f.facing, health: f.health,
    state: f.stateName, stateTime: f.stateTime, blockstun: f.blockstunUntil,
    body: { ...f.body }, attack: box && { ...box }, connected: f.attack?.connected ?? null,
  };
}

/** Una vista que dibuja de verdad (en un canvas de mentira) y revisa que nada cambie. */
class CheckingView implements FightView {
  readonly ctx = fakeContext();
  readonly fighters = new FighterRenderer();
  readonly hud = new HudRenderer();
  readonly stage = new StageRenderer(() => ({ getContext: () => fakeContext(), width: 0, height: 0 }) as unknown as HTMLCanvasElement);
  frames = 0;
  changed: string[] = [];

  render(vm: ViewModel): void {
    const before = vm.match.fighters.map(snapshot);
    const clock = vm.fx?.clock ?? 0;
    const theme = this.frames % 2 ? "dark" : "light";
    this.stage.drawBackground(this.ctx, theme, 1, clock, 480, vm.match.fighters);
    for (const f of vm.match.fighters) {
      const anim = { clock, landing: vm.fx?.of(f).landing ?? 0, victory: vm.fx?.of(f).victory ?? 0 };
      this.fighters.drawShadow(this.ctx, f, anim);
      this.fighters.draw(this.ctx, f, anim);
    }
    this.stage.drawVignette(this.ctx);
    this.hud.draw(this.ctx, vm, vm.fx);
    this.hud.drawBanners(this.ctx, vm);
    const after = vm.match.fighters.map(snapshot);
    if (JSON.stringify(before) !== JSON.stringify(after)) this.changed.push(`cuadro ${this.frames}`);
    this.frames++;
  }
}

describe("el dibujo no cambia la pelea", () => {
  test.each([3, 11, 42])("semilla %i: dibujar cada cuadro no mueve a nadie ni cambia los eventos", (seed) => {
    const view = new CheckingView();
    const drawn = simulate(seed, 3, "fighting-draw", view);
    const plain = simulate(seed, 3, "fighting-draw");
    expect(view.frames).toBeGreaterThan(500);
    expect(view.changed).toEqual([]);
    expect(view.ctx.calls).toBeGreaterThan(view.frames * 50);
    expect(view.ctx.badNumbers).toEqual([]);
    expect(drawn.events).toEqual(plain.events);
  }, 30_000);   // dibuja más de 500 cuadros de una pelea entera: en Docker o en el CI tarda más de 5 s
});

describe("el golpe dibujado llega a donde conecta", () => {
  const arena = new Arena();
  const rules = new CombatRules();
  const factory = new FighterFactory(arena, rules);
  const renderer = new FighterRenderer();
  const TOL = 8;

  /** La punta (puño o pie) en coordenadas de la arena. */
  function tip(f: Fighter) {
    const pose = renderer.poseOf(f, ANIM);
    const s = solve(pose);
    const local = f.attack!.move === "punch" ? fistTip(s, pose) : s.toeFront;
    return toWorld(local, f.x, f.y, f.facing);
  }

  function untilActive(f: Fighter): void {
    for (let i = 0; i < 60 && !f.activeAttackBox(); i++) f.update(NO_INTENT, DT);
  }

  function expectInside(f: Fighter): void {
    const box = f.activeAttackBox()!;
    expect(box).not.toBeNull();
    const p = tip(f);
    expect(p.x).toBeGreaterThanOrEqual(box.left - TOL);
    expect(p.x).toBeLessThanOrEqual(box.right + TOL);
    expect(p.y).toBeGreaterThanOrEqual(box.top - TOL);
    expect(p.y).toBeLessThanOrEqual(box.bottom + TOL);
    // Y bien adelante del cuerpo (el brazo o la pierna estirados de verdad).
    const reach = (p.x - f.x) * f.facing;
    expect(reach).toBeGreaterThan(f.physics.width / 2 + rules.move(f.attack!.move).reach * 0.5);
  }

  test.each([1, 2])("puño en el piso (slot %i)", (slot) => {
    const f = factory.create({ playerId: `p${slot}`, name: "P", slot });
    f.update(intent({ attack: true }), DT);
    untilActive(f);
    expectInside(f);
  });

  test.each([1, 2])("patada en el piso (slot %i)", (slot) => {
    const f = factory.create({ playerId: `p${slot}`, name: "P", slot });
    f.update(intent({ attack: true, down: true }), DT);
    untilActive(f);
    expectInside(f);
  });

  test.each([1, 2])("patada en el aire (slot %i)", (slot) => {
    const f = factory.create({ playerId: `p${slot}`, name: "P", slot });
    f.update(intent({ jump: true }), DT);
    for (let i = 0; i < 5; i++) f.update(NO_INTENT, DT);
    f.update(intent({ attack: true }), DT);
    expect(f.attack?.move).toBe("kick");
    untilActive(f);
    expectInside(f);
  });

  test("todas las poses tienen números finitos", () => {
    const f = factory.create({ playerId: "p1", name: "P", slot: 1 });
    const seen = new Set<string>();
    const steps = [
      intent({ move: 1 }), intent({ jump: true }), NO_INTENT, intent({ attack: true }), NO_INTENT,
      intent({ block: true }), intent({ attack: true, down: true }), NO_INTENT,
    ];
    for (const s of steps) for (let i = 0; i < 40; i++) {
      f.update(i === 0 ? s : { ...s, attack: false, jump: false }, DT);
      seen.add(f.stateName);
      const sk = solve(renderer.poseOf(f, ANIM));
      for (const v of Object.values(sk)) if (typeof v === "object") expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
    }
    f.receiveHit(10, f.x + 30);
    for (let i = 0; i < 20; i++) { f.update(NO_INTENT, DT); solve(renderer.poseOf(f, ANIM)); }
    f.receiveHit(100, f.x + 30);
    for (let i = 0; i < 90; i++) { f.update(NO_INTENT, DT); seen.add(f.stateName); solve(renderer.poseOf(f, ANIM)); }
    expect([...seen].sort()).toEqual(["attack", "block", "idle", "jump", "ko", "walk"]);
  });
});
