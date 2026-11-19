/**
 * StaticServer — sirve los archivos de un juego (protocolo, secciones 1 y 9).
 *
 * El gateway pasa los pedidos de los juegos con
 *     location ~ ^/games/(?<gid>[a-z0-9-]+)/ { proxy_pass http://game-$gid:8080; }
 * Como proxy_pass lleva una variable y no lleva URI, nginx NO quita el
 * prefijo: el juego recibe /games/{id}/... completo. Por eso todo se sirve
 * bajo `base` (GAME_BASE, por ejemplo /games/connect4/):
 *
 *   GET /health                 {"status":"ok"} (healthcheck de Docker; fuera del prefijo)
 *   GET {base}game.json         el manifiesto con el que el juego se registró
 *   GET {base}assets/...        archivos de Vite, con caché larga (llevan hash en el nombre)
 *   GET {base}<archivo>         el archivo de dist/
 *   GET {base}<ruta sin punto>  index.html (fallback, para rutas internas de la app)
 *   GET {base sin la / final}   301 a {base}
 *   lo demás                    404
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, resolve, sep } from "node:path";

export interface StaticServerOptions {
  /** Carpeta con lo que generó el build (dist/). */
  root: string;
  /** Prefijo bajo el que se sirve el juego, con / al principio y al final. */
  base: string;
  /** El manifiesto que se publica en {base}game.json. */
  manifest: object;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
};

/** "/games/x" o "games/x/" -> "/games/x/". */
export function normalizeBase(base: string): string {
  const trimmed = base.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}/` : "/";
}

export class StaticServer {
  readonly server: Server;
  private readonly root: string;
  private readonly base: string;
  private readonly manifestJson: string;

  constructor(options: StaticServerOptions) {
    this.root = resolve(options.root);
    this.base = normalizeBase(options.base);
    this.manifestJson = JSON.stringify(options.manifest);
    this.server = createServer((req, res) => {
      this.handle(req, res).catch((err: unknown) => {
        console.error("[game-server] error inesperado:", err);
        if (!res.headersSent) text(res, 500, "error interno");
        else res.destroy();
      });
    });
  }

  /** Empieza a escuchar. Con port 0, el sistema elige uno libre (para las pruebas). */
  listen(port: number, host?: string): Promise<AddressInfo> {
    return new Promise((ok, fail) => {
      this.server.once("error", fail);
      this.server.listen(port, host, () => {
        this.server.off("error", fail);
        ok(this.server.address() as AddressInfo);
      });
    });
  }

  close(): Promise<void> {
    return new Promise((ok) => {
      this.server.close(() => ok());
      this.server.closeAllConnections();
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("allow", "GET, HEAD");
      return text(res, 405, "método no permitido");
    }
    const url = new URL(req.url ?? "/", "http://game");
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return text(res, 400, "ruta mal codificada");
    }

    if (path === "/health") return json(res, 200, '{"status":"ok"}');

    // Relativa: detrás del gateway o del túnel, una URL absoluta mandaría a otro lado.
    if (`${path}/` === this.base) {
      res.writeHead(301, { location: this.base + url.search }).end();
      return;
    }
    if (!path.startsWith(this.base)) return text(res, 404, `este juego se sirve bajo ${this.base}`);

    const rel = path.slice(this.base.length);
    if (rel === "game.json") return json(res, 200, this.manifestJson, req.method === "HEAD");
    if (rel.includes("\0")) return text(res, 400, "ruta inválida");

    const file = resolve(this.root, `./${rel}`);
    if (file !== this.root && !file.startsWith(this.root + sep)) return text(res, 404, "no existe");

    const found = await this.find(file);
    if (found) return this.sendFile(req, res, found, rel);

    // Fallback a index.html solo para "páginas" (sin extensión): un .js que no
    // existe debe dar 404, no HTML.
    if (extname(rel) === "") {
      const index = await this.find(join(this.root, "index.html"));
      if (index) return this.sendFile(req, res, index, "index.html");
    }
    return text(res, 404, "no existe");
  }

  /** El archivo, o el index.html de la carpeta; null si no hay. */
  private async find(file: string): Promise<string | null> {
    try {
      const s = await stat(file);
      if (s.isFile()) return file;
      if (s.isDirectory()) return this.find(join(file, "index.html"));
    } catch { /* no existe */ }
    return null;
  }

  private sendFile(req: IncomingMessage, res: ServerResponse, file: string, rel: string): void {
    res.writeHead(200, {
      "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
      "cache-control": rel.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-cache",
      "x-content-type-options": "nosniff",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(file).on("error", () => res.destroy()).pipe(res);
  }
}

function json(res: ServerResponse, status: number, body: string, headOnly = false): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-cache" });
  res.end(headOnly ? undefined : body);
}

function text(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}
