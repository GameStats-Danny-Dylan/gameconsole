import { defineConfig } from "vitest/config";

// El juego se sirve bajo /games/tetris/ (protocolo, sección 1): nginx no
// quita el prefijo, así que todas las rutas de los archivos lo llevan.
// En desarrollo, /api va al gateway del docker compose (localhost:8000).
export default defineConfig({
  base: "/games/tetris/",
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8000" },
  },
  test: {
    environment: "node",
  },
});
