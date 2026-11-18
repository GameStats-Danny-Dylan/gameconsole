/**
 * Para las pruebas del servidor: un registry falso (node:http) que anota cada
 * pedido y responde lo que se le diga, y una carpeta dist/ de mentira.
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Hit {
  method: string;
  path: string;
  body: unknown;
}

export class FakeRegistry {
  readonly hits: Hit[] = [];
  private server: Server | null = null;
  port = 0;
  /** Decide el status de cada pedido; por defecto, como el registry real. */
  respond: (hit: Hit) => number = (hit) =>
    hit.method === "POST" ? 201 : hit.method === "PUT" ? (this.registered.has(idOf(hit)) ? 204 : 404) : 204;
  /** Ids que el registry "tiene"; un POST los agrega y un DELETE los saca. */
  readonly registered = new Set<string>();

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Arranca en un puerto libre, o en uno dado (para "el registry llegó tarde"). */
  async start(port = 0): Promise<this> {
    this.server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const raw = Buffer.concat(chunks).toString("utf8");
      const hit: Hit = { method: req.method ?? "", path: req.url ?? "", body: raw ? JSON.parse(raw) : undefined };
      this.hits.push(hit);
      const status = this.respond(hit);
      if (status < 300) {
        if (hit.method === "POST") this.registered.add((hit.body as { id: string }).id);
        if (hit.method === "DELETE") this.registered.delete(idOf(hit));
      }
      res.writeHead(status, { "content-type": "application/json" }).end(status === 204 ? undefined : "{}");
    });
    await new Promise<void>((ok) => this.server!.listen(port, "127.0.0.1", ok));
    this.port = (this.server.address() as AddressInfo).port;
    return this;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    const s = this.server;
    this.server = null;
    await new Promise<void>((ok) => { s.close(() => ok()); s.closeAllConnections(); });
  }

  count(method: string, path?: string): number {
    return this.hits.filter((h) => h.method === method && (path === undefined || h.path === path)).length;
  }
}

/** "/games/hello/heartbeat" o "/games/hello" -> "hello". */
const idOf = (hit: Hit) => hit.path.split("/")[2] ?? "";

/** Un puerto libre en este momento (se abre y se cierra un servidor). */
export async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((ok) => s.listen(0, "127.0.0.1", ok));
  const { port } = s.address() as AddressInfo;
  await new Promise<void>((ok) => s.close(() => ok()));
  return port;
}

/** Espera hasta que se cumpla la condición (o falla a los `ms`). */
export async function waitFor(condition: () => boolean, ms = 2_000): Promise<void> {
  const until = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > until) throw new Error("tiempo agotado esperando la condición");
    await new Promise((r) => setTimeout(r, 5));
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const MANIFEST = {
  id: "hello",
  name: "Hola",
  version: "1.0.0",
  gameStatsId: "hello",
  gameVersion: "1.0",
  entry: "/games/hello/",
  players: { min: 1, max: 1 },
  modes: ["solo"],
  protocol: "gameconsole/1",
};

/** Una carpeta como la que deja `vite build`. Devuelve su ruta y cómo borrarla. */
export async function fakeDist(manifest: object = MANIFEST): Promise<{ dir: string; remove: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "gc-sdk-"));
  await mkdir(join(dir, "assets"));
  await writeFile(join(dir, "index.html"), "<!doctype html><title>hola</title>");
  await writeFile(join(dir, "assets", "index-abc123.js"), "console.log('hola')");
  await writeFile(join(dir, "icon.svg"), "<svg/>");
  await writeFile(join(dir, "game.json"), JSON.stringify(manifest));
  return { dir, remove: () => rm(dir, { recursive: true, force: true }) };
}
