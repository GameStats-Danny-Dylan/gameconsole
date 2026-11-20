/**
 * FightingMatch — la pelea completa, sin DOM ni reloj propio: dos luchadores,
 * la arena, las reglas y los rounds al mejor de N. Avanza con step(dt, intents)
 * y cuenta lo que pasa como hechos (patrón Observer: `facts`), uno por golpe,
 * bloqueo, combo, derribo o round. Nunca un hecho por cuadro.
 *
 * Un golpe que conecta sale como ATTACK, o como parte de un COMBO si lo
 * siguen otros (ver "Golpes que conectan y combos").
 *
 * Un round termina por KO (vida en 0) o por tiempo; con los dos en 0 a la vez,
 * o con la misma vida al acabarse el tiempo, es empate y no suma para nadie.
 * La pelea termina cuando alguien llega a la mayoría de los rounds o cuando se
 * jugaron todos; en ese caso gana el que ganó más (igual que GameStats) y, si
 * empatan, no hay ganador.
 */
import { Arena } from "./Arena";
import { CombatRules, type Move } from "./CombatRules";
import type { Fighter } from "./fighter/Fighter";
import { FighterFactory, type Contender } from "./fighter/FighterFactory";
import { NO_INTENT, type Intent } from "./fighter/Intent";
import { Round, type RoundResult } from "./Round";
import { Emitter } from "../util/Emitter";

export const ROUND_OPTIONS = [1, 3, 5] as const;
export type RoundsOption = (typeof ROUND_OPTIONS)[number];

/** Lo que pasa en la pelea, en términos del juego (el adapter lo traduce para GameStats). */
export type FightFact =
  | { kind: "attack"; attacker: string; target: string; move: Move; hit: boolean; damage: number; round: number }
  | { kind: "block"; defender: string; attacker: string; round: number }
  | { kind: "combo"; attacker: string; target: string; hits: number; damage: number; round: number }
  | { kind: "knockdown"; attacker: string; target: string; round: number }
  | { kind: "roundWon"; winner: string; round: number; remainingHealth: number; method: "ko" | "timeout" }
  | { kind: "roundDraw"; player: string; other: string; round: number; method: "double_ko" | "timeout" }
  | { kind: "matchOver"; winner: string | null };

/** Golpes conectados de un jugador que todavía pueden ser combo. */
interface Chain {
  target: string;
  /** El primer golpe (si queda solo, es el ATTACK). */
  move: Move;
  hits: number;
  damage: number;
  lastAt: number;
}

export class FightingMatch {
  readonly facts = new Emitter<FightFact>();
  readonly fighters: readonly [Fighter, Fighter];
  readonly roundsToWin: number;

  private round: Round;
  private readonly wins = new Map<string, number>();
  private readonly chains = new Map<string, Chain>();
  private readonly results: RoundResult[] = [];
  private time = 0;
  private over = false;
  private champion: string | null = null;

  constructor(
    players: readonly Contender[],
    readonly rounds: RoundsOption = 3,
    readonly arena = new Arena(),
    readonly rules = new CombatRules(),
  ) {
    if (!ROUND_OPTIONS.includes(rounds)) throw new Error(`rounds debe ser 1, 3 o 5 (llegó ${String(rounds)})`);
    this.fighters = new FighterFactory(arena, rules).createPair(players);
    this.roundsToWin = CombatRules.roundsToWin(rounds);
    for (const f of this.fighters) this.wins.set(f.playerId, 0);
    this.round = new Round(1, rules.config.roundSeconds);
  }

  // ------------------------------------------------------------------
  // Lectura (para la vista y las pruebas)
  // ------------------------------------------------------------------

  get currentRound(): Round { return this.round; }
  get finished(): boolean { return this.over; }
  /** Ganador de la pelea (null si no terminó o si terminó empatada). */
  get winner(): string | null { return this.champion; }
  get roundResults(): readonly RoundResult[] { return this.results; }
  winsOf(playerId: string): number { return this.wins.get(playerId) ?? 0; }

  // ------------------------------------------------------------------
  // Paso
  // ------------------------------------------------------------------

