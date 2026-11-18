import { defineConfig } from "vite";

// Se sirve bajo /games/hello/: el gateway no quita el prefijo (protocolo, sección 1).
export default defineConfig({
  base: "/games/hello/",
});
