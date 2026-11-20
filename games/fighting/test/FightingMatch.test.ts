/** Rounds y pelea: golpes, bloqueos, combos, KO, tiempo, empates y el mejor de N. */
import { describe, expect, test } from "vitest";
import { Arena } from "../src/domain/Arena";
import { CombatRules, DEFAULT_RULES } from "../src/domain/CombatRules";
import { FightingMatch, type FightFact, type RoundsOption } from "../src/domain/FightingMatch";
import { intent, NO_INTENT, type Intent } from "../src/domain/fighter/Intent";
import { INTRO_SECONDS, OVER_SECONDS, Round } from "../src/domain/Round";


const DT = 1 / 60;
const PLAYERS = [
  { playerId: "ana", name: "Ana", slot: 1 },
  { playerId: "beto", name: "Beto", slot: 2 },
];

function setup(rounds: RoundsOption = 3, roundSeconds = 5) {
  const rules = new CombatRules({ ...DEFAULT_RULES, roundSeconds });
  const m = new FightingMatch(PLAYERS, rounds, new Arena(), rules);
  const facts: FightFact[] = [];
  m.facts.on((f) => facts.push(f));
  return { m, facts, rules };
}

/** Avanza con estas intenciones (golpe/salto solo el primer cuadro). */
function run(m: FightingMatch, seconds: number, a: Intent = NO_INTENT, b: Intent = NO_INTENT): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    m.step(DT, [a, b]);
    a = { ...a, attack: false, jump: false };
    b = { ...b, attack: false, jump: false };
  }
}

/** Hasta que empieza la pelea del round actual. */
function skipIntro(m: FightingMatch): void {
  for (let i = 0; i < 1000 && m.currentRound.phase === "intro"; i++) m.step(DT, [NO_INTENT, NO_INTENT]);
}

/** Hasta que arranca el round siguiente (o termina la pelea), sin controles. */
function untilNextRound(m: FightingMatch): void {
  const n = m.currentRound.number;
  for (let i = 0; i < 100_000 && !m.finished && m.currentRound.number === n; i++) m.step(DT, [NO_INTENT, NO_INTENT]);
}

/** Pone a los dos pegados (a 70 px de centro a centro) y mirándose. */
function closeIn(m: FightingMatch): void {
  const [a, b] = m.fighters;
  a.x = 450; b.x = 520;
  a.facing = 1; b.facing = -1;
}

/** Deja a un luchador con esa vida (golpes "de mentira") y lo espera a que se recupere. */
function setHealth(m: FightingMatch, i: 0 | 1, health: number): void {
  const f = m.fighters[i];
  if (f.health > health) f.receiveHit(f.health - health, f.x + (i === 0 ? 40 : -40));
  run(m, DEFAULT_RULES.hitstun + 0.1);
}

/** Ana gana el round por KO (con un puño a un Beto con 1 de vida). */
function anaKos(m: FightingMatch): void {
  skipIntro(m);
  setHealth(m, 1, 1);
  closeIn(m);
  run(m, 0.4, intent({ attack: true }));
  untilNextRound(m);
}

const kinds = (facts: FightFact[]) => facts.map((f) => f.kind);

describe("Round", () => {
  test("intro sin reloj, después el reloj corre; avisa cuando se acaba el tiempo", () => {
    const r = new Round(1, 2);
    expect(r.phase).toBe("intro");
    r.tick(INTRO_SECONDS);
    expect(r.phase).toBe("fight");
    expect(r.timeLeft).toBe(2);
    expect(r.tick(1.5)).toBe(false);
    expect(r.tick(0.6)).toBe(true);
    expect(r.timeLeft).toBe(0);
  });

  test("un solo resultado por round; después de un momento queda listo para seguir", () => {
    const r = new Round(1, 60);
    r.end({ kind: "draw", method: "timeout" });
    expect(r.phase).toBe("over");
    expect(() => r.end({ kind: "draw", method: "timeout" })).toThrow();
    expect(r.done).toBe(false);
    r.tick(OVER_SECONDS);
    expect(r.done).toBe(true);
  });

  test("KO, doble KO y tiempo", () => {
    const a = { playerId: "a", health: 30 }, b = { playerId: "b", health: 0 };
    expect(Round.byKnockout(a, b)).toEqual({ kind: "won", winner: "a", loser: "b", method: "ko", remainingHealth: 30 });
    expect(Round.byKnockout({ ...a, health: 0 }, b)).toEqual({ kind: "draw", method: "double_ko" });
    expect(Round.byKnockout(a, { ...b, health: 5 })).toBeNull();
    expect(Round.byTime(a, { ...b, health: 50 })).toMatchObject({ kind: "won", winner: "b", method: "timeout", remainingHealth: 50 });
    expect(Round.byTime(a, { ...b, health: 30 })).toEqual({ kind: "draw", method: "timeout" });
  });
});

