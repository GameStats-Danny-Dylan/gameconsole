/**
 * FightingGame — el controlador de una partida: une la pelea (FightingMatch),
 * los controles de cada jugador (ControlStrategy), la vista y la consola
 * (GameHost del SDK). No depende de GameApp, así se prueba sin consola.
 *
 * Ciclo: requestAnimationFrame con tiempo delta (recortado a MAX_DT, para que
 * una pestaña que estuvo quieta no haga "saltar" la pelea). Los eventos salen
 * de los hechos de la pelea (uno por golpe, bloqueo, combo, derribo o round),
 * nunca por cuadro.
 *
 * Estados (protocolo, sección 4):
 *   loading ──init──► ready ──start──► playing ⇄ paused ──► finished
 * Cada mensaje solo vale en ciertos estados; en otro, se ignora.
 */
import type { GameHost, MatchContext, PauseReason, StopReason } from "@gameconsole/sdk";
import { GameStatsAdapter } from "../adapter/GameStatsAdapter";
import { FightingMatch, ROUND_OPTIONS, type RoundsOption } from "../domain/FightingMatch";
import { NO_INTENT, type Intent } from "../domain/fighter/Intent";
import { EffectsSystem } from "../fx/EffectsSystem";
import { controlsForSlot, type ControlStrategy } from "../input/ControlScheme";
import { animationFrames, type FightView, type FrameScheduler, type InputPort, type Status } from "./ports";

/** El paso más largo que se simula de una vez (segundos). */
export const MAX_DT = 0.05;
/** Después de terminar se sigue dibujando un rato (para ver el KO y el ganador). */
export const OUTRO_SECONDS = 3;

export class FightingGame {
  private status: Status = "loading";
  private match!: FightingMatch;
  private controls: [ControlStrategy, ControlStrategy] = [controlsForSlot(1), controlsForSlot(2)];
  private readonly adapter = new GameStatsAdapter();
  /** Lo que se anima en la presentación; avanza con el mismo dt que la pelea (en la pausa, nada). */
  private readonly fx = new EffectsSystem();

  private frameId: number | null = null;
  private lastTime: number | null = null;
  private outroLeft = 0;
  private stopped = false;

  constructor(
    private readonly host: GameHost,
    private readonly view: FightView,
    private readonly input: InputPort,
    private readonly frames: FrameScheduler = animationFrames,
  ) {}

  get state(): Status { return this.status; }
  get fight(): FightingMatch { return this.match; }
  /** Si el ciclo de cuadros está corriendo. */
  get running(): boolean { return this.frameId !== null; }

  // ------------------------------------------------------------------
  // Mensajes de la consola
  // ------------------------------------------------------------------

  /** INIT: arma la pelea. Lanza un error si el contexto no sirve. */
  init(ctx: MatchContext, controls?: [ControlStrategy, ControlStrategy]): void {
    if (this.status !== "loading") return;
    if (ctx.mode !== "local-2p") throw new Error(`la pelea no tiene el modo "${ctx.mode}"`);
    if (ctx.players.length !== 2 || ctx.players.some((p) => p.kind !== "human"))
      throw new Error("local-2p: dos personas en el mismo teclado");

    this.match = new FightingMatch(ctx.players, parseRounds(ctx.options.rounds));
    if (controls) this.controls = controls;
    // Observer: cada hecho de la pelea se traduce (Adapter) y se manda a la consola.
    this.match.facts.on((fact) => {
      if (fact.kind === "matchOver") return this.end(fact.winner);
      const event = this.adapter.fromFact(fact);
      if (event) this.host.emit(event);
    });
    this.status = "ready";
    this.render();
  }

  /** START: MATCH_STARTED, un PLAYER_JOINED por luchador (slot 1 primero) y arranca el ciclo. */
  start(): void {
    if (this.status !== "ready") return;
    this.status = "playing";
    this.host.emit(this.adapter.matchStarted(this.match.arena.stage, this.match.rounds));
    for (const f of this.match.fighters) this.host.emit(this.adapter.playerJoined(f.playerId, f.character));
    this.input.reset();
    this.startLoop();
  }

