/**
 * FightingApp — la pelea dentro de la consola (protocolo, sección 9).
 *
 * Template Method: GameApp (SDK) maneja el protocolo con la consola, los
 * estados y el sellado de eventos; esta clase solo llena los pasos y se los
 * pasa a FightingGame, que no sabe nada del SDK (depende de GameHost).
 */
import { GameApp, type GameAppOptions, type MatchContext, type PauseReason, type StopReason } from "@gameconsole/sdk";
import { controlsForSlot } from "../input/ControlScheme";
import { KeyboardInput } from "../input/KeyboardInput";
import { CanvasView } from "../ui/CanvasView";
import { FightingGame } from "./FightingGame";
import { animationFrames, type FightView, type FrameScheduler, type InputPort } from "./ports";

export class FightingApp extends GameApp {
  private game: FightingGame | null = null;

  constructor(private readonly root: HTMLElement, options: GameAppOptions) {
    super(options);
  }

  protected onInit(ctx: MatchContext): void {
    this.game = new FightingGame(this.host, this.mountView(), this.mountInput(), this.scheduler());
    this.game.init(ctx); // lanza un error si el modo o los jugadores no sirven
  }

  /** La vista en canvas. Las pruebas la cambian por una sin DOM. */
  protected mountView(): FightView {
    return new CanvasView(this.root);
  }

  /** El teclado de la página, con las teclas de los dos jugadores. */
  protected mountInput(): InputPort {
    const codes = new Set([...controlsForSlot(1).codes(), ...controlsForSlot(2).codes()]);
    return new KeyboardInput(codes).attach();
  }

  protected scheduler(): FrameScheduler {
    return animationFrames;
  }

  protected onStart(): void {
    // Dentro del iframe: pide el foco para que las teclas lleguen sin hacer clic.
    if (typeof window !== "undefined") window.focus();
    this.game?.start();
  }
  protected onPause(reason: PauseReason): void { this.game?.pause(reason); }
  protected onResume(): void { this.game?.resume(); }
  protected onStop(reason: StopReason): void { this.game?.stop(reason); }
}
