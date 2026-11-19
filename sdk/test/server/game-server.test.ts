/**
 * StaticServer y GameServer: el juego se sirve bajo su prefijo, como lo manda
 * el gateway (sin quitarlo), con /health, game.json y fallback a index.html.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { startGameServer, type RunningGameServer } from "../../server/GameServer.js";
import { normalizeBase } from "../../server/StaticServer.js";
import { FakeRegistry, MANIFEST, fakeDist, waitFor } from "./support.js";

let dist: Awaited<ReturnType<typeof fakeDist>>;
let game: RunningGameServer | null = null;
const quiet = () => {};

beforeAll(async () => { dist = await fakeDist(); });
afterAll(async () => { await dist.remove(); });
afterEach(async () => { await game?.stop(); game = null; });

/** Pide una ruta al servidor sin seguir redirecciones. */
async function get(path: string, method = "GET") {
  const res = await fetch(`http://127.0.0.1:${game!.port}${path}`, { method, redirect: "manual" });
  return { status: res.status, headers: res.headers, body: await res.text() };
}

describe("StaticServer: rutas", () => {

  test("normalizeBase", () => {
    expect(normalizeBase("/games/x")).toBe("/games/x/");
    expect(normalizeBase("games/x/")).toBe("/games/x/");
    expect(normalizeBase("/")).toBe("/");
  });

  test("/health responde ok, fuera del prefijo", async () => {
    game = await startGameServer({ port: 0, gameDir: dist.dir, log: quiet });
    const r = await get("/health");
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body)).toEqual({ status: "ok" });
  });

  test("el prefijo por defecto es /games/{id}/ y se sirve con el prefijo completo (como lo pasa el gateway)", async () => {
    game = await startGameServer({ port: 0, gameDir: dist.dir, log: quiet });
    expect(game.base).toBe("/games/hello/");
    const r = await get("/games/hello/");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("no-cache");
    expect(r.body).toContain("<title>hola</title>");
  });

  test("sin el prefijo no sirve nada: / da 404 y /assets/... también", async () => {
    game = await startGameServer({ port: 0, gameDir: dist.dir, log: quiet });
    expect((await get("/")).status).toBe(404);
    expect((await get("/assets/index-abc123.js")).status).toBe(404);
    expect((await get("/games/otro/")).status).toBe(404);
  });

  test("/games/hello sin la / final redirige (relativo) a /games/hello/, con la query", async () => {
    game = await startGameServer({ port: 0, gameDir: dist.dir, log: quiet });
    const r = await get("/games/hello?matchId=hello-1");
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("/games/hello/?matchId=hello-1");
  });

  test("la query (?matchId=...) no molesta", async () => {
    game = await startGameServer({ port: 0, gameDir: dist.dir, log: quiet });
    expect((await get("/games/hello/?matchId=hello-123")).body).toContain("hola");
  });

  test("assets con caché larga y su tipo", async () => {
    game = await startGameServer({ port: 0, gameDir: dist.dir, log: quiet });
    const r = await get("/games/hello/assets/index-abc123.js");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect((await get("/games/hello/icon.svg")).headers.get("content-type")).toBe("image/svg+xml");
  });

  test("game.json publica el manifiesto", async () => {
    game = await startGameServer({ port: 0, gameDir: dist.dir, log: quiet });
    const r = await get("/games/hello/game.json");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(JSON.parse(r.body)).toEqual(MANIFEST);
  });

  test("fallback: una ruta sin extensión da index.html; un archivo que falta da 404", async () => {
    game = await startGameServer({ port: 0, gameDir: dist.dir, log: quiet });
    const page = await get("/games/hello/partida/123");
    expect(page.status).toBe(200);
    expect(page.body).toContain("<title>hola</title>");
    expect((await get("/games/hello/assets/no-existe.js")).status).toBe(404);
  });

  test("no deja salir de la carpeta (../ codificado)", async () => {
    game = await startGameServer({ port: 0, gameDir: dist.dir, log: quiet });
    const r = await get("/games/hello/%2e%2e/%2e%2e/etc/hosts");
    expect(r.status).toBe(404);
    expect((await get("/games/hello/..%2f..%2fgame.json")).status).toBe(404);
  });

  test("HEAD sin cuerpo y POST no permitido", async () => {
    game = await startGameServer({ port: 0, gameDir: dist.dir, log: quiet });
    const head = await get("/games/hello/", "HEAD");
    expect(head.status).toBe(200);
    expect(head.body).toBe("");
    expect((await get("/games/hello/", "POST")).status).toBe(405);
  });

  test("GAME_BASE cambia el prefijo y avisa si no coincide con entry", async () => {
    const logs: string[] = [];
    game = await startGameServer({ port: 0, gameDir: dist.dir, gameBase: "/otra/ruta", log: (m) => logs.push(m) });
    expect(game.base).toBe("/otra/ruta/");
    expect((await get("/otra/ruta/")).status).toBe(200);
    expect((await get("/games/hello/")).status).toBe(404);
    expect(logs.some((l) => l.includes("aviso: entry"))).toBe(true);
  });

  test("sin game.json no arranca, con un mensaje claro", async () => {
    await expect(startGameServer({ port: 0, gameDir: `${dist.dir}/assets`, log: quiet }))
      .rejects.toThrow(/game\.json/);
  });
});

describe("GameServer con el registry", () => {
  let registry: FakeRegistry;
  afterEach(async () => { await game?.stop(); game = null; await registry.stop(); });

  test("se registra con el game.json de la carpeta, late y al apagar manda DELETE", async () => {
    registry = await new FakeRegistry().start();
    game = await startGameServer({
      port: 0, gameDir: dist.dir, registryUrl: registry.url, heartbeatMs: 20, log: quiet,
    });
    await waitFor(() => registry.count("PUT", "/games/hello/heartbeat") >= 2);
    expect(registry.hits[0]).toEqual({ method: "POST", path: "/games", body: MANIFEST });

    await game.stop();
    game = null;
    expect(registry.hits.at(-1)).toMatchObject({ method: "DELETE", path: "/games/hello" });
    expect(registry.registered.size).toBe(0);
  });

  test("sin registryUrl se sirve igual, sin registrarse", async () => {
    registry = await new FakeRegistry().start();
    game = await startGameServer({ port: 0, gameDir: dist.dir, log: quiet });
    expect(game.registry).toBeNull();
    expect((await get("/games/hello/")).status).toBe(200);
    expect(registry.hits).toEqual([]);
  });
});
