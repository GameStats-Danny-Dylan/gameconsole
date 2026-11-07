/**
 * main.ts — arranque del registry.
 *
 * Variables de entorno:
 *   PORT                 puerto (8080)
 *   HEARTBEAT_TIMEOUT_MS sin latido durante este tiempo, el juego se considera caído (15000)
 */
import { GameRegistry } from "./registry.js";
import { createRegistryServer } from "./server.js";

const port = Number(process.env.PORT ?? 8080);
const timeoutMs = Number(process.env.HEARTBEAT_TIMEOUT_MS ?? 15_000);

const registry = new GameRegistry(timeoutMs);

// Observer: el log se suscribe a lo que pasa en el registry.
registry.on("registered", (g, isNew) =>
  console.log(`[registry] ${isNew ? "nuevo juego" : "actualizado"}: ${g.id} (${g.name} ${g.version}) en ${g.entry}`));
registry.on("removed", (id) => console.log(`[registry] ${id} se fue`));
registry.on("expired", (id) => console.log(`[registry] ${id} dejó de latir: fuera de la lista`));

// Aunque nadie pida la lista, revisa cada 5 s quién dejó de latir (para el log).
const sweeper = setInterval(() => registry.sweep(), 5_000);
sweeper.unref();

const server = createRegistryServer(registry);
server.listen(port, () =>
  console.log(`[registry] escuchando en el puerto ${port} (caído tras ${timeoutMs / 1000} s sin latido)`));

// docker stop manda SIGTERM: cerrar ordenado.
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    console.log(`[registry] ${signal}: apagando`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2_000).unref();
  });
