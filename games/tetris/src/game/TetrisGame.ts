/**
 * TetrisGame — las reglas y el ciclo de una partida de un jugador.
 *
 * No sabe del SDK, del DOM ni de GameStats: recibe el tiempo con update(dt)
 * (tiempo delta, en ms) y las acciones del jugador como métodos, y publica
 * hechos por `facts` (patrón Observer). Quien quiera dibujarla o contarla se
 * suscribe; la caída automática por gravedad NO publica nada (protocolo,
 * "nada de eventos por frame"): solo las acciones del jugador y sus consecuencias.
 *
 * Estados (State): ready → playing ⇄ paused → over | stopped.
 */
import { Board, type Cell } from "../domain/Board";
import type { Fact } from "../domain/facts";
import { PieceBag, type Random } from "../domain/PieceBag";
import { Level, Scoring } from "../domain/Scoring";
import { Piece, type PieceType, type Point, type RotationDirection } from "../domain/Tetromino";
import { Emitter } from "../util/Emitter";

export type Status = "ready" | "playing" | "paused" | "over" | "stopped";

/** Tiempo que una pieza apoyada puede esperar antes de fijarse, y cuántas veces se reinicia al moverla. */
export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;
/** Un cuadro muy largo (pestaña dormida) no hace caer la pieza de golpe. */
const MAX_STEPS_PER_UPDATE = 40;
const NEXT_COUNT = 3;

/** Intentos al rotar: en su lugar y empujada hacia abajo (la I recién aparecida), a los lados o hacia arriba (wall kicks simples). */
const KICKS: readonly (readonly [number, number])[] = [[0, 0], [0, 1], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0]];

export interface GameOptions {
  startLevel?: number;
  random?: Random;
  /** Para pruebas: una bolsa con piezas conocidas y un tablero ya armado. */
  bag?: PieceBag;
  board?: Board;
}

/** Todo lo que la vista necesita para dibujar. */
export interface Snapshot {
  status: Status;
  board: readonly (readonly Cell[])[];
  piece: Point[];
  pieceType: PieceType | null;
  ghost: Point[];
  next: PieceType[];
  hold: PieceType | null;
  score: number;
  level: number;
  lines: number;
}

export class TetrisGame {
  /** Observer: los hechos de la partida. */
  readonly facts = new Emitter<Fact>();

  private readonly board: Board;
  private readonly bag: PieceBag;
  private readonly scoring = new Scoring();
  private readonly level: Level;

  private _status: Status = "ready";
  private current: Piece | null = null;
  private held: PieceType | null = null;
  private holdUsed = false;

  private gravityMs = 0;
  private lockMs = 0;
  private lockResets = 0;
  private softCells = 0;
  private lastWasRotation = false;
  private lastHeight = 0;

  constructor(options: GameOptions = {}) {
    this.level = new Level(clampLevel(options.startLevel ?? 1));
    this.bag = options.bag ?? new PieceBag(options.random);
    this.board = options.board ?? new Board();
  }

  get status(): Status { return this._status; }
  get startLevel(): number { return this.level.startLevel; }

  // ------------------------------------------------------------------
  // Ciclo de vida
  // ------------------------------------------------------------------

  start(): void {
    if (this._status !== "ready") return;
    this._status = "playing";
    this.spawn(this.bag.next());
  }

  pause(): void {
    if (this._status === "playing") this._status = "paused";
  }

  resume(): void {
    if (this._status === "paused") this._status = "playing";
  }

  /** La persona cerró la partida: queda detenida, sin más hechos. */
  stop(): void {
    if (this._status !== "over") this._status = "stopped";
  }

  /** Avanza el tiempo: gravedad y retraso de fijado. Solo cuenta en "playing". */
  update(dtMs: number): void {
    if (this._status !== "playing" || !this.current || dtMs <= 0) return;
    this.gravityMs += dtMs;
    const interval = this.level.gravityMs;
    for (let steps = 0; this.gravityMs >= interval && steps < MAX_STEPS_PER_UPDATE; steps++) {
      this.gravityMs -= interval;
      if (!this.tryShift(0, 1)) { this.gravityMs = 0; break; }
      this.lastWasRotation = false;
    }
    if (this.isGrounded()) {
      this.lockMs += dtMs;
      if (this.lockMs >= LOCK_DELAY_MS) this.lockCurrent(false);
    } else {
      this.lockMs = 0;
    }
  }

  // ------------------------------------------------------------------
  // Acciones del jugador
  // ------------------------------------------------------------------

  move(direction: "left" | "right"): boolean {
    if (!this.canAct()) return false;
    if (!this.tryShift(direction === "left" ? -1 : 1, 0)) return false;
    this.lastWasRotation = false;
    this.touched();
    this.facts.emit({ kind: "moved", direction });
    return true;
  }

  rotate(direction: RotationDirection): boolean {
    if (!this.canAct() || !this.current!.rotates) return false;
    const turned = this.current!.rotated(direction);
    for (const [dx, dy] of KICKS) {
      const candidate = turned.moved(dx, dy);
      if (this.board.collides(candidate)) continue;
      this.current = candidate;
      this.lastWasRotation = true;
      this.touched();
      this.facts.emit({ kind: "rotated", direction });
      return true;
    }
    return false;
  }