describe("FightingMatch: golpes", () => {
  test("rounds solo 1, 3 o 5", () => {
    expect(() => new FightingMatch(PLAYERS, 2 as RoundsOption)).toThrow();
  });

  test("durante la presentación del round no hay controles", () => {
    const { m, facts } = setup();
    closeIn(m);
    run(m, INTRO_SECONDS - 0.1, intent({ attack: true }));
    expect(m.fighters[0].stateName).not.toBe("attack");
    expect(facts).toEqual([]);
  });

  test("un puño que conecta: le baja la vida y, si nadie lo sigue, sale como ATTACK al cerrarse la ventana del combo", () => {
    const { m, facts, rules } = setup();
    skipIntro(m);
    closeIn(m);
    run(m, 0.3, intent({ attack: true }));
    expect(m.fighters[1].health).toBe(93);
    expect(m.fighters[1].stateName).toBe("hit");
    expect(facts).toEqual([]); // en espera: puede ser el primero de un combo
    run(m, rules.config.comboWindow + 0.1);
    expect(facts).toEqual([{ kind: "attack", attacker: "ana", target: "beto", move: "punch", hit: true, damage: 7, round: 1 }]);
  });

  test("un golpe toca una sola vez aunque siga activo varios cuadros", () => {
    const { m, facts } = setup();
    skipIntro(m);
    closeIn(m);
    run(m, 0.5, intent({ attack: true, down: true }));
    run(m, 1);
    expect(facts).toEqual([{ kind: "attack", attacker: "ana", target: "beto", move: "kick", hit: true, damage: 11, round: 1 }]);
  });

  test("golpe al aire: ATTACK fallado con daño 0", () => {
    const { m, facts } = setup();
    skipIntro(m);
    run(m, 0.5, intent({ attack: true }));
    expect(facts).toEqual([{ kind: "attack", attacker: "ana", target: "beto", move: "punch", hit: false, damage: 0, round: 1 }]);
  });

  test("golpe bloqueado: ATTACK fallado del que pega y BLOCK del que bloquea", () => {
    const { m, facts } = setup();
    skipIntro(m);
    closeIn(m);
    run(m, 0.4, intent({ attack: true }), intent({ block: true }));
    expect(facts).toEqual([
      { kind: "attack", attacker: "ana", target: "beto", move: "punch", hit: false, damage: 0, round: 1 },
      { kind: "block", defender: "beto", attacker: "ana", round: 1 },
    ]);
    expect(m.fighters[1].health).toBe(100);
  });

  test("dos golpes seguidos: un solo COMBO con los golpes y el daño total (reemplaza a sus ATTACK)", () => {
    const { m, facts, rules } = setup();
    skipIntro(m);
    closeIn(m);
    run(m, rules.duration("punch") + DT, intent({ attack: true }));
    run(m, rules.duration("punch") + DT, intent({ attack: true }));
    expect(facts).toEqual([]);
    run(m, rules.config.comboWindow + 0.1);
    expect(facts).toEqual([{ kind: "combo", attacker: "ana", target: "beto", hits: 2, damage: 14, round: 1 }]);
  });

  test("un golpe fallado corta el combo: primero sale lo que estaba en espera", () => {
    const { m, facts, rules } = setup();
    skipIntro(m);
    closeIn(m);
    run(m, rules.duration("punch") + DT, intent({ attack: true }));
    m.fighters[1].x = 860; // Beto se aleja: el siguiente golpe va al aire
    run(m, rules.duration("punch") + DT, intent({ attack: true }));
    expect(facts.map((f) => (f.kind === "attack" ? f.hit : f.kind))).toEqual([true, false]);
  });

  test("un golpe recibido corta el combo del que lo recibe", () => {
    const { m, facts, rules } = setup();
    skipIntro(m);
    closeIn(m);
    run(m, rules.duration("punch") + DT, intent({ attack: true }));
    run(m, rules.duration("punch") + DT, intent({ attack: true }));
    // Beto se recupera y contesta antes de que se cierre la ventana: el combo de Ana sale en ese momento.
    run(m, 0.05);
    m.fighters[0].x = m.fighters[1].x - 70;
    run(m, 0.2, NO_INTENT, intent({ attack: true }));
    expect(facts).toEqual([{ kind: "combo", attacker: "ana", target: "beto", hits: 2, damage: 14, round: 1 }]);
    run(m, rules.config.comboWindow + 0.1);
    expect(facts.at(-1)).toMatchObject({ kind: "attack", attacker: "beto", hit: true });
  });
});