  /** PAUSE: se detiene el ciclo (el reloj del round no corre) y se ignoran las teclas. */
  pause(reason: PauseReason = "user"): void {
    if (this.status !== "playing") return;
    this.status = "paused";
    this.stopLoop();
    this.input.reset();
    this.host.emit(this.adapter.paused(reason));
    this.render();
  }

  resume(): void {
    if (this.status !== "paused") return;
    this.status = "playing";
    this.host.emit(this.adapter.resumed());
    this.input.reset();
    this.startLoop();
  }

  /** STOP: si la pelea empezó, PLAYER_LEFT de cada uno y MATCH_FINISHED; después FINISHED sin ganador. */
  stop(_reason: StopReason = "user"): void {
    if (this.status === "ready") {
      this.status = "finished";
      this.stopped = true;
      this.render();
      this.host.finish(null, "stopped");
      return;
    }
    if (this.status !== "playing" && this.status !== "paused") return;
    this.stopLoop();
    this.match.flushAll(); // los golpes que estaban en espera también cuentan
    this.status = "finished";
    this.stopped = true;
    for (const f of this.match.fighters) this.host.emit(this.adapter.playerLeft(f.playerId));
    this.host.emit(this.adapter.matchFinished("stopped"));
    this.render();
    this.host.finish(null, "stopped");
  }

  // ------------------------------------------------------------------
  // Ciclo
  // ------------------------------------------------------------------

  private startLoop(): void {
    if (this.frameId !== null) return;
    this.lastTime = null; // el primer cuadro después de arrancar o de reanudar no avanza
    this.frameId = this.frames.request(this.frame);
  }

  private stopLoop(): void {
    if (this.frameId !== null) this.frames.cancel(this.frameId);
    this.frameId = null;
    this.lastTime = null;
  }

  private readonly frame = (timeMs: number): void => {
    this.frameId = null;
    const dt = this.lastTime === null ? 0 : Math.min(MAX_DT, Math.max(0, (timeMs - this.lastTime) / 1000));
    this.lastTime = timeMs;

    if (this.status === "playing") {
      const intents = this.controls.map((c) => c.read(this.input)) as [Intent, Intent];
      this.match.step(dt, intents);
      this.fx.update(dt, this.match);
    } else if (this.status === "finished" && !this.stopped) {
      this.match.step(dt, [NO_INTENT, NO_INTENT]); // final: solo la animación
      this.fx.update(dt, this.match);
      this.outroLeft -= dt;
    }
    this.input.endFrame();
    this.render();

    const keepGoing = this.status === "playing" || (this.status === "finished" && !this.stopped && this.outroLeft > 0);
    if (keepGoing) this.frameId = this.frames.request(this.frame);
  };

  /** La pelea se decidió: MATCH_FINISHED y FINISHED con el ganador (playerId o null si empataron). */
  private end(winner: string | null): void {
    if (this.status !== "playing") return;
    this.status = "finished";
    this.outroLeft = OUTRO_SECONDS;
    this.host.emit(this.adapter.matchFinished("normal"));
    this.host.finish(winner, "normal");
  }

  private render(): void {
    if (!this.match) return;
    const w = this.match.winner;
    this.view.render({
      match: this.match,
      status: this.status,
      winnerName: w ? this.match.fighters.find((f) => f.playerId === w)?.name ?? w : null,
      stopped: this.stopped,
      fx: this.fx,
    });
  }
}

/** rounds de INIT: 1, 3 o 5 (llega como número o como texto). Cualquier otra cosa: 3. */
export function parseRounds(value: unknown): RoundsOption {
  const n = Number(value ?? 3);
  return (ROUND_OPTIONS as readonly number[]).includes(n) ? (n as RoundsOption) : 3;
}
