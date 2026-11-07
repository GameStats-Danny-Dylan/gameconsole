import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { GameRegistry } from "../src/registry.js";
import { createRegistryServer } from "../src/server.js";
import { connect4 } from "./fixtures.js";

let server: Server;
let base: string;

before(async () => {
  server = createRegistryServer(new GameRegistry());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

const call = (method: string, path: string, body?: unknown) =>
  fetch(base + path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });

test("health", async () => {
  const res = await call("GET", "/health");
  assert.equal(res.status, 200);
  assert.equal((await res.json()).status, "ok");
});

test("ciclo completo: registrar, latir, listar, irse", async () => {
  let res = await call("POST", "/games", connect4());
  assert.equal(res.status, 201);
  assert.equal((await res.json()).id, "connect4");

  res = await call("PUT", "/games/connect4/heartbeat");
  assert.equal(res.status, 204);

  res = await call("GET", "/games");
  assert.equal(res.status, 200);
  const list = await res.json();
  assert.equal(list.length, 1);
  assert.equal(list[0].entry, "/games/connect4/");
  assert.ok(list[0].lastSeen);

  res = await call("DELETE", "/games/connect4");
  assert.equal(res.status, 204);
  assert.deepEqual(await (await call("GET", "/games/")).json(), []); // la barra final da igual
});

test("latido o DELETE de un juego no registrado: 404", async () => {
  assert.equal((await call("PUT", "/games/fantasma/heartbeat")).status, 404);
  const res = await call("DELETE", "/games/fantasma");
  assert.equal(res.status, 404);
  assert.match((await res.json()).error, /POST \/games/);
});

test("manifiesto inválido o JSON roto: 400 con motivo", async () => {
  let res = await call("POST", "/games", connect4({ protocol: "otro" }));
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /protocol/);

  res = await call("POST", "/games", "{no es json");
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /JSON/);
});

test("cuerpo demasiado grande: 413", async () => {
  const res = await call("POST", "/games", connect4({ description: "x".repeat(70_000) }));
  assert.equal(res.status, 413);
});

test("ruta desconocida 404 y método equivocado 405", async () => {
  assert.equal((await call("GET", "/nada")).status, 404);
  assert.equal((await call("DELETE", "/games")).status, 405);
  assert.equal((await call("GET", "/games/connect4/heartbeat")).status, 405);
});
