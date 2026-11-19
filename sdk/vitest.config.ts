import { defineConfig } from "vitest/config";

// Las pruebas del cliente no usan el DOM (el canal recibe un transporte falso);
// las del servidor levantan servidores HTTP reales en puertos libres.
// Solo test/: los ejemplos (examples/) tienen sus propias dependencias.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
