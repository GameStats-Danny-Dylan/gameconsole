import { defineConfig } from "vitest/config";

// La consola se sirve en "/". En desarrollo, /api, /games y /panel van al
// gateway del compose (las rutas del código son siempre relativas).
export default defineConfig({
  base: "/",
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/games": "http://localhost:8000",
      "/panel": "http://localhost:8000",
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
