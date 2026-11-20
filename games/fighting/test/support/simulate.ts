/**
 * Simula peleas completas con el mismo código que usa el juego (FightingGame,
 * FightingMatch, GameStatsAdapter y el sellado del SDK), con dos "jugadores"
 * al azar con semilla: se acercan, golpean, patean, saltan y bloquean; además
 * hay pausas y cierres a mitad de pelea. Devuelve los eventos tal como
 * llegarían a GameStats.
 */
import type { ContractEvent } from "@gameconsole/sdk";
import type { Fighter } from "../../src/domain/fighter/Fighter";
import { intent, type Intent } from "../../src/domain/fighter/Intent";
import { FightingGame } from "../../src/game/FightingGame";
import type { ControlStrategy } from "../../src/input/ControlScheme";
import { FakeInput, FakeView, ManualFrames, StampHost } from "./fakes";

/** Generador pseudoaleatorio con semilla (mulberry32): mismas peleas en cada corrida. */
export function rng(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Un jugador al azar (otra estrategia de controles: no lee teclas, mira la pelea). */
export class RandomBot implements ControlStrategy {
  private blockFor = 0;
  private passiveFor = 0;

  constructor(private readonly rand: () => number, private readonly me: () => Fighter, private readonly foe: () => Fighter,
              private readonly aggression = 0.12) {}

  read(): Intent {
    const me = this.me(), foe = this.foe();
    const d = foe.x - me.x, dist = Math.abs(d);
    const toward: -1 | 1 = d >= 0 ? 1 : -1;
    const r = this.rand();
    if (this.passiveFor > 0) { this.passiveFor--; return intent({ move: r < 0.5 ? -toward as -1 | 1 : 0 }); }
    if (this.blockFor > 0) { this.blockFor--; return intent({ block: true }); }
    if (r < 0.004) this.passiveFor = 30 + Math.floor(this.rand() * 90); // se aleja un rato (rounds que llegan al tiempo)
    if (dist > 150) return intent({ move: toward, jump: r < 0.01 });
    if (r < this.aggression) return intent({ attack: true, down: this.rand() < 0.4 });
    if (r < this.aggression + 0.03) { this.blockFor = 10 + Math.floor(this.rand() * 30); return intent({ block: true }); }
    if (r < this.aggression + 0.04) return intent({ jump: true, move: toward });
    return intent({ move: r < 0.6 ? toward : 0 });
  }
}

export interface Simulated {
  events: ContractEvent[];
  winner: string | null;
  stopped: boolean;
  finishes: { winner: string | null; reason: string }[];
}

export function simulate(seed: number, rounds: 1 | 3 | 5, matchId = `fighting-sim-${rounds}-${seed}`): Simulated {
  const rand = rng(seed);
  let clock = Date.parse("2026-11-19T12:00:00Z");
  const host = new StampHost(matchId, () => (clock += 1 + Math.floor(rand() * 40)));
  const frames = new ManualFrames();
  const game = new FightingGame(host, new FakeView(), new FakeInput(), frames);

  const me = (i: 0 | 1) => () => game.fight.fighters[i];
  // Algunas peleas son "pasivas": nadie pega y los rounds terminan empatados por tiempo.
  const aggression = () => (passive ? 0 : 0.08 + rand() * 0.1);
  const passive = rand() < 0.08;
  const bots: [ControlStrategy, ControlStrategy] = [
    new RandomBot(rand, me(0), me(1), aggression()),
    new RandomBot(rand, me(1), me(0), aggression()),
  ];
  game.init({
    gameId: "fighting", matchId, mode: "local-2p",
    players: [
      { playerId: "ana", name: "Ana", kind: "human", slot: 1 },
      { playerId: "beto", name: "Beto", kind: "human", slot: 2 },
    ],
    options: { rounds },
  }, bots);
  game.start();

  // Algunas peleas se cierran a la mitad.
  const stopAt = rand() < 0.15 ? Math.floor(rand() * 60 * 25) : Infinity;
  let frame = 0;
  while (game.state === "playing" || game.state === "paused") {
    if (frame++ >= stopAt) { game.stop("closed"); break; }
    if (rand() < 0.0008) { game.pause(rand() < 0.5 ? "user" : "hidden"); game.resume(); }
    // Cuadros de duración variable (como en un navegador real), a veces largos.
    frames.tick(rand() < 0.02 ? 120 : 1000 / (50 + rand() * 30));
    if (frame > 60 * 60 * 30) throw new Error(`semilla ${seed}: la pelea no termina`);
  }
  return {
    events: host.events,
    winner: game.fight.winner,
    stopped: game.state === "finished" && host.finished[0]?.reason === "stopped",
    finishes: host.finished,
  };
}
