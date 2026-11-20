import { defineConfig } from "vitest/config";

// El juego se sirve bajo /games/fighting/ (protocolo, sección 1): nginx no
// quita el prefijo, así que todas las rutas de los archivos lo llevan.
// La pelea no llama a ninguna API: no hace falta proxy en desarrollo.
export default defineConfig({
  base: "/games/fighting/",
  server: { port: 5175 },
  // Las peleas al azar (events, render) tardan 2-4 s con la máquina libre; con
  // docker construyendo varias imágenes a la vez pasaban de los 5 s por defecto.
  test: { environment: "node", testTimeout: 30_000 },
});
