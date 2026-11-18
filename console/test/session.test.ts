import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FINISHED_TIMEOUT_MS, READY_TIMEOUT_MS } from "../src/match/MatchSession";
import { ORIGIN, contractEvent, harness } from "./support/matchFakes";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

/** Una partida ya en playing: cargó, mandó INIT, recibió READY y mandó START. */
function playing() {
  const h = harness();
  const m = h.open();
  m.frame.load();
  m.fromGame("READY");
  return { ...h, ...m };
}

describe("MatchSession: secuencia normal", () => {
  it("el iframe se abre en {entry}?matchId=...", () => {
    const { frame, session } = harness().open();
    expect(frame.src).toBe(`/games/fichas/?matchId=${session.matchId}`);
    expect(frame.title).toBe("Fichas: Ana vs CPU");
  });

  it("empieza en loading y no manda nada hasta que carga el iframe", () => {
    const { session, frame } = harness().open();
    expect(session.status).toBe("loading");
    expect(frame.posted).toEqual([]);
  });

  it("al cargar manda INIT con el MatchContext, solo al origen propio", () => {
    const { session, frame } = harness().open();
    frame.load();
    expect(frame.posted).toEqual([
      { protocol: "gameconsole/1", type: "INIT", matchId: session.matchId, payload: session.context },
    ]);
    expect(frame.origins).toEqual([ORIGIN]);
  });

  it("si el iframe recarga, INIT no se repite", () => {
    const { frame } = harness().open();
    frame.load();
    frame.load();
    expect(frame.types()).toEqual(["INIT"]);
  });

  it("con READY pasa por ready, manda START y queda en playing", () => {
    const { session, frame, fromGame } = harness().open();
    const seen: string[] = [];
    session.onChange((s) => seen.push(s.status));
    frame.load();
    fromGame("READY");
    expect(seen).toEqual(["ready", "playing"]);
    expect(frame.types()).toEqual(["INIT", "START"]);
  });

  it("pausar y reanudar desde la UI", () => {
    const { session, frame } = playing();
    session.pause("user");
    expect(session.status).toBe("paused");
    expect(session.pauseReason).toBe("user");
    session.resume();
    expect(session.status).toBe("playing");
    expect(frame.posted.slice(2).map((m) => [m.type, m.payload])).toEqual([["PAUSE", { reason: "user" }], ["RESUME", {}]]);
  });

  it("STOP: espera FINISHED, lo publica y cierra", async () => {
    const { session, frame, fromGame, published } = playing();
    const closed = session.stop("user");
    expect(session.status).toBe("stopping");
    expect(frame.posted.at(-1)).toMatchObject({ type: "STOP", payload: { reason: "user" } });
    expect(frame.removed).toBe(false);   // el juego todavía puede mandar MATCH_FINISHED
    fromGame("FINISHED", { winner: null, reason: "stopped" });
    await closed;
    expect(session.status).toBe("finished");
    expect(frame.removed).toBe(true);
    expect(published).toContainEqual({ topic: "finished", payload: { matchId: session.matchId, winner: null, reason: "stopped" } });
  });

  it("el juego termina solo: finished con el resultado y el iframe se queda", () => {
    const { session, frame, fromGame } = playing();
    fromGame("FINISHED", { winner: "ana", reason: "normal" });
    expect(session.status).toBe("finished");
    expect(session.result).toEqual({ winner: "ana", reason: "normal" });
    expect(frame.removed).toBe(false);
  });

  it("cerrar una partida terminada solo quita el iframe, sin STOP", async () => {
    const { session, frame, fromGame } = playing();
    fromGame("FINISHED", { winner: "ana", reason: "normal" });
    await session.stop("user");
    expect(frame.types()).not.toContain("STOP");
    expect(frame.removed).toBe(true);
  });
});