describe("FightingMatch: rounds", () => {
  test("KO: ATTACK, KNOCKDOWN y ROUND_WON con la vida del ganador", () => {
    const { m, facts } = setup();
    skipIntro(m);
    setHealth(m, 0, 60);
    setHealth(m, 1, 5);
    closeIn(m);
    run(m, 0.4, intent({ attack: true }));
    expect(facts.slice(-3)).toEqual([
      { kind: "attack", attacker: "ana", target: "beto", move: "punch", hit: true, damage: 5, round: 1 },
      { kind: "knockdown", attacker: "ana", target: "beto", round: 1 },
      { kind: "roundWon", winner: "ana", round: 1, remainingHealth: 60, method: "ko" },
    ]);
    expect(m.currentRound.phase).toBe("over");
    expect(m.winsOf("ana")).toBe(1);
  });

  test("el combo abierto sale antes del KO y del resultado", () => {
    const { m, facts, rules } = setup();
    skipIntro(m);
    setHealth(m, 1, 10);
    closeIn(m);
    run(m, rules.duration("punch") + DT, intent({ attack: true }));
    run(m, 0.3, intent({ attack: true }));
    expect(kinds(facts).slice(-3)).toEqual(["combo", "knockdown", "roundWon"]);
    expect(facts.find((f) => f.kind === "combo")).toMatchObject({ hits: 2, damage: 10 });
  });

  test("tiempo: gana el que tiene más vida", () => {
    const { m, facts } = setup(3, 2);
    skipIntro(m);
    setHealth(m, 0, 40);
    run(m, 2.1);
    expect(facts.at(-1)).toEqual({ kind: "roundWon", winner: "beto", round: 1, remainingHealth: 100, method: "timeout" });
  });

  test("tiempo con la misma vida: ROUND_DRAW y no suma para nadie", () => {
    const { m, facts } = setup(3, 2);
    skipIntro(m);
    run(m, 2.1);
    expect(facts.at(-1)).toEqual({ kind: "roundDraw", player: "ana", other: "beto", round: 1, method: "timeout" });
    expect([m.winsOf("ana"), m.winsOf("beto")]).toEqual([0, 0]);
  });

  test("doble KO: ROUND_DRAW double_ko", () => {
    const { m, facts } = setup();
    skipIntro(m);
    setHealth(m, 0, 3);
    setHealth(m, 1, 3);
    closeIn(m);
    run(m, 0.4, intent({ attack: true }), intent({ attack: true }));
    expect(kinds(facts).slice(-5)).toEqual(["attack", "attack", "knockdown", "knockdown", "roundDraw"]);
    expect(facts.at(-1)).toMatchObject({ method: "double_ko" });
  });

  test("entre rounds: vuelven a su lado con la vida llena", () => {
    const { m } = setup();
    anaKos(m);
    expect(m.currentRound.number).toBe(2);
    expect(m.fighters.map((f) => [f.health, f.stateName])).toEqual([[100, "idle"], [100, "idle"]]);
  });

  test("mejor de 3: el que llega a 2 gana y la pelea termina", () => {
    const { m, facts } = setup(3);
    anaKos(m);
    expect(m.finished).toBe(false);
    anaKos(m);
    expect(m.finished).toBe(true);
    expect(m.winner).toBe("ana");
    expect(facts.at(-1)).toEqual({ kind: "matchOver", winner: "ana" });
    expect(facts.filter((f) => f.kind === "roundWon").map((f) => (f as { round: number }).round)).toEqual([1, 2]);
  });

  test("mejor de 1: un round decide", () => {
    const { m } = setup(1);
    anaKos(m);
    expect(m.finished).toBe(true);
    expect(m.winner).toBe("ana");
  });

  test("mejor de 5 con 3 empates: se juegan los 5 y gana el que ganó más", () => {
    const { m, facts } = setup(5, 2);
    for (let i = 0; i < 3; i++) untilNextRound(m); // 3 empates por tiempo
    expect(m.currentRound.number).toBe(4);
    anaKos(m);
    expect(m.finished).toBe(false);
    untilNextRound(m); // round 5: empate
    expect(m.finished).toBe(true);
    expect(m.winner).toBe("ana");
    expect(facts.filter((f) => f.kind === "roundDraw")).toHaveLength(4);
  });

  test("mejor de 1 empatado: la pelea termina sin ganador", () => {
    const { m, facts } = setup(1, 1);
    untilNextRound(m);
    expect(m.finished).toBe(true);
    expect(m.winner).toBeNull();
    expect(facts.at(-1)).toEqual({ kind: "matchOver", winner: null });
  });

  test("después de terminar ya no hay hechos", () => {
    const { m, facts } = setup(1);
    anaKos(m);
    const n = facts.length;
    closeIn(m);
    run(m, 3, intent({ attack: true }), intent({ attack: true }));
    expect(facts).toHaveLength(n);
  });
});
