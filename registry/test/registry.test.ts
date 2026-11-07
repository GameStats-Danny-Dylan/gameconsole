import { test } from "node:test";
import assert from "node:assert/strict";
import { GameRegistry } from "../src/registry.js";
import { validateManifest } from "../src/manifest.js";
import { connect4, tetris } from "./fixtures.js";

/** Registry con un reloj que avanzamos a mano. */
function setup() {
  let t = 1_000_000;
  const registry = new GameRegistry(15_000, () => t);
  return { registry, advance: (ms: number) => { t += ms; } };
}

test("registrar y listar, ordenado por nombre", () => {
  const { registry } = setup();
  registry.register(tetris());
  registry.register(connect4());
  assert.deepEqual(registry.list().map((g) => g.id), ["connect4", "tetris"]);
  assert.ok(registry.list()[0].registeredAt);
});

test("registrarse otra vez actualiza sin duplicar y conserva registeredAt", () => {
  const { registry, advance } = setup();
  const first = registry.register(connect4());
  advance(3_000);
  const second = registry.register(connect4({ version: "1.0.1" }));
  assert.equal(registry.list().length, 1);
  assert.equal(second.version, "1.0.1");
  assert.equal(second.registeredAt, first.registeredAt);
  assert.notEqual(second.lastSeen, first.lastSeen);
});

test("con latidos cada 5 s sigue vivo", () => {
  const { registry, advance } = setup();
  registry.register(connect4());
  for (let i = 0; i < 10; i++) {
    advance(5_000);
    assert.equal(registry.heartbeat("connect4"), true);
  }
  assert.equal(registry.list().length, 1);
});

test("sin latido por más de 15 s desaparece y avisa (Observer)", () => {
  const { registry, advance } = setup();
  const expired: string[] = [];
  registry.on("expired", (id) => expired.push(id));
  registry.register(connect4());
  advance(15_000);
  assert.equal(registry.list().length, 1, "a los 15 s justos todavía cuenta");
  advance(1);
  assert.equal(registry.list().length, 0);
  assert.deepEqual(expired, ["connect4"]);
});

test("el latido de un juego caído o desconocido falla: debe registrarse otra vez", () => {
  const { registry, advance } = setup();
  assert.equal(registry.heartbeat("nadie"), false);
  registry.register(connect4());
  advance(20_000);
  assert.equal(registry.heartbeat("connect4"), false);
  registry.register(connect4());
  assert.equal(registry.heartbeat("connect4"), true);
});

test("remove lo saca enseguida y avisa", () => {
  const { registry } = setup();
  const removed: string[] = [];
  registry.on("removed", (id) => removed.push(id));
  registry.register(connect4());
  assert.equal(registry.remove("connect4"), true);
  assert.equal(registry.remove("connect4"), false);
  assert.deepEqual(removed, ["connect4"]);
  assert.equal(registry.list().length, 0);
});

test("manifiesto válido pasa", () => {
  assert.equal(validateManifest(connect4()).ok, true);
  assert.equal(validateManifest(tetris()).ok, true);
});

test("manifiestos inválidos dan un motivo claro", () => {
  const cases: [unknown, RegExp][] = [
    [null, /objeto JSON/],
    [connect4({ id: "Connect 4" }), /^id/],
    [connect4({ name: "" }), /^name/],
    [connect4({ gameStatsId: undefined as never }), /^gameStatsId/],
    [connect4({ entry: "http://otro.com/juego" }), /^entry/],
    [connect4({ entry: "//otro.com/juego" }), /^entry/],
    [connect4({ players: { min: 2, max: 1 } }), /^players/],
    [connect4({ modes: [] }), /^modes/],
    [connect4({ modes: ["online" as never] }), /modo desconocido/],
    [connect4({ options: [{ key: "x" } as never] }), /options\[0\]/],
    [connect4({ protocol: "gameconsole/2" }), /^protocol/],
  ];
  for (const [body, expected] of cases) {
    const r = validateManifest(body);
    assert.equal(r.ok, false, JSON.stringify(body));
    if (!r.ok) assert.match(r.error, expected);
  }
});

test("gameStatsId es libre: un juego nuevo no necesita estar en el contrato", () => {
  assert.equal(validateManifest(connect4({ id: "snake", gameStatsId: "snake" })).ok, true);
});