  /** Avanza dt segundos. intents: la intención de cada luchador (en orden de slot). */
  step(dt: number, intents: readonly [Intent, Intent]): void {
    if (dt <= 0) return;
    const timeUp = this.round.tick(dt);

    if (this.round.phase !== "fight") {
      // Sin controles: en la presentación del round y mientras se ve el resultado.
      for (const f of this.fighters) f.update(NO_INTENT, dt);
      this.drainWhiffs();
      if (this.round.done && !this.over) this.nextRound();
      return;
    }

    this.time += dt;
    this.fighters[0].update(intents[0], dt);
    this.fighters[1].update(intents[1], dt);
    this.separate();
    this.fighters[0].faceToward(this.fighters[1].x);
    this.fighters[1].faceToward(this.fighters[0].x);

    this.drainWhiffs();
    this.resolveHits();
    this.expireChains();

    const [a, b] = this.fighters;
    const ko = Round.byKnockout(a, b);
    if (ko) this.endRound(ko);
    else if (timeUp) this.endRound(Round.byTime(a, b));
  }

  // ------------------------------------------------------------------
  // Golpes
  // ------------------------------------------------------------------

  /** Los golpes que conectan en este paso. Se calculan todos antes de aplicarlos (dos a la vez pueden dar doble KO). */
  private resolveHits(): void {
    const [a, b] = this.fighters;
    const pending = ([[a, b], [b, a]] as const).flatMap(([att, def]) => {
      const box = att.activeAttackBox();
      const move = att.attack?.move;
      if (!box || !move || !def.vulnerable || !box.intersects(def.body)) return [];
      return [{ att, def, move, outcome: this.rules.resolve(move, att, def) }];
    });
    for (const p of pending) p.att.markConnected();

    const round = this.round.number;
    for (const { att, def, move, outcome } of pending) {
      if (outcome.kind === "blocked") {
        def.receiveBlock(att.x);
        this.flushChain(att.playerId); // un golpe bloqueado corta el combo (sale antes, en orden)
        this.emit({ kind: "attack", attacker: att.playerId, target: def.playerId, move, hit: false, damage: 0, round });
        this.emit({ kind: "block", defender: def.playerId, attacker: att.playerId, round });
        continue;
      }
      def.receiveHit(outcome.damage, att.x);
      this.flushChain(def.playerId); // al que le pegan se le corta el combo
      this.extendChain(att.playerId, def.playerId, move, outcome.damage);
    }
  }

  /** Golpes que terminaron sin tocar a nadie: ATTACK fallado. */
  private drainWhiffs(): void {
    for (const f of this.fighters) {
      for (const s of f.drainSignals()) {
        if (s.kind !== "whiff" || this.round.phase !== "fight") continue;
        const target = this.rival(f).playerId;
        this.flushChain(f.playerId); // fallar corta el combo
        this.emit({ kind: "attack", attacker: f.playerId, target, move: s.move, hit: false, damage: 0, round: this.round.number });
      }
    }
  }

  // ------------------------------------------------------------------
  // Golpes que conectan y combos.
  //
  // Como en el contrato de GameStats (fixture fighting_match_ok.json), un
  // COMBO reemplaza a los ATTACK de sus golpes: la suma del daño de los ATTACK
  // y los COMBO de un round es la vida que se quitó. Por eso un golpe que
  // conecta queda en espera mientras dura la ventana del combo: si no lo sigue
  // otro, sale como ATTACK; si lo siguen (cada uno a menos de comboWindow del
  // anterior), sale un solo COMBO con todos.
  // ------------------------------------------------------------------

  private extendChain(attacker: string, target: string, move: Move, damage: number): void {
    const c = this.chains.get(attacker);
    if (c && this.time - c.lastAt <= this.rules.config.comboWindow) {
      c.hits++;
      c.damage += damage;
      c.lastAt = this.time;
      return;
    }
    this.flushChain(attacker);
    this.chains.set(attacker, { target, move, hits: 1, damage, lastAt: this.time });
  }