describe("MatchSession: transiciones inválidas se ignoran", () => {
  it("nunca manda START antes de READY ni PAUSE/RESUME en loading", () => {
    const { session, frame } = harness().open();
    frame.load();
    session.pause("user");
    session.resume();
    expect(session.status).toBe("loading");
    expect(frame.types()).toEqual(["INIT"]);
  });

  it("un segundo READY no manda otro START", () => {
    const { frame, fromGame } = playing();
    fromGame("READY");
    expect(frame.types()).toEqual(["INIT", "START"]);
  });

  it("no manda PAUSE si no está en playing (ya pausada)", () => {
    const { session, frame } = playing();
    session.pause("user");
    session.pause("user");
    session.pause("hidden");
    expect(frame.types().filter((t) => t === "PAUSE")).toHaveLength(1);
  });

  it("RESUME solo desde paused", () => {
    const { session, frame } = playing();
    session.resume();
    expect(frame.types()).not.toContain("RESUME");
  });

  it("después de STOP no se aceptan comandos ni otro STOP", () => {
    const { session, frame } = playing();
    void session.stop("user");
    session.pause("user");
    session.resume();
    void session.stop("user");
    expect(frame.types()).toEqual(["INIT", "START", "STOP"]);
  });

  it("en finished todo se ignora", () => {
    const { session, frame, fromGame } = playing();
    fromGame("FINISHED", { winner: "ana", reason: "normal" });
    session.pause("user");
    session.resume();
    fromGame("READY");
    expect(frame.types()).toEqual(["INIT", "START"]);
    expect(session.status).toBe("finished");
  });

  it("STOP en loading no se manda: solo se quita el iframe", async () => {
    const { session, frame } = harness().open();
    frame.load();
    await session.stop("user");
    expect(frame.types()).toEqual(["INIT"]);
    expect(frame.removed).toBe(true);
  });
});

describe("MatchSession: tiempos límite", () => {
  it("sin READY en 10 s pasa a error y se cierra", async () => {
    const { session, frame } = harness().open();
    frame.load();
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS - 1);
    expect(session.status).toBe("loading");
    await vi.advanceTimersByTimeAsync(1);
    expect(session.status).toBe("error");
    expect(session.error).toMatch(/10 s/);
    expect(frame.removed).toBe(true);
    await expect(session.closed).resolves.toBeUndefined();
  });

  it("el plazo de READY cuenta aunque el iframe nunca cargue", async () => {
    const { session } = harness().open();
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS);
    expect(session.status).toBe("error");
  });

  it("con READY a tiempo el plazo ya no corre", async () => {
    const { session } = playing();
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS * 2);
    expect(session.status).toBe("playing");
  });

  it("un READY que llega después del plazo se ignora", async () => {
    const { session, frame, fromGame } = harness().open();
    frame.load();
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS);
    fromGame("READY");
    expect(frame.types()).toEqual(["INIT"]);
    expect(session.status).toBe("error");
  });

  it("tras STOP, sin FINISHED en 2 s la consola cierra por su cuenta", async () => {
    const { session, frame } = playing();
    void session.stop("user");
    await vi.advanceTimersByTimeAsync(FINISHED_TIMEOUT_MS - 1);
    expect(frame.removed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(frame.removed).toBe(true);
    expect(session.status).toBe("finished");
    expect(session.result).toBeNull();
  });

  it("un FINISHED a tiempo cancela el cierre de respaldo", async () => {
    const { session, fromGame } = playing();
    const changes: string[] = [];
    void session.stop("user");
    fromGame("FINISHED", { winner: null, reason: "stopped" });
    session.onChange((s) => changes.push(s.status));
    await vi.advanceTimersByTimeAsync(FINISHED_TIMEOUT_MS * 2);
    expect(changes).toEqual([]);
  });
});

