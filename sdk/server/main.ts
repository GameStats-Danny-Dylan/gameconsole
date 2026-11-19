#!/usr/bin/env node
/**
 * game-server — el servidor de cada juego dentro de su contenedor.
 *
 * Variables de entorno:
 *   PORT          puerto (8080)
 *   GAME_DIR      carpeta del build del juego, con game.json (./dist)
 *   GAME_BASE     prefijo bajo el que se sirve (/games/{id}/, con el id de game.json)
 *   REGISTRY_URL  registry dentro de Docker, por ejemplo http://registry:8080
 *                 (sin ella, el juego se sirve pero no se registra)
 */
import { startGameServer } from "./GameServer.js";

const env = process.env;

try {
  const game = await startGameServer({
    port: Number(env.PORT ?? 8080),
    gameDir: env.GAME_DIR ?? "dist",
    gameBase: env.GAME_BASE,
    registryUrl: env.REGISTRY_URL,
  });

  // docker stop manda SIGTERM: salir de la lista del registry y cerrar ordenado.
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.once(signal, () => {
      console.log(`[game-server] ${signal}: apagando`);
      setTimeout(() => process.exit(0), 4_000).unref();
      game.stop().finally(() => process.exit(0));
    });
} catch (err) {
  console.error(`[game-server] no pudo arrancar: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
