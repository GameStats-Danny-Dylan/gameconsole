/**
 * Connect4Match — las reglas de una partida: turnos, amenazas, ganador,
 * empate y deshacer. No sabe nada de la pantalla, de la red ni de GameStats.
 *
 * Patrones:
 *  - Command: cada ficha es un DropCommand que guarda cómo estaba la partida
 *    antes (un "recuerdo"). Deshacer = sacar el último comando y volver a ese estado.
 *  - Observer: cada hecho ("cayó una ficha", "se tapó una amenaza"…) se publica
 *    en `facts`. El adapter de GameStats y la vista se suscriben; la partida no
 *    los conoce.
 *
 * Las reglas son las mismas que valida GameStats (contracts/README.md, connect4),
 * así ningún evento que salga de aquí se descarta.
 */
import { Board, cellKey, type Cell, type Color, type Direction } from "./Board";
import { Emitter } from "../util/Emitter";

export type PlayerKind = "human" | "cpu";

export interface Seat {
  readonly playerId: string;
  readonly name: string;
  readonly color: Color;
  readonly kind: PlayerKind;
}

/** Cómo decidió la IA (va como datos extra en el DISC_DROPPED de la computadora). */
export interface AiInfo {
  readonly engine: string;
  readonly depth: number;
  readonly score: number;
  readonly nodes: number;
  readonly ms: number;
}

/** Hechos del juego, en el idioma del juego (el adapter los traduce al contrato). */
export type Fact =
  | { kind: "disc"; player: string; cell: Cell; ai?: AiInfo }
  | { kind: "threatBlocked"; player: string; cell: Cell; attacker: string }
  | { kind: "threatCreated"; player: string; cell: Cell }
  | { kind: "connectFour"; player: string; direction: Direction; cells: readonly Cell[] }
  | { kind: "draw" }
  | { kind: "undo"; player: string; cell: Cell }
  | { kind: "hint"; player: string; column: number }
  | { kind: "timeout"; player: string; seconds: number };

/** Todo lo que cambia con una ficha (y vuelve atrás al deshacer). */
interface Snapshot {
  readonly board: Board;
  readonly turn: number;                                   // índice del asiento que juega
  readonly threats: ReadonlyMap<string, ReadonlySet<string>>; // casilla -> dueños de la amenaza
  readonly last: { readonly seat: number; readonly cell: Cell } | null;
}

/** Command: soltar una ficha. Guarda el estado anterior para poder deshacerla. */
class DropCommand {
  before: Snapshot | null = null;
  constructor(readonly seat: number, readonly column: number, readonly ai?: AiInfo) {}
}

export class Connect4Match {
  /** Observer: aquí se publica cada hecho. */
  readonly facts = new Emitter<Fact>();

  private state: Snapshot = { board: Board.empty(), turn: 0, threats: new Map(), last: null };
  private readonly done: DropCommand[] = [];
  private result: { winner: number | null; line: readonly Cell[] } | null = null;

  /** seats[0] es el slot 1: juega con rojo y empieza. */
  constructor(readonly seats: readonly [Seat, Seat]) {
    const [a, b] = seats;
    if (a.playerId === b.playerId) throw new Error("los dos jugadores deben tener playerId distintos");
    if (a.color === b.color) throw new Error("los dos jugadores deben tener colores distintos");
  }

  get board(): Board { return this.state.board; }
  get current(): Seat { return this.seats[this.state.turn]; }
  get finished(): boolean { return this.result !== null; }
  get winner(): Seat | null { return this.result?.winner == null ? null : this.seats[this.result.winner]; }
  get isDraw(): boolean { return this.finished && this.winner === null; }
  get winningCells(): readonly Cell[] { return this.result?.line ?? []; }
  get lastCell(): Cell | null { return this.state.last?.cell ?? null; }
  get moves(): number { return this.done.length; }

  seat(playerId: string): Seat | undefined {
    return this.seats.find((s) => s.playerId === playerId);
  }

