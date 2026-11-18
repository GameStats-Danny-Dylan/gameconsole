import { defineConfig } from "vitest/config";

// Las pruebas no usan el DOM: el canal recibe un transporte falso.
export default defineConfig({
  test: {
    environment: "node",
  },
});
