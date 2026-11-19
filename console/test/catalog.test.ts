import { afterEach, describe, expect, it, vi } from "vitest";
import type { GameManifest } from "@gameconsole/sdk";
import { GameCatalog, POLL_MS, type CatalogSnapshot } from "../src/catalog/GameCatalog";
import { RegistryClient, type GameSource } from "../src/catalog/RegistryClient";
import { manifest } from "./fixtures";

/** Una fuente que responde lo que se le diga en cada consulta. */
class FakeSource implements GameSource {
  calls = 0;
  next: GameManifest[] | Error = [];
  async list(): Promise<GameManifest[]> {
    this.calls++;
    if (this.next instanceof Error) throw this.next;
    return this.next.map((g) => ({ ...g }));   // objetos nuevos cada vez, como un JSON recién leído
  }
}

function setup() {
  const source = new FakeSource();
  const catalog = new GameCatalog(source);
  const seen: CatalogSnapshot[] = [];
  catalog.subscribe((s) => seen.push(s));
  return { source, catalog, seen };
}

const a = manifest({ id: "zeta", name: "Zeta" });
const b = manifest({ id: "alfa", name: "Alfa" });

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("GameCatalog", () => {
  it("al suscribirse recibe el estado actual (cargando, sin juegos)", () => {
    const { seen } = setup();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ status: "loading", games: [] });
  });

  it("notifica la lista nueva, ordenada por nombre", async () => {
    const { source, catalog, seen } = setup();
    source.next = [a, b];
    await catalog.refresh();
    expect(seen.at(-1)!.status).toBe("online");
    expect(seen.at(-1)!.games.map((g) => g.id)).toEqual(["alfa", "zeta"]);
    expect(seen.at(-1)!.updatedAt).toBeInstanceOf(Date);
  });

  it("no notifica si la lista no cambió", async () => {
    const { source, catalog, seen } = setup();
    source.next = [a];
    await catalog.refresh();
    await catalog.refresh();
    expect(source.calls).toBe(2);
    expect(seen).toHaveLength(2);   // el inicial y el primer cambio
  });

  it("un juego que aparece o desaparece se notifica", async () => {
    const { source, catalog, seen } = setup();
    source.next = [a, b];
    await catalog.refresh();
    source.next = [a];
    await catalog.refresh();
    expect(seen.at(-1)!.games.map((g) => g.id)).toEqual(["zeta"]);
    expect(catalog.find("alfa")).toBeUndefined();
  });

  it("un cambio en el manifiesto (otra versión) se notifica", async () => {
    const { source, catalog, seen } = setup();
    source.next = [a];
    await catalog.refresh();
    source.next = [{ ...a, version: "2.0.0" }];
    await catalog.refresh();
    expect(seen).toHaveLength(3);
    expect(catalog.find("zeta")!.version).toBe("2.0.0");
  });

  it("si el registry falla, conserva la última lista y marca sin conexión", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { source, catalog, seen } = setup();
    source.next = [a, b];
    await catalog.refresh();
    source.next = new Error("ECONNREFUSED");
    await catalog.refresh();
    expect(seen.at(-1)).toMatchObject({ status: "offline" });
    expect(seen.at(-1)!.games.map((g) => g.id)).toEqual(["alfa", "zeta"]);
  });

  it("varios fallos seguidos avisan una sola vez y al volver queda en línea", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { source, catalog, seen } = setup();
    source.next = new Error("caído");
    await catalog.refresh();
    await catalog.refresh();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(seen).toHaveLength(2);   // loading -> offline, nada más
    source.next = [a];
    await catalog.refresh();
    expect(seen.at(-1)).toMatchObject({ status: "online" });
  });

  it("un fallo antes de la primera respuesta deja el menú vacío pero sin conexión", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { source, catalog } = setup();
    source.next = new Error("caído");
    await catalog.refresh();
    expect(catalog.snapshot).toMatchObject({ status: "offline", games: [], updatedAt: null });
  });

  it("dos refresh a la vez hacen un solo pedido", async () => {
    const { source, catalog } = setup();
    await Promise.all([catalog.refresh(), catalog.refresh()]);
    expect(source.calls).toBe(1);
  });

  it("start consulta enseguida y después cada 10 s; stop deja de consultar", async () => {
    vi.useFakeTimers();
    const { source, catalog } = setup();
    catalog.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(source.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(POLL_MS - 1);
    expect(source.calls).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(source.calls).toBe(2);
    catalog.stop();
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(source.calls).toBe(2);
  });

  it("desuscribirse deja de recibir cambios", async () => {
    const { source, catalog, seen } = setup();
    const extra: CatalogSnapshot[] = [];
    const off = catalog.subscribe((s) => extra.push(s));
    off();
    source.next = [a];
    await catalog.refresh();
    expect(extra).toHaveLength(1);
    expect(seen).toHaveLength(2);
  });

  it("instance() devuelve siempre el mismo catálogo", () => {
    expect(GameCatalog.instance()).toBe(GameCatalog.instance());
  });
});

describe("RegistryClient", () => {
  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

  it("pide /api/registry/games (ruta relativa) y quita registeredAt y lastSeen", async () => {
    const fetchFn = vi.fn((_url: string) => json([{ ...a, registeredAt: "x", lastSeen: "y" }]));
    const games = await new RegistryClient(fetchFn).list();
    expect(fetchFn.mock.calls[0][0]).toBe("/api/registry/games");
    expect(games).toEqual([a]);
  });

  it("descarta las entradas que no parecen un manifiesto", async () => {
    const games = await new RegistryClient(() => json([a, { id: "roto" }, 42, null])).list();
    expect(games.map((g) => g.id)).toEqual(["zeta"]);
  });

  it("falla con una respuesta de error o algo que no es una lista", async () => {
    await expect(new RegistryClient(() => json({ error: "x" }, 503)).list()).rejects.toThrow("503");
    await expect(new RegistryClient(() => json({ games: [] })).list()).rejects.toThrow("lista");
  });
});