  /** El jugador que tiene el turno suelta una ficha en `column`. */
  drop(column: number, ai?: AiInfo): Fact[] {
    if (this.finished) throw new Error("la partida ya terminó");
    if (!this.board.canDrop(column)) throw new Error(`la columna ${column} está llena o no existe`);
    const command = new DropCommand(this.state.turn, column, ai);
    const facts = this.execute(command);
    this.done.push(command);
    return this.publish(facts);
  }

  /**
   * ¿Puede deshacer? Solo contra la computadora, solo la persona, en su turno,
   * y deshace de a dos: la ficha de la computadora y la suya.
   */
  canUndo(playerId: string): boolean {
    const seat = this.seats.findIndex((s) => s.playerId === playerId);
    const rival = this.seats[1 - seat];
    const n = this.done.length;
    return !this.finished && seat >= 0 && this.seats[seat].kind === "human" && rival?.kind === "cpu"
      && this.state.turn === seat && n >= 2
      && this.done[n - 1].seat !== seat && this.done[n - 2].seat === seat;
  }

  undo(playerId: string): Fact[] {
    if (!this.canUndo(playerId)) throw new Error("no se puede deshacer ahora");
    const facts: Fact[] = [];
    for (let i = 0; i < 2; i++) {
      const command = this.done.pop()!;
      facts.push({ kind: "undo", player: playerId, cell: this.state.last!.cell });
      this.state = command.before!;
    }
    return this.publish(facts);
  }

  /** Se acabó el tiempo del turno: pierde el turno sin jugar. */
  timeout(seconds: number): Fact[] {
    if (this.finished) throw new Error("la partida ya terminó");
    const player = this.current.playerId;
    this.state = { ...this.state, turn: 1 - this.state.turn };
    return this.publish([{ kind: "timeout", player, seconds }]);
  }

  /** El jugador que tiene el turno pidió una pista y se le sugirió `column`. */
  hint(column: number): Fact[] {
    if (this.finished) throw new Error("la partida ya terminó");
    return this.publish([{ kind: "hint", player: this.current.playerId, column }]);
  }

  private execute(command: DropCommand): Fact[] {
    const before = this.state;
    command.before = before;
    const seat = this.seats[command.seat];
    const rival = this.seats[1 - command.seat];
    const { board, cell } = before.board.drop(command.column, seat.color);
    const threats = new Map([...before.threats].map(([k, v]) => [k, new Set(v)]));
    const facts: Fact[] = [{ kind: "disc", player: seat.playerId, cell, ...(command.ai ? { ai: command.ai } : {}) }];

    // 1. Si cayó donde el rival tenía una amenaza, la tapó.
    const owners = threats.get(cellKey(cell));
    if (owners?.has(rival.playerId)) {
      owners.delete(rival.playerId);
      facts.push({ kind: "threatBlocked", player: seat.playerId, cell, attacker: rival.playerId });
    }

    // 2. ¿Hizo 4 en línea?
    const line = board.lineThrough(cell);
    if (line) {
      facts.push({ kind: "connectFour", player: seat.playerId, direction: line.direction, cells: line.cells });
      this.result = { winner: command.seat, line: line.cells };
    } else {
      // 3. Amenazas nuevas de quien jugó (casillas que le completarían 4).
      for (const t of board.threats(seat.color)) {
        const set = threats.get(cellKey(t)) ?? new Set<string>();
        if (!set.has(seat.playerId)) {
          set.add(seat.playerId);
          threats.set(cellKey(t), set);
          facts.push({ kind: "threatCreated", player: seat.playerId, cell: t });
        }
      }
      // 4. Tablero lleno sin ganador: empate.
      if (board.isFull()) {
        this.result = { winner: null, line: [] };
        facts.push({ kind: "draw" });
      }
    }

    this.state = { board, turn: 1 - command.seat, threats, last: { seat: command.seat, cell } };
    return facts;
  }

  private publish(facts: Fact[]): Fact[] {
    for (const f of facts) this.facts.emit(f);
    return facts;
  }
}
