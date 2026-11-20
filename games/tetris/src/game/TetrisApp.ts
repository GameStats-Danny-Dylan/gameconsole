/**
 * TetrisApp — el Tetris dentro de la consola (protocolo, sección 9).
 *
 * Template Method: GameApp (SDK) maneja el protocolo con la consola, los
 * estados y el sellado de eventos; esta clase solo llena los pasos
 * (onInit, onStart, onPause, onResume, onStop) y le pasa cada uno a TetrisGame.
 * Mediator: es el único que conoce a la partida, la vista, el teclado, el
 * reloj de cuadros y el adapter; entre ellos no se hablan.
 */
import { GameApp, type GameAppOptions, type GameIdentity, type MatchContext, type PauseReason, type StopReason } from "@gameconsole/sdk";
import { GameStatsAdapter } from "../adapter/GameStatsAdapter";
import type { Random } from "../domain/PieceBag";
import { CanvasView, type GameView } from "../ui/CanvasView";
import { RafLoop, type Loop } from "../ui/GameLoop";
import { KeyboardInput } from "../ui/KeyboardInput";
import { clampLevel, TetrisGame } from "./TetrisGame";

export interface TetrisAppOptions extends Omit<GameAppOptions, "manifest"> {
  manifest: GameIdentity & { howToPlay?: string };
  /** Generador de la bolsa de piezas (en las pruebas, uno con semilla). */
  random?: Random;
}

export class TetrisApp extends GameApp {
  private game: TetrisGame | null = null;
  private adapter: GameStatsAdapter | null = null;
  private view: GameView | null = null;
  private loop: Loop | null = null;
  private input: KeyboardInput | null = null;
  private started = false;
  private ended = false;

  constructor(private readonly root: HTMLElement, private readonly appOptions: TetrisAppOptions) {
    super(appOptions);
  }

  protected onInit(ctx: MatchContext): void {
    if (ctx.mode !== "solo") throw new Error(`Tetris no tiene el modo "${ctx.mode}"`);
    if (ctx.players.length !== 1) throw new Error("Tetris es de un solo jugador");
    const player = ctx.players[0];

    this.game = new TetrisGame({ startLevel: clampLevel(Number(ctx.options.startLevel ?? 1)), random: this.appOptions.random });
    this.adapter = new GameStatsAdapter(player.playerId);
    this.view = this.mountView();
    this.loop = this.createLoop();
    this.input = this.createInput(this.game);

    // Observer: cada hecho de la partida se traduce y se manda; perder cierra la partida.
    this.game.facts.on((fact) => {
      this.emit(this.adapter!.fromFact(fact));
      if (fact.kind === "topOut") this.endMatch("normal");
    });
    this.view.render(this.game.snapshot());
  }

  /** La vista dentro del iframe. Las pruebas la cambian por una sin DOM. */
  protected mountView(): GameView {
    return new CanvasView(this.root, this.appOptions.manifest.howToPlay ?? "");
  }

  protected createLoop(): Loop {
    return new RafLoop();
  }

  protected createInput(game: TetrisGame): KeyboardInput {
    return new KeyboardInput(game, window);
  }

  protected onStart(): void {
    const { game, adapter } = this.parts();
    this.emit(adapter.matchStarted(game.startLevel));
    this.emit(adapter.playerJoined());
    this.started = true;
    this.input!.attach();
    this.runLoop();
    game.start();
    this.view!.render(game.snapshot());
    this.focusGame();
  }

  protected onPause(reason: PauseReason): void {
    if (!this.started || this.ended) return;
    const { game, adapter } = this.parts();
    game.pause();
    this.loop!.stop();
    this.emit(adapter.paused(reason));
    this.view!.render(game.snapshot());
  }

  protected onResume(): void {
    if (!this.started || this.ended) return;
    const { game, adapter } = this.parts();
    game.resume();
    this.emit(adapter.resumed());
    this.runLoop();
    this.view!.render(game.snapshot());
    this.focusGame();
  }

  protected onStop(reason: StopReason): void {
    void reason;
    // Si la partida no empezó o ya terminó (perdió), no hay nada que cerrar en GameStats.
    if (!this.started || this.ended) { this.release(); return; }
    this.game!.stop();
    this.emit(this.adapter!.playerLeft());
    this.endMatch("stopped");
  }

  /** MATCH_FINISHED una sola vez y FINISHED con winner null (juego de un solo jugador). */
  private endMatch(reason: "normal" | "stopped"): void {
    if (this.ended) return;
    this.ended = true;
    this.emit(this.adapter!.matchFinished(reason));
    this.release();
    this.view?.render(this.game!.snapshot());
    this.finish(null, reason);
  }

  private release(): void {
    this.loop?.stop();
    this.input?.detach();
  }

  private runLoop(): void {
    this.loop!.start((dt) => {
      this.game!.update(dt);
      this.view!.render(this.game!.snapshot());
    });
  }

  private focusGame(): void {
    try { this.root?.querySelector<HTMLElement>(".tetris")?.focus({ preventScroll: true }); window.focus(); } catch { /* sin DOM */ }
  }

  private parts(): { game: TetrisGame; adapter: GameStatsAdapter } {
    if (!this.game || !this.adapter) throw new Error("la partida no se ha preparado (falta INIT)");
    return { game: this.game, adapter: this.adapter };
  }
}
