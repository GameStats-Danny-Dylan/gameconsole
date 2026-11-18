/**
 * GameServer — patrón Facade: arranca y apaga, en un solo paso, todo lo que
 * necesita el contenedor de un juego: el servidor de archivos y el registro
 * con latido. main.ts solo lee las variables de entorno y llama aquí.
 */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { RegistryClient } from "./RegistryClient.js";
import { StaticServer, normalizeBase } from "./StaticServer.js";

export interface GameServerConfig {
  port: number;
  /** Carpeta del build (con game.json e index.html). */
  gameDir: string;
  /** Prefijo; por defecto /games/{id}/ con el id del manifiesto. */
  gameBase?: string;
  /** Sin registryUrl, el juego se sirve pero no se anota en ningún registry. */
  registryUrl?: string;
  host?: string;
  heartbeatMs?: number;
  retryMs?: number;
  log?: (message: string) => void;
}

export interface RunningGameServer {
  port: number;
  base: string;
  manifest: { id: string; entry?: string } & Record<string, unknown>;
  registry: RegistryClient | null;
  /** DELETE en el registry y cierre del servidor. */
  stop(): Promise<void>;
}

/** Lee {gameDir}/game.json. Lanza un error claro si no está o no tiene id. */
export async function readManifest(gameDir: string): Promise<RunningGameServer["manifest"]> {
  const file = join(resolve(gameDir), "game.json");
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new Error(`no se encontró ${file}: el build del juego debe incluir game.json (en public/)`);
  }
  const manifest = JSON.parse(raw) as RunningGameServer["manifest"];
  if (typeof manifest?.id !== "string" || !manifest.id) throw new Error(`${file} no tiene "id"`);
  return manifest;
}

export async function startGameServer(config: GameServerConfig): Promise<RunningGameServer> {
  const log = config.log ?? ((m: string) => console.log(m));
  const manifest = await readManifest(config.gameDir);
  const base = normalizeBase(config.gameBase || `/games/${manifest.id}/`);
  if (manifest.entry !== undefined && manifest.entry !== base)
    log(`[game-server] aviso: entry del manifiesto es "${manifest.entry}" pero se sirve bajo "${base}"`);

  const files = new StaticServer({ root: config.gameDir, base, manifest });
  const address = await files.listen(config.port, config.host);
  log(`[game-server] ${manifest.id} en el puerto ${address.port}, bajo ${base}`);

  let registry: RegistryClient | null = null;
  if (config.registryUrl) {
    registry = new RegistryClient({
      registryUrl: config.registryUrl, manifest,
      heartbeatMs: config.heartbeatMs, retryMs: config.retryMs, log,
    });
    registry.start();
  } else {
    log("[game-server] sin REGISTRY_URL: el juego no se anota en el registry");
  }

  let stopping: Promise<void> | null = null;
  return {
    port: address.port,
    base,
    manifest,
    registry,
    stop: () => (stopping ??= (async () => {
      await registry?.stop();
      await files.close();
    })()),
  };
}