  /** Baja una fila (la tecla ↓). Los pasos seguidos se suman y se publican juntos al fijar la pieza. */
  softDrop(): boolean {
    if (!this.canAct() || !this.tryShift(0, 1)) return false;
    this.softCells++;
    this.gravityMs = 0;
    this.lastWasRotation = false;
    return true;
  }

  /** Caída instantánea (Espacio): la pieza baja hasta el fondo y se fija. */
  hardDrop(): boolean {
    if (!this.canAct()) return false;
    const cells = this.board.dropDistance(this.current!);
    this.current = this.current!.moved(0, cells);
    if (cells > 0) this.lastWasRotation = false;
    this.flushSoftDrop();
    this.facts.emit({ kind: "hardDrop", cells: Math.min(cells, 20) });
    this.lockCurrent(true);
    return true;
  }

  /** Guarda la pieza (una vez por pieza) y saca la guardada o la siguiente. */
  hold(): boolean {
    if (!this.canAct() || this.holdUsed) return false;
    const type = this.current!.type;
    this.flushSoftDrop();
    this.facts.emit({ kind: "hold", piece: type });
    const previous = this.held;
    this.held = type;
    this.spawn(previous ?? this.bag.next());
    this.holdUsed = true; // spawn() lo reinicia; aquí se vuelve a marcar
    return true;
  }

  // ------------------------------------------------------------------
  // Para dibujar
  // ------------------------------------------------------------------

  snapshot(): Snapshot {
    const piece = this.current;
    const ghost = piece && this._status !== "over"
      ? piece.moved(0, this.board.dropDistance(piece)).cells()
      : [];
    return {
      status: this._status,
      board: this.board.snapshot(),
      piece: piece?.cells() ?? [],
      pieceType: piece?.type ?? null,
      ghost,
      next: this.bag.peek(NEXT_COUNT),
      hold: this.held,
      score: this.scoring.score,
      level: this.level.value,
      lines: this.scoring.lines,
    };
  }

  // ------------------------------------------------------------------
  // Internos
  // ------------------------------------------------------------------

  private canAct(): boolean {
    return this._status === "playing" && this.current !== null;
  }

  /** Mueve la pieza si cabe. */
  private tryShift(dx: number, dy: number): boolean {
    const moved = this.current!.moved(dx, dy);
    if (this.board.collides(moved)) return false;
    this.current = moved;
    return true;
  }

  private isGrounded(): boolean {
    return this.current !== null && this.board.collides(this.current.moved(0, 1));
  }

  /** Una acción del jugador mientras la pieza espera apoyada reinicia el retraso (hasta 15 veces). */
  private touched(): void {
    if (this.lockMs > 0 && this.lockResets < MAX_LOCK_RESETS) {
      this.lockMs = 0;
      this.lockResets++;
    }
  }

  private flushSoftDrop(): void {
    if (this.softCells > 0) this.facts.emit({ kind: "softDrop", cells: Math.min(this.softCells, 20) });
    this.softCells = 0;
  }

  /** Pone una pieza nueva arriba; si no cabe, se acabó la partida (top out). */
  private spawn(type: PieceType): void {
    const piece = Piece.spawn(type);
    this.current = piece;
    this.gravityMs = 0;
    this.lockMs = 0;
    this.lockResets = 0;
    this.softCells = 0;
    this.lastWasRotation = false;
    this.holdUsed = false;
    if (this.board.collides(piece)) {
      this._status = "over";
      this.facts.emit({ kind: "topOut" });
      return;
    }
    this.facts.emit({ kind: "spawned", piece: type });
  }

  /** Fija la pieza, cuenta líneas y pone la siguiente. */
  private lockCurrent(hardDrop: boolean): void {
    const piece = this.current!;
    this.flushSoftDrop();
    const tSpin = this.isTSpin(piece);
    this.board.lock(piece);
    this.facts.emit({ kind: "placed", piece: piece.type, hardDrop });

    const lines = this.board.clearLines();
    if (tSpin) this.facts.emit({ kind: "tSpin", lines: Math.min(lines, 3) });
    if (lines > 0) {
      const { points, combo } = this.scoring.clear(lines, this.level.value, tSpin);
      this.facts.emit({ kind: "linesCleared", lines, points, combo });
      if (this.board.isEmpty()) this.facts.emit({ kind: "allClear", lines });
      const up = this.level.addLines(lines);
      if (up !== null) this.facts.emit({ kind: "levelUp", level: up });
    } else {
      this.scoring.noClear();
    }

    const rows = this.board.stackHeight();
    if (rows !== this.lastHeight) {
      this.lastHeight = rows;
      this.facts.emit({ kind: "stackHeight", rows });
    }
    this.spawn(this.bag.next());
  }

  /** Regla de las 3 esquinas: la T giró en su último movimiento y 3 de las 4 esquinas de su centro están ocupadas. */
  private isTSpin(piece: Piece): boolean {
    if (piece.type !== "T" || !this.lastWasRotation) return false;
    const cx = piece.x + 1, cy = piece.y + 1;
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    return corners.filter(([dx, dy]) => this.board.isOccupied(cx + dx, cy + dy)).length >= 3;
  }
}

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.min(15, Math.max(1, Math.trunc(level)));
}
