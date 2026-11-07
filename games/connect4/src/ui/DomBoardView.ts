/**
 * DomBoardView — dibuja la partida con elementos HTML (sin canvas).
 * Es pasiva: recibe un ViewModel y lo pinta; los clics y las teclas los pasa al
 * controlador por los handlers. No conoce las reglas ni la red.
 *
 * Teclado: 1–7 sueltan una ficha, P pide una pista, U deshace.
 */
import { COLUMNS, ROWS, sameCell, type Cell } from "../domain/Board";
import type { Connect4View, ViewHandlers, ViewModel } from "../game/ports";

const DIFFICULTY_LABEL: Record<string, string> = { easy: "fácil", medium: "media", hard: "difícil" };

export class DomBoardView implements Connect4View {
  private handlers: ViewHandlers | null = null;
  private readonly root: HTMLElement;
  private readonly players: HTMLElement;
  private readonly status: HTMLElement;
  private readonly message: HTMLElement;
  private readonly board: HTMLElement;
  private readonly columns: HTMLButtonElement[] = [];
  private readonly cells: HTMLElement[][] = [];   // cells[column-1][row-1]
  private readonly hintButton: HTMLButtonElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly overlay: HTMLElement;
  private lastAnimated: Cell | null = null;
  private lastDiscCount = 0;

  constructor(container: HTMLElement) {
    this.root = el("div", "c4");
    this.players = el("div", "c4-players");
    this.status = el("p", "c4-status");
    this.status.setAttribute("aria-live", "polite");
    this.board = el("div", "c4-board");
    this.board.setAttribute("role", "group");
    this.board.setAttribute("aria-label", "Tablero");

    for (let c = 1; c <= COLUMNS; c++) {
      const col = el("button", "c4-col") as HTMLButtonElement;
      col.type = "button";
      col.setAttribute("aria-label", `Columna ${c}`);
      col.addEventListener("click", () => this.handlers?.column(c));
      const cells: HTMLElement[] = [];
      // Se agregan de arriba (fila 6) hacia abajo (fila 1), como se ven.
      for (let r = ROWS; r >= 1; r--) {
        const cell = el("span", "c4-cell");
        cell.append(el("span", "c4-disc"));
        col.append(cell);
        cells[r - 1] = cell;
      }
      this.columns.push(col);
      this.cells.push(cells);
      this.board.append(col);
    }

    const actions = el("div", "c4-actions");
    this.hintButton = button("Pista", () => this.handlers?.hint());
    this.undoButton = button("Deshacer", () => this.handlers?.undo());
    actions.append(this.hintButton, this.undoButton);

    this.message = el("p", "c4-message");
    this.overlay = el("div", "c4-overlay");

    const boardWrap = el("div", "c4-board-wrap");
    boardWrap.append(this.board, this.overlay);
    this.root.append(this.players, this.status, boardWrap, actions, this.message);
    container.append(this.root);

    window.addEventListener("keydown", (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= COLUMNS) this.handlers?.column(n);
      else if (e.key.toLowerCase() === "p") this.handlers?.hint();
      else if (e.key.toLowerCase() === "u") this.handlers?.undo();
    });
  }

  bind(handlers: ViewHandlers): void {
    this.handlers = handlers;
  }

  render(vm: ViewModel): void {
    this.root.dataset.status = vm.status;
    this.root.dataset.turn = vm.current?.color ?? "";

    // Jugadores
    this.players.replaceChildren(...vm.seats.map((s) => {
      const chip = el("div", `c4-player ${s.color}`);
      if (vm.current?.playerId === s.playerId && vm.status === "playing") chip.classList.add("active");
      if (vm.winner?.playerId === s.playerId) chip.classList.add("winner");
      const name = el("span", "c4-name");
      name.textContent = s.name;
      chip.append(el("span", "c4-dot"), name);
      if (s.kind === "cpu") {
        const tag = el("span", "c4-tag");
        tag.textContent = vm.difficulty ? `IA · ${DIFFICULTY_LABEL[vm.difficulty] ?? vm.difficulty}` : "IA";
        chip.append(tag);
      }
      if (vm.current?.playerId === s.playerId && vm.timeLeft !== null) {
        const t = el("span", "c4-timer");
        t.textContent = `${vm.timeLeft}s`;
        if (vm.timeLeft <= 5) t.classList.add("low");
        chip.append(t);
      }
      return chip;
    }));

    // Estado y mensaje
    this.status.textContent = statusText(vm);
    this.message.textContent = vm.message ?? "";

    // Tablero
    // La ficha nueva cae con una animación. La clase se mantiene en los
    // redibujados siguientes (el reloj, por ejemplo) para no cortarla a la mitad.
    if (vm.board.discCount < this.lastDiscCount) this.lastAnimated = null; // se deshizo una jugada
    const animate = !!vm.lastCell && vm.board.discCount > this.lastDiscCount && !sameCell(vm.lastCell, this.lastAnimated);
    const dropCell = animate ? vm.lastCell : this.lastAnimated;
    for (let c = 1; c <= COLUMNS; c++) {
      const col = this.columns[c - 1];
      col.disabled = !vm.canPlay || !vm.board.canDrop(c);
      col.classList.toggle("hint", vm.hintColumn === c);
      for (let r = 1; r <= ROWS; r++) {
        const cell = this.cells[c - 1][r - 1];
        const color = vm.board.at(c, r);
        const disc = cell.firstElementChild as HTMLElement;
        disc.className = `c4-disc${color ? ` ${color}` : ""}`;
        cell.classList.toggle("win", vm.winningCells.some((w) => w.column === c && w.row === r));
        cell.classList.toggle("last", sameCell(vm.lastCell, { column: c, row: r }));
        if (color && sameCell(dropCell, { column: c, row: r })) {
          disc.style.setProperty("--fall", String(ROWS - r + 1));
          disc.classList.add("drop");
        }
      }
    }
    if (animate) this.lastAnimated = vm.lastCell;
    this.lastDiscCount = vm.board.discCount;

    // Acciones
    this.hintButton.textContent = `Pista (${vm.hintsLeft})`;
    this.hintButton.disabled = !vm.canHint;
    this.undoButton.hidden = !vm.showUndo;
    this.undoButton.disabled = !vm.canUndo;

    // Capa encima del tablero
    this.overlay.textContent = vm.status === "paused" ? "En pausa" : "";
    this.overlay.hidden = vm.status !== "paused";
  }
}

function statusText(vm: ViewModel): string {
  switch (vm.status) {
    case "loading": return "Cargando…";
    case "ready": return "Listo para empezar";
    case "paused": return "En pausa";
    case "finished":
      if (vm.winner) return `¡Ganó ${vm.winner.name}!`;
      if (vm.draw) return "Empate: el tablero se llenó";
      return "Partida terminada";
    case "playing":
      if (vm.thinking) return vm.current?.kind === "cpu" ? "La computadora está pensando…" : "Buscando una pista…";
      if (vm.hintColumn) return `Pista: prueba la columna ${vm.hintColumn}`;
      return `Turno de ${vm.current?.name ?? ""}`;
  }
}

function el(tag: string, className: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = el("button", "c4-button") as HTMLButtonElement;
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}