describe("MatchSession: errores", () => {
  it("ERROR fatal cierra la partida", () => {
    const { session, frame, fromGame } = playing();
    fromGame("ERROR", { message: "se rompió", fatal: true });
    expect(session.status).toBe("error");
    expect(session.error).toBe("se rompió");
    expect(frame.removed).toBe(true);
  });

  it("ERROR fatal en loading también cierra", () => {
    const { session, frame, fromGame } = harness().open();
    frame.load();
    fromGame("ERROR", { message: "no cargó", fatal: true });
    expect(session.status).toBe("error");
  });

  it("ERROR no fatal solo se registra", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { session, frame, fromGame } = playing();
    fromGame("ERROR", { message: "algo menor", fatal: false });
    expect(session.status).toBe("playing");
    expect(frame.removed).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe("MatchSession: EventBus", () => {
  it("publica GAME_EVENT y STATE con su matchId", () => {
    const { session, fromGame, published } = playing();
    const event = contractEvent(session.matchId);
    fromGame("STATE", { state: "playing" });
    fromGame("GAME_EVENT", { event });
    expect(published).toEqual([
      { topic: "state", payload: { matchId: session.matchId, state: "playing" } },
      { topic: "game-event", payload: { matchId: session.matchId, event } },
    ]);
  });

  it("sigue publicando los eventos que llegan mientras se cierra (PLAYER_LEFT, MATCH_FINISHED)", () => {
    const { session, fromGame, published } = playing();
    void session.stop("user");
    fromGame("GAME_EVENT", { event: contractEvent(session.matchId, 7) });
    expect(published.filter((p) => p.topic === "game-event")).toHaveLength(1);
  });

  it("después de cerrada ya no publica nada", async () => {
    const { session, fromGame, published } = playing();
    fromGame("ERROR", { message: "x", fatal: true });
    fromGame("GAME_EVENT", { event: contractEvent(session.matchId) });
    expect(published).toEqual([]);
  });
});

describe("MatchSession: partidas ocultas", () => {
  it("si deja de verse en playing manda PAUSE hidden", () => {
    const { session, frame } = playing();
    session.setVisible(false);
    expect(session.status).toBe("paused");
    expect(session.pauseReason).toBe("hidden");
    expect(frame.posted.at(-1)).toMatchObject({ type: "PAUSE", payload: { reason: "hidden" } });
  });

  it("al volver a verse NO reanuda sola: solo avisa para resaltar Reanudar", () => {
    const { session, frame } = playing();
    session.setVisible(false);
    expect(session.resumeHint).toBe(false);
    session.setVisible(true);
    expect(frame.types()).not.toContain("RESUME");
    expect(session.status).toBe("paused");
    expect(session.resumeHint).toBe(true);
    session.resume();
    expect(frame.types().at(-1)).toBe("RESUME");
    expect(session.resumeHint).toBe(false);
  });

  it("una pausa del usuario no la pisa la de oculta", () => {
    const { session, frame } = playing();
    session.pause("user");
    session.setVisible(false);
    session.setVisible(true);
    expect(session.pauseReason).toBe("user");
    expect(session.resumeHint).toBe(false);
    expect(frame.types().filter((t) => t === "PAUSE")).toHaveLength(1);
  });

  it("oculta en loading no manda nada, pero si arranca oculta se pausa enseguida", () => {
    const { session, frame, fromGame } = harness().open();
    session.setVisible(false);
    frame.load();
    expect(frame.types()).toEqual(["INIT"]);
    fromGame("READY");
    expect(frame.types()).toEqual(["INIT", "START", "PAUSE"]);
    expect(session.pauseReason).toBe("hidden");
  });

  it("oculta y visible varias veces manda un solo PAUSE", () => {
    const { session, frame } = playing();
    session.setVisible(false);
    session.setVisible(true);
    session.setVisible(false);
    expect(frame.types().filter((t) => t === "PAUSE")).toHaveLength(1);
  });

  it("enfocar la partida enfoca su iframe", () => {
    const { session, frame } = playing();
    session.focus();
    expect(frame.focused).toBe(1);
  });
});
