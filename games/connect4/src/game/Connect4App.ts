/**
 * Connect4App — el 4 en línea dentro de la consola (protocolo, sección 9).
 *
 * Template Method: GameApp (SDK) maneja el protocolo con la consola, los
 * estados y el sellado de eventos; esta clase solo llena los pasos, y cada uno
 * se lo pasa a Connect4Game, que no sabe nada del SDK (depende de GameHost).
 */
import { GameApp, type GameAppOptions, type MatchContext, type PauseReason, type StopReason } from "@gameconsole/sdk";
import { MinThinkTime, PrologStrategy, type MoveStrategy } from "../ai/MoveStrategy";
import type { Mode } from "../adapter/GameStatsAdapter";
import { DomBoardView } from "../ui/DomBoardView";
import { Connect4Game } from "./Connect4Game";
import type { Connect4View } from "./ports";

const MODES: readonly Mode[] = ["vs-cpu", "local-2p"];

export class Connect4App extends GameApp {
  private game: Connect4Game | null = null;

  constructor(
    private readonly root: HTMLElement,
    options: GameAppOptions,
    private readonly strategy: MoveStrategy = new MinThinkTime(new PrologStrategy()),
  ) {
    super(options);
  }

  protected onInit(ctx: MatchContext): void {
    if (!MODES.includes(ctx.mode as Mode)) throw new Error(`el 4 en línea no tiene el modo "${ctx.mode}"`);
    this.game = new Connect4Game(this.host, this.mountView(), this.strategy);
    this.game.init({ ...ctx, mode: ctx.mode as Mode }); // lanza un error si los jugadores no sirven
  }

  /** La vista del tablero dentro del iframe. Las pruebas la cambian por una sin DOM. */
  protected mountView(): Connect4View {
    const board = document.createElement("div");
    board.className = "game card";
    this.root.replaceChildren(board);
    return new DomBoardView(board);
  }

  protected onStart(): void { this.game?.start(); }
  protected onPause(reason: PauseReason): void { this.game?.pause(reason); }
  protected onResume(): void { this.game?.resume(); }
  protected onStop(reason: StopReason): void { this.game?.stop(reason); }
}
