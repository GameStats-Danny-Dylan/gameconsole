/**
 * Connect4Game — el controlador de una partida: une las reglas (Connect4Match),
 * la IA (MoveStrategy), la vista (Connect4View) y la consola (GameHost).
 *
 * Sigue el ciclo de vida del protocolo (sección 4, patrón State):
 *   loading ──init──► ready ──start──► playing ⇄ paused ──► finished
 * Cada mensaje de la consola solo vale en ciertos estados; en otro, se ignora.
 *
 * Cuando el SDK de la consola esté listo, una clase que herede de GameApp solo
 * tiene que llamar a init / start / pause / resume / stop de esta clase.
 */
import { GameStatsAdapter, type Difficulty } from "../adapter/GameStatsAdapter";
import type { AiDecision, MoveStrategy } from "../ai/MoveStrategy";
import type { Color } from "../domain/Board";
import { Connect4Match, type AiInfo, type Seat } from "../domain/Connect4Match";
import type {
  Connect4View, GameHost, MatchContext, PauseReason, PlayerInfo, Status, StopReason, ViewModel,
} from "./ports";

export const HINTS_PER_MATCH = 3;
export const RETRY_MS = 3_000;
const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];

export class Connect4Game {
  private status: Status = "loading";
  private ctx!: MatchContext;
  private match!: Connect4Match;
  private readonly adapter = new GameStatsAdapter();

  private difficulty: Difficulty = "medium";
  private turnSeconds = 0;

  private turn = 0;                                // sube con cada turno: invalida respuestas viejas de la IA
  private thinking = false;
  private request: AbortController | null = null;
  private pendingCpu: AiDecision | null = null;    // jugada de la IA que llegó durante una pausa
  private retry: ReturnType<typeof setTimeout> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private timeLeft: number | null = null;
  private hintColumn: number | null = null;
  private hintsLeft = HINTS_PER_MATCH;
  private message: string | null = null;

  constructor(
    private readonly host: GameHost,
    private readonly view: Connect4View,
    private readonly strategy: MoveStrategy,
  ) {}

  get state(): Status { return this.status; }

  // ------------------------------------------------------------------
  // Mensajes de la consola
  // ------------------------------------------------------------------

  /** INIT: arma la partida. Lanza un error si el contexto no sirve para el 4 en línea. */
  init(ctx: MatchContext): void {
    if (this.status !== "loading") return;
    this.ctx = ctx;
    this.difficulty = DIFFICULTIES.includes(ctx.options.difficulty as Difficulty)
      ? (ctx.options.difficulty as Difficulty) : "medium";
    const seconds = Number(ctx.options.turnSeconds ?? 0);
    this.turnSeconds = Number.isInteger(seconds) && seconds > 0 ? seconds : 0;

    this.match = new Connect4Match(seatsFor(ctx));
    // Observer: cada hecho de la partida se traduce (Adapter) y se manda a la consola.
    this.match.facts.on((fact) => {
      const event = this.adapter.fromFact(fact);
      if (event) this.host.emit(event);
    });
    this.view.bind({
      column: (c) => this.onColumn(c),
      hint: () => this.onHint(),
      undo: () => this.onUndo(),
    });
    this.status = "ready";
    this.render();
  }

  /** START: MATCH_STARTED, un PLAYER_JOINED por jugador (el slot 1 primero: empieza) y a jugar. */
  start(): void {
    if (this.status !== "ready") return;
    this.status = "playing";
    const options: Record<string, unknown> = { turnSeconds: this.turnSeconds };
    if (this.ctx.mode === "vs-cpu") options.difficulty = this.difficulty;
    this.host.emit(this.adapter.matchStarted(this.ctx.mode, options));
    for (const seat of this.match.seats)
      this.host.emit(this.adapter.playerJoined(seat, seat.kind === "cpu" ? this.difficulty : undefined));
    this.nextTurn();
  }

