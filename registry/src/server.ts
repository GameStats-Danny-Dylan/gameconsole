/**
 * server.ts — las rutas HTTP del registry (protocolo, sección 3).
 *
 * nginx publica todo bajo /api/registry/ y quita ese prefijo, así que aquí
 * las rutas no lo llevan. Los juegos, dentro de Docker, llaman directo:
 *
 *   POST   /games                  registrar (cuerpo: el manifiesto)  -> 201
 *   PUT    /games/{id}/heartbeat   latido                             -> 204 | 404
 *   DELETE /games/{id}             se va de la lista                  -> 204 | 404
 *   GET    /games                  juegos vivos                       -> 200
 *   GET    /health                                                    -> 200
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { validateManifest } from "./manifest.js";
import type { GameRegistry } from "./registry.js";

const MAX_BODY = 64 * 1024; // un manifiesto ocupa ~1 KB

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function createRegistryServer(registry: GameRegistry): Server {
  return createServer((req, res) => {
    route(registry, req, res).catch((err: unknown) => {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof Error ? err.message : String(err);
      if (status === 500) console.error("[registry] error inesperado:", err);
      send(res, status, { error: message });
    });
  });
}

async function route(registry: GameRegistry, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = new URL(req.url ?? "/", "http://registry").pathname.replace(/\/+$/, "") || "/";
  const method = req.method ?? "GET";
  const parts = path.split("/").filter(Boolean); // "/games/x/heartbeat" -> ["games","x","heartbeat"]

  if (path === "/health") {
    allow(method, ["GET"]);
    return send(res, 200, { status: "ok", games: registry.list().length });
  }

  if (path === "/games") {
    allow(method, ["GET", "POST"]);
    if (method === "GET") return send(res, 200, registry.list());

    const check = validateManifest(await readJson(req));
    if (!check.ok) throw new HttpError(400, check.error);
    return send(res, 201, registry.register(check.manifest));
  }

  if (parts[0] === "games" && parts.length === 3 && parts[2] === "heartbeat") {
    allow(method, ["PUT"]);
    if (!registry.heartbeat(parts[1])) throw notRegistered(parts[1]);
    return send(res, 204);
  }

  if (parts[0] === "games" && parts.length === 2) {
    allow(method, ["DELETE"]);
    if (!registry.remove(parts[1])) throw notRegistered(parts[1]);
    return send(res, 204);
  }

  throw new HttpError(404, `no existe la ruta ${path}`);
}

const notRegistered = (id: string) =>
  new HttpError(404, `el juego "${id}" no está registrado; vuelve a mandar el manifiesto con POST /games`);

function allow(method: string, methods: string[]): void {
  if (!methods.includes(method)) throw new HttpError(405, `método ${method} no permitido; usa ${methods.join(" o ")}`);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, "el manifiesto es demasiado grande (máximo 64 KB)");
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "el cuerpo no es JSON válido");
  }
}

function send(res: ServerResponse, status: number, body?: unknown): void {
  if (body === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