  private expireChains(): void {
    for (const [attacker, c] of [...this.chains])
      if (this.time - c.lastAt > this.rules.config.comboWindow) this.flushChain(attacker);
  }

  /** Cierra los golpes en espera de ese jugador: uno solo es un ATTACK; 2 o más, un COMBO. */
  private flushChain(attacker: string): void {
    const c = this.chains.get(attacker);
    if (!c) return;
    this.chains.delete(attacker);
    const round = this.round.number;
    if (c.hits === 1)
      this.emit({ kind: "attack", attacker, target: c.target, move: c.move, hit: true, damage: c.damage, round });
    else
      this.emit({ kind: "combo", attacker, target: c.target, hits: c.hits, damage: c.damage, round });
  }

  // ------------------------------------------------------------------
  // Rounds
  // ------------------------------------------------------------------

  private endRound(result: RoundResult): void {
    const n = this.round.number;
    // Los golpes en espera salen antes del resultado (después del round que decide, ya no se aceptan acciones).
    for (const f of this.fighters) this.flushChain(f.playerId);
    for (const f of this.fighters)
      if (f.knockedOut) this.emit({ kind: "knockdown", attacker: this.rival(f).playerId, target: f.playerId, round: n });

    this.round.end(result);
    this.results.push(result);
    if (result.kind === "won") {
      this.wins.set(result.winner, this.winsOf(result.winner) + 1);
      this.emit({ kind: "roundWon", winner: result.winner, round: n, remainingHealth: result.remainingHealth, method: result.method });
    } else {
      const [a, b] = this.fighters;
      this.emit({ kind: "roundDraw", player: a.playerId, other: b.playerId, round: n, method: result.method });
    }

    const leader = this.fighters.find((f) => this.winsOf(f.playerId) >= this.roundsToWin);
    if (leader) return this.finish(leader.playerId);
    if (n >= this.rounds) {
      const [a, b] = this.fighters.map((f) => this.winsOf(f.playerId));
      this.finish(a === b ? null : a > b ? this.fighters[0].playerId : this.fighters[1].playerId);
    }
  }

  private finish(winner: string | null): void {
    this.over = true;
    this.champion = winner;
    this.emit({ kind: "matchOver", winner });
  }

  private nextRound(): void {
    this.round = new Round(this.round.number + 1, this.rules.config.roundSeconds);
    this.chains.clear();
    for (const f of this.fighters) f.resetForRound();
  }

  /**
   * Manda los golpes en espera (por ejemplo, al cerrar la partida a la mitad).
   * Solo mientras se pelea: después de un resultado ya no queda ninguno.
   */
  flushAll(): void {
    if (this.over || this.round.phase !== "fight") return;
    for (const f of this.fighters) this.flushChain(f.playerId);
  }

  // ------------------------------------------------------------------

  private rival(f: Fighter): Fighter {
    return f === this.fighters[0] ? this.fighters[1] : this.fighters[0];
  }

  /** Los cuerpos no se atraviesan: si se pisan, se separan por mitades. */
  private separate(): void {
    const [a, b] = this.fighters;
    const ab = a.body, bb = b.body;
    if (!ab.intersects(bb)) return;
    const overlap = Math.min(ab.right, bb.right) - Math.max(ab.left, bb.left);
    const aLeft = a.x < b.x || (a.x === b.x && a.side === "left");
    const half = overlap / 2;
    a.x = this.arena.clampX(a.x + (aLeft ? -half : half), a.physics.width);
    b.x = this.arena.clampX(b.x + (aLeft ? half : -half), b.physics.width);
    // Contra la pared: el que quedó trabado empuja al otro lo que falte.
    const still = Math.min(a.body.right, b.body.right) - Math.max(a.body.left, b.body.left);
    if (still > 0 && a.body.intersects(b.body)) {
      if (aLeft) b.x = this.arena.clampX(a.x + a.physics.width, b.physics.width);
      else a.x = this.arena.clampX(b.x + b.physics.width, a.physics.width);
    }
  }

  private emit(f: FightFact): void { this.facts.emit(f); }
}