  pause(reason: PauseReason = "user"): void {
    if (this.status !== "playing") return;
    this.status = "paused";
    this.stopTimer();
    this.host.emit(this.adapter.paused(reason));
    this.render();
  }

  resume(): void {
    if (this.status !== "paused") return;
    this.status = "playing";
    this.host.emit(this.adapter.resumed());
    if (this.pendingCpu) {
      const decision = this.pendingCpu;
      this.pendingCpu = null;
      this.play(decision.column, decision);
      return;
    }
    if (this.match.current.kind === "cpu" && !this.thinking) this.think();
    else if (this.timeLeft !== null) this.startTimer(this.timeLeft);
    this.render();
  }

  /** STOP: si la partida empezó, PLAYER_LEFT de cada persona y MATCH_FINISHED. */
  stop(_reason: StopReason = "user"): void {
    if (this.status === "ready") {
      this.status = "finished";
      this.render();
      this.host.finish(null, "stopped");
      return;
    }
    if (this.status !== "playing" && this.status !== "paused") return;
    this.cancelTurn();
    this.status = "finished";
    for (const seat of this.match.seats)
      if (seat.kind === "human") this.host.emit(this.adapter.playerLeft(seat));
    this.host.emit(this.adapter.matchFinished("stopped"));
    this.message = "Partida cerrada";
    this.render();
    this.host.finish(null, "stopped");
  }

  // ------------------------------------------------------------------
  // Lo que hace el jugador (desde la vista)
  // ------------------------------------------------------------------

  private onColumn(column: number): void {
    if (!this.canPlay() || !this.match.board.canDrop(column)) return;
    this.play(column);
  }

  private onHint(): void {
    if (!this.canHint()) return;
    const turn = this.turn;
    const seat = this.match.current;
    this.thinking = true;
    this.render();
    this.ask(seat.color, "hard")                    // la pista es la mejor jugada que conoce la IA
      .then((d) => {
        if (turn !== this.turn) return;
        this.thinking = false;
        if (this.status === "playing") {
          this.match.hint(d.column);
          this.hintColumn = d.column;
          this.hintsLeft--;
        }
        this.render();
      })
      .catch(() => {
        if (turn !== this.turn) return;
        this.thinking = false;
        this.message = "No se pudo pedir la pista";
        this.render();
      });
  }

  private onUndo(): void {
    if (!this.canUndo()) return;
    this.match.undo(this.match.current.playerId);
    this.message = null;
    this.nextTurn();
  }

  // ------------------------------------------------------------------
  // Turnos
  // ------------------------------------------------------------------

  private play(column: number, ai?: AiDecision): void {
    const info: AiInfo | undefined = ai && {
      engine: ai.engine, depth: ai.depth, score: ai.score, nodes: ai.nodes, ms: ai.ms,
    };
    this.match.drop(column, info);
    this.message = null;
    this.nextTurn();
  }

  private nextTurn(): void {
    this.cancelTurn();
    this.timeLeft = null;
    this.hintColumn = null;
    if (this.match.finished) return this.end();
    if (this.status !== "playing") return this.render();
    if (this.match.current.kind === "cpu") this.think();
    else if (this.turnSeconds > 0) this.startTimer(this.turnSeconds);
    this.render();
  }

  /** Turno de la computadora: le pregunta a la IA (sin bloquear la página). */
  private think(): void {
    this.clearRetry();
    const turn = this.turn;
    this.thinking = true;
    this.render();
    this.ask(this.match.current.color, this.difficulty)
      .then((decision) => {
        if (turn !== this.turn) return;           // la respuesta es de un turno que ya pasó
        this.thinking = false;
        if (this.status === "paused") { this.pendingCpu = decision; return this.render(); }
        if (this.status === "playing") this.play(decision.column, decision);
      })
      .catch((err: Error) => {
        if (turn !== this.turn || err.name === "AbortError") return;
        this.thinking = false;
        this.message = "La computadora no responde; se vuelve a intentar en unos segundos…";
        this.host.error(`IA: ${err.message}`, false);
        this.render();
        this.retry = setTimeout(() => {
          this.retry = null;
          if (turn === this.turn && this.status === "playing" && !this.thinking) this.think();
        }, RETRY_MS);
      });
  }

