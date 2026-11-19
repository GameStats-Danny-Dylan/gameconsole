/**
 * MatchSessionFactory — crea las sesiones de partida.
 *
 * Factory: arma el iframe ("{entry}?matchId=..."), la sesión y la registra en
 * el mediador, para que nadie más tenga que saber cómo se conectan esas piezas.
 * También crea la sesión de "Reiniciar": los mismos jugadores y opciones con
 * otro matchId.
 */
import type { GameManifest, MatchContext } from "@gameconsole/sdk";
import { MatchContextFactory } from "../domain/MatchContextFactory";
import type { EventBus } from "./EventBus";
import type { MatchFrame } from "./MatchFrame";
import type { MatchMediator } from "./MatchMediator";
import { MatchSession } from "./MatchSession";

export type FrameCreator = (src: string, title: string) => MatchFrame;

export interface SessionFactoryDeps {
  bus: EventBus;
  mediator: MatchMediator;
  origin: string;
  createFrame: FrameCreator;
  contexts?: MatchContextFactory;
}

/** La URL del iframe: la entry del manifiesto con el matchId (protocolo, sección 4). */
export function frameSrc(entry: string, matchId: string): string {
  return `${entry}${entry.includes("?") ? "&" : "?"}matchId=${encodeURIComponent(matchId)}`;
}

export class MatchSessionFactory {
  private readonly contexts: MatchContextFactory;

  constructor(private readonly deps: SessionFactoryDeps) {
    this.contexts = deps.contexts ?? new MatchContextFactory();
  }

  create(manifest: GameManifest, context: MatchContext): MatchSession {
    const players = context.players.map((p) => p.name).join(" vs ");
    const frame = this.deps.createFrame(frameSrc(manifest.entry, context.matchId), `${manifest.name}: ${players}`);
    const session = new MatchSession(manifest, context, { frame, bus: this.deps.bus, origin: this.deps.origin });
    this.deps.mediator.register(session);
    session.start();
    return session;
  }

  /** Otra partida con los mismos jugadores, modo y opciones, pero un matchId nuevo. */
  restart(old: MatchSession): MatchSession {
    const context: MatchContext = {
      ...old.context,
      matchId: this.contexts.newMatchId(old.manifest),
      players: old.context.players.map((p) => ({ ...p })),
      options: { ...old.context.options },
    };
    return this.create(old.manifest, context);
  }
}
