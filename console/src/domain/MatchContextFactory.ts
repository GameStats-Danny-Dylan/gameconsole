/**
 * MatchContextFactory — arma el payload de INIT (protocolo, sección 4).
 *
 * Factory: la única parte de la consola que sabe cómo se crea un MatchContext
 * (matchId, slots, el jugador cpu). El formulario solo le pasa lo elegido.
 */
import { newUuid, type GameManifest, type MatchContext, type Mode, type PlayerInfo } from "@gameconsole/sdk";
import { CPU_ID, CPU_NAME, toPlayerId } from "./players";

export interface MatchRequest {
  manifest: GameManifest;
  mode: Mode;
  /** Nombres de los jugadores humanos, en orden de slot. Ya validados. */
  names: readonly string[];
  options: Record<string, string | number>;
}

export type IdGenerator = () => string;

export class MatchContextFactory {
  // newUuid y no crypto.randomUUID: este último no existe si la consola se
  // abre por http://<IP>:8000 desde otra computadora (no es contexto seguro).
  constructor(private readonly uuid: IdGenerator = () => newUuid()) {}

  /** matchId = {id}-{uuid}, con el id del manifiesto (protocolo, sección 5). */
  newMatchId(manifest: GameManifest): string {
    return `${manifest.id}-${this.uuid()}`;
  }

  create(req: MatchRequest): MatchContext {
    const players: PlayerInfo[] = req.names.map((name, i) => ({
      playerId: toPlayerId(name),
      name: name.trim(),
      kind: "human",
      slot: i + 1,
    }));
    // Contra la computadora: cpu ocupa el lugar siguiente al último humano.
    if (req.mode === "vs-cpu")
      players.push({ playerId: CPU_ID, name: CPU_NAME, kind: "cpu", slot: players.length + 1 });

    return {
      gameId: req.manifest.id,           // el id del manifiesto, no el gameStatsId
      matchId: this.newMatchId(req.manifest),
      mode: req.mode,
      players,
      options: { ...req.options },
    };
  }
}
