/**
 * registry.ts — la lista de juegos vivos.
 *
 * Patrones:
 *  - Registry: un único lugar donde los juegos se anotan y la consola los busca.
 *  - Observer: quien quiera enterarse de que un juego llegó, se fue o se cayó
 *    se suscribe con on("registered" | "removed" | "expired"). El servidor lo usa
 *    para el log; no hace falta tocar esta clase para agregar más oyentes.
 */
import { EventEmitter } from "node:events";
import type { GameManifest } from "./manifest.js";

export interface GameEntry extends GameManifest {
  registeredAt: string; // ISO 8601
  lastSeen: string;     // ISO 8601
}

export interface RegistryEvents {
  registered: [entry: GameEntry, isNew: boolean];
  removed: [id: string];
  expired: [id: string];
}

/** Reloj inyectable: en producción Date.now, en las pruebas uno manual. */
export type Clock = () => number;

interface Slot {
  manifest: GameManifest;
  registeredAt: number;
  lastSeen: number;
}

export class GameRegistry extends EventEmitter<RegistryEvents> {
  private readonly games = new Map<string, Slot>();

  /**
   * @param timeoutMs sin latido durante este tiempo, el juego se considera caído (15 s).
   * @param now       reloj, para poder probar el vencimiento sin esperar.
   */
  constructor(
    readonly timeoutMs = 15_000,
    private readonly now: Clock = Date.now,
  ) {
    super();
  }

  /** Registra un juego, o lo actualiza si ya estaba. Devuelve si es nuevo. */
  register(manifest: GameManifest): GameEntry {
    const t = this.now();
    const previous = this.alive(manifest.id);
    const record: Slot = {
      manifest,
      registeredAt: previous ? previous.registeredAt : t,
      lastSeen: t,
    };
    this.games.set(manifest.id, record);
    const entry = toEntry(record);
    this.emit("registered", entry, !previous);
    return entry;
  }

  /** Latido. false si el juego no está (o ya se había caído): debe registrarse otra vez. */
  heartbeat(id: string): boolean {
    const record = this.alive(id);
    if (!record) return false;
    record.lastSeen = this.now();
    return true;
  }

  /** El juego se apaga y avisa. false si no estaba. */
  remove(id: string): boolean {
    const existed = this.games.delete(id);
    if (existed) this.emit("removed", id);
    return existed;
  }

  /** Juegos vivos, ordenados por nombre. */
  list(): GameEntry[] {
    this.sweep();
    return [...this.games.values()]
      .map(toEntry)
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  /** Saca los juegos que dejaron de latir. Devuelve cuántos sacó. */
  sweep(): number {
    let n = 0;
    for (const id of [...this.games.keys()]) if (!this.alive(id)) n++;
    return n;
  }

  /** El registro de un juego si sigue vivo; si venció, lo borra y avisa. */
  private alive(id: string): Slot | undefined {
    const record = this.games.get(id);
    if (!record) return undefined;
    if (this.now() - record.lastSeen <= this.timeoutMs) return record;
    this.games.delete(id);
    this.emit("expired", id);
    return undefined;
  }
}

function toEntry(r: Slot): GameEntry {
  return {
    ...r.manifest,
    registeredAt: new Date(r.registeredAt).toISOString(),
    lastSeen: new Date(r.lastSeen).toISOString(),
  };
}
