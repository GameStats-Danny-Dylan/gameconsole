import { defineConfig } from "vitest/config";

// El juego se sirve bajo /games/fighting/ (protocolo, sección 1): nginx no
// quita el prefijo, así que todas las rutas de los archivos lo llevan.
// La pelea no llama a ninguna API: no hace falta proxy en desarrollo.
export default defineConfig({
  base: "/games/fighting/",
  server: { port: 5175 },
  test: { environment: "node" },
});
