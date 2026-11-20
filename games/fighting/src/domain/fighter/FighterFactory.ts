/**
 * FighterFactory — patrón Factory: arma los luchadores a partir de los
 * jugadores de INIT. El slot decide el lado, el personaje y el color:
 * slot 1 a la izquierda, slot 2 a la derecha (protocolo, sección 4).
 * Quien pide un luchador no sabe nada del reparto.
 */
import type { Arena } from "../Arena";
import type { CombatRules } from "../CombatRules";
import { DEFAULT_PHYSICS, Fighter, type FighterSpec, type Physics } from "./Fighter";

export interface Character {
  /** El `character` que va en PLAYER_JOINED. */
  id: string;
  label: string;
  color: string;
}

/** Un personaje por lado (solo cambian de nombre y color; las reglas son iguales). */
export const ROSTER: Record<1 | 2, Character> = {
  1: { id: "brasa", label: "Brasa", color: "#ef4444" },
  2: { id: "marea", label: "Marea", color: "#38bdf8" },
};

export interface Contender {
  playerId: string;
  name: string;
  slot: number;
}

export class FighterFactory {
  constructor(
    private readonly arena: Arena,
    private readonly rules: CombatRules,
    private readonly physics: Physics = DEFAULT_PHYSICS,
  ) {}

  /** Los dos luchadores, ordenados por slot. Lanza un error si no son exactamente dos con slots 1 y 2. */
  createPair(players: readonly Contender[]): [Fighter, Fighter] {
    const sorted = [...players].sort((a, b) => a.slot - b.slot);
    if (sorted.length !== 2 || sorted[0].slot !== 1 || sorted[1].slot !== 2)
      throw new Error("la pelea necesita dos jugadores, en los slots 1 y 2");
    if (sorted[0].playerId === sorted[1].playerId)
      throw new Error("los dos jugadores tienen el mismo playerId");
    return [this.create(sorted[0]), this.create(sorted[1])];
  }

  create(p: Contender): Fighter {
    const slot = p.slot === 1 ? 1 : 2;
    const c = ROSTER[slot];
    const spec: FighterSpec = {
      playerId: p.playerId,
      name: p.name,
      slot,
      side: slot === 1 ? "left" : "right",
      character: c.id,
      color: c.color,
    };
    return new Fighter(spec, this.arena, this.rules, this.physics);
  }
}
