import { defineConfig } from "vitest/config";

// El panel se sirve bajo /panel/. En desarrollo, /api va al gateway del compose.
export default defineConfig({
  base: "/panel/",
  server: {
    port: 5174,
    proxy: { "/api": "http://localhost:8000" },
  },
  test: { environment: "node" },
});
