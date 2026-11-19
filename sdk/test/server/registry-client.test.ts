/**
 * RegistryClient contra un registry falso: registro, latido, nuevo registro
 * tras 404, reintentos y DELETE al apagar (protocolo, sección 3).
 */
import { afterEach, describe, expect, test } from "vitest";
import { RegistryClient } from "../../server/RegistryClient.js";
import { FakeRegistry, MANIFEST, freePort, sleep, waitFor } from "./support.js";

const HEARTBEAT = 25;
let registry: FakeRegistry;
let client: RegistryClient | null = null;
const logs: string[] = [];

const newClient = (url: string) =>
  (client = new RegistryClient({
    registryUrl: url, manifest: MANIFEST, heartbeatMs: HEARTBEAT, retryMs: 15, timeoutMs: 500,
    log: (m) => logs.push(m),
  }));

afterEach(async () => {
  await client?.stop();
  client = null;
  await registry?.stop();
  logs.length = 0;
});

describe("RegistryClient", () => {
  test("al arrancar manda POST /games con el manifiesto", async () => {
    registry = await new FakeRegistry().start();
    newClient(registry.url).start();
    await waitFor(() => registry.count("POST") === 1);
    expect(registry.hits[0]).toEqual({ method: "POST", path: "/games", body: MANIFEST });
    await waitFor(() => client!.isRegistered);
  });

  test("después manda el latido PUT /games/{id}/heartbeat cada heartbeatMs", async () => {
    registry = await new FakeRegistry().start();
    newClient(registry.url).start();
    await waitFor(() => registry.count("PUT", "/games/hello/heartbeat") >= 3);
    expect(registry.count("POST")).toBe(1); // no se vuelve a registrar mientras el latido da 204
    const times: number[] = [];
    const before = registry.count("PUT");
    const start = Date.now();
    await waitFor(() => registry.count("PUT") >= before + 2);
    times.push(Date.now() - start);
    expect(times[0]).toBeGreaterThanOrEqual(HEARTBEAT); // no se manda más seguido que el intervalo
  });

  test("la URL del registry puede terminar en /", async () => {
    registry = await new FakeRegistry().start();
    newClient(`${registry.url}/`).start();
    await waitFor(() => registry.count("POST", "/games") === 1);
  });

  test("si el latido da 404 (el registry se reinició), vuelve a mandar el POST", async () => {
    registry = await new FakeRegistry().start();
    newClient(registry.url).start();
    await waitFor(() => registry.count("PUT") >= 1);
    registry.registered.clear(); // el registry "olvidó" el juego
    await waitFor(() => registry.count("POST") === 2);
    expect(registry.hits.at(-1)).toMatchObject({ method: "POST", path: "/games", body: MANIFEST });
    await waitFor(() => registry.count("PUT") >= 3); // y sigue latiendo
    expect(logs.some((l) => l.includes("se registra de nuevo"))).toBe(true);
  });

  test("si el registry todavía no arrancó, reintenta hasta que aparece", async () => {
    const port = await freePort();
    newClient(`http://127.0.0.1:${port}`).start();
    await sleep(60); // varios intentos fallidos
    expect(client!.isRegistered).toBe(false);
    registry = await new FakeRegistry().start(port);
    await waitFor(() => client!.isRegistered);
    expect(registry.count("POST")).toBe(1);
    // El aviso "no responde" se escribe una sola vez, no en cada intento.
    expect(logs.filter((l) => l.includes("no responde")).length).toBe(1);
  });

  test("si el registry responde 503, reintenta", async () => {
    registry = await new FakeRegistry().start();
    let failures = 2;
    registry.respond = (hit) => (hit.method === "POST" && failures-- > 0 ? 503 : 201);
    newClient(registry.url).start();
    await waitFor(() => client!.isRegistered);
    expect(registry.count("POST")).toBe(3);
  });

  test("si el registry se cae un rato, al volver se registra de nuevo", async () => {
    registry = await new FakeRegistry().start();
    newClient(registry.url).start();
    await waitFor(() => registry.count("PUT") >= 1);
    const port = registry.port;
    await registry.stop();
    await sleep(HEARTBEAT * 3); // latidos que no llegan
    registry = await new FakeRegistry().start(port); // vuelve vacío
    await waitFor(() => registry.count("POST") === 1);
    expect(registry.registered.has("hello")).toBe(true);
  });

  test("stop(): DELETE /games/{id} y no más latidos", async () => {
    registry = await new FakeRegistry().start();
    newClient(registry.url).start();
    await waitFor(() => registry.count("PUT") >= 1);
    await client!.stop();
    expect(registry.hits.at(-1)).toMatchObject({ method: "DELETE", path: "/games/hello" });
    expect(registry.registered.has("hello")).toBe(false);
    const total = registry.hits.length;
    await sleep(HEARTBEAT * 3);
    expect(registry.hits.length).toBe(total);
  });

  test("stop() con el registry caído no lanza", async () => {
    const port = await freePort();
    newClient(`http://127.0.0.1:${port}`).start();
    await sleep(20);
    await expect(client!.stop()).resolves.toBeUndefined();
  });

  test("stop() justo después de start(): el DELETE llega después del POST", async () => {
    registry = await new FakeRegistry().start();
    newClient(registry.url).start();
    await client!.stop();
    expect(registry.hits.map((h) => h.method)).toEqual(["POST", "DELETE"]);
    expect(registry.registered.size).toBe(0);
  });
});