  private ask(color: Color, difficulty: Difficulty): Promise<AiDecision> {
    this.request?.abort();
    this.request = new AbortController();
    return this.strategy.choose(this.match.board, color, difficulty, this.request.signal);
  }

  private end(): void {
    this.status = "finished";
    this.host.emit(this.adapter.matchFinished("normal"));
    this.render();
    this.host.finish(this.match.winner?.playerId ?? null, "normal");
  }

  /** Corta todo lo pendiente del turno actual (IA, reloj, reintento). */
  private cancelTurn(): void {
    this.turn++;
    this.request?.abort();
    this.request = null;
    this.thinking = false;
    this.pendingCpu = null;
    this.clearRetry();
    this.stopTimer();
  }

  private startTimer(seconds: number): void {
    this.stopTimer();
    this.timeLeft = seconds;
    this.timer = setInterval(() => {
      if (this.timeLeft === null) return;
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        this.stopTimer();
        this.match.timeout(this.turnSeconds);
        this.message = `${this.match.seats.find((s) => s !== this.match.current)?.name ?? ""} perdió el turno por tiempo`;
        this.nextTurn();
        return;
      }
      this.render();
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private clearRetry(): void {
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
  }

  // ------------------------------------------------------------------
  // Vista
  // ------------------------------------------------------------------

  private canPlay(): boolean {
    return this.status === "playing" && !this.thinking && this.match.current.kind === "human";
  }

  private canHint(): boolean {
    return this.canPlay() && this.hintsLeft > 0 && this.hintColumn === null;
  }

  private canUndo(): boolean {
    return this.status === "playing" && !this.thinking && this.match.canUndo(this.match.current.playerId);
  }

  private render(): void {
    const m = this.match;
    const vm: ViewModel = {
      board: m.board,
      seats: m.seats,
      current: m.finished ? null : m.current,
      status: this.status,
      thinking: this.thinking,
      winner: m.winner,
      draw: m.isDraw,
      winningCells: m.winningCells,
      lastCell: m.lastCell,
      hintColumn: this.hintColumn,
      hintsLeft: this.hintsLeft,
      canPlay: this.canPlay(),
      canHint: this.canHint(),
      canUndo: this.canUndo(),
      showUndo: this.ctx.mode === "vs-cpu",
      timeLeft: this.timeLeft,
      message: this.message,
      difficulty: this.ctx.mode === "vs-cpu" ? this.difficulty : null,
    };
    this.view.render(vm);
  }
}

/** Jugadores del contexto -> asientos. Slot 1 = rojo (empieza), slot 2 = amarillo. */
export function seatsFor(ctx: MatchContext): [Seat, Seat] {
  const players: PlayerInfo[] = [...ctx.players].sort((a, b) => a.slot - b.slot);
  if (ctx.mode === "vs-cpu" && !players.some((p) => p.kind === "cpu"))
    players.push({ playerId: "cpu", name: "Computadora", kind: "cpu", slot: 2 });
  if (players.length !== 2) throw new Error("el 4 en línea es de 2 jugadores");
  const humans = players.filter((p) => p.kind === "human").length;
  if (ctx.mode === "vs-cpu" && humans !== 1) throw new Error("vs-cpu: una persona contra la computadora");
  if (ctx.mode === "local-2p" && humans !== 2) throw new Error("local-2p: dos personas");
  const colors: Color[] = ["red", "yellow"];
  return players.map((p, i) => ({
    playerId: p.playerId, name: p.name, kind: p.kind, color: colors[i],
  })) as [Seat, Seat];
}
