/**
 * Round — un round de la pelea: su número, el reloj y en qué fase está.
 *
 *   intro ("Round N" / "¡Pelea!", sin controles) ──► fight ──KO o tiempo──► over
 *
 * La fase "over" dura un momento (para ver el KO) y después la pelea arma el
 * round siguiente o termina. El reloj solo corre en "fight".
 */
export type RoundPhase = "intro" | "fight" | "over";

export type RoundResult =
  | { kind: "won"; winner: string; loser: string; method: "ko" | "timeout"; remainingHealth: number }
  | { kind: "draw"; method: "double_ko" | "timeout" };

export const INTRO_SECONDS = 1.6;
export const OVER_SECONDS = 2.4;

export class Round {
  private phaseTime = 0;
  private clock: number;
  private current: RoundPhase = "intro";
  private outcome: RoundResult | null = null;

  constructor(
    readonly number: number,
    readonly seconds: number,
    private readonly introSeconds = INTRO_SECONDS,
    private readonly overSeconds = OVER_SECONDS,
  ) {
    this.clock = seconds;
  }

  get phase(): RoundPhase { return this.current; }
  get timeLeft(): number { return Math.max(0, this.clock); }
  get result(): RoundResult | null { return this.outcome; }
  /** Segundos en la fase actual (para las animaciones de los carteles). */
  get elapsedInPhase(): number { return this.phaseTime; }
  /** Ya pasó el momento de ver el resultado: se puede seguir. */
  get done(): boolean { return this.current === "over" && this.phaseTime >= this.overSeconds; }

  /** Avanza el reloj. Devuelve true en el paso en que se acabó el tiempo. */
  tick(dt: number): boolean {
    this.phaseTime += dt;
    if (this.current === "intro" && this.phaseTime >= this.introSeconds) {
      this.current = "fight";
      this.phaseTime = 0;
      return false;
    }
    if (this.current !== "fight") return false;
    this.clock -= dt;
    return this.clock <= 0;
  }

  /** Cierra el round con su resultado. Un round tiene un solo resultado. */
  end(result: RoundResult): void {
    if (this.outcome) throw new Error(`el round ${this.number} ya tiene resultado`);
    this.outcome = result;
    this.current = "over";
    this.phaseTime = 0;
  }

  /**
   * Resultado por KO: los dos en 0 a la vez es doble KO (empate). Si nadie
   * está en 0, null.
   */
  static byKnockout(a: { playerId: string; health: number }, b: { playerId: string; health: number }): RoundResult | null {
    if (a.health === 0 && b.health === 0) return { kind: "draw", method: "double_ko" };
    if (b.health === 0) return { kind: "won", winner: a.playerId, loser: b.playerId, method: "ko", remainingHealth: a.health };
    if (a.health === 0) return { kind: "won", winner: b.playerId, loser: a.playerId, method: "ko", remainingHealth: b.health };
    return null;
  }

  /** Resultado por tiempo: gana el que tiene más vida; con la misma vida, empate. */
  static byTime(a: { playerId: string; health: number }, b: { playerId: string; health: number }): RoundResult {
    if (a.health === b.health) return { kind: "draw", method: "timeout" };
    const [w, l] = a.health > b.health ? [a, b] : [b, a];
    return { kind: "won", winner: w.playerId, loser: l.playerId, method: "timeout", remainingHealth: w.health };
  }
}
