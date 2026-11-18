/**
 * El canal ignora todo lo que no es de esta partida ni de este protocolo
 * (protocolo, sección 4).
 */
import { describe, expect, test } from "vitest";
import { PROTOCOL } from "../src/protocol";
import { MATCH_ID, ORIGIN, context, flush, setup } from "./support/fakes";

describe("ConsoleChannel: mensajes ignorados", () => {
  const cases: [string, unknown, string?][] = [
    ["otro matchId", { protocol: PROTOCOL, type: "INIT", matchId: "connect4-otra", payload: context({ matchId: "connect4-otra" }) }],
    ["otro protocol", { protocol: "gameconsole/2", type: "INIT", matchId: MATCH_ID, payload: context() }],
    ["sin protocol", { type: "INIT", matchId: MATCH_ID, payload: context() }],
    ["type desconocido", { protocol: PROTOCOL, type: "HELLO", matchId: MATCH_ID, payload: {} }],
    ["otro origen", { protocol: PROTOCOL, type: "INIT", matchId: MATCH_ID, payload: context() }, "http://malo.test"],
    ["INIT con matchId distinto en el payload", { protocol: PROTOCOL, type: "INIT", matchId: MATCH_ID, payload: context({ matchId: "x" }) }],
    ["INIT con modo desconocido", { protocol: PROTOCOL, type: "INIT", matchId: MATCH_ID, payload: { ...context(), mode: "online" } }],
    ["INIT sin players", { protocol: PROTOCOL, type: "INIT", matchId: MATCH_ID, payload: { ...context(), players: undefined } }],
    ["no es un objeto", "INIT"],
    ["null", null],
  ];

  test.each(cases)("%s", async (_name, data, origin) => {
    const { transport, game } = setup();
    transport.deliverRaw(data, origin ?? ORIGIN);
    await flush();
    expect(game.status).toBe("loading");
    expect(game.calls).toEqual([]);
    expect(transport.sent).toEqual([]);
  });

  test("START, PAUSE o STOP de otra partida no hacen nada", async () => {
    const { transport, game } = setup();
    transport.deliver("INIT", context());
    await flush();
    transport.deliver("START", {}, "connect4-otra");
    expect(game.status).toBe("ready");
    transport.deliver("START");
    transport.deliver("PAUSE", { reason: "user" }, "connect4-otra");
    transport.deliver("STOP", { reason: "user" }, "connect4-otra");
    expect(game.status).toBe("playing");
  });

  test("PAUSE con un reason desconocido se ignora", async () => {
    const { transport, game } = setup();
    transport.deliver("INIT", context());
    await flush();
    transport.deliver("START");
    transport.deliver("PAUSE", { reason: "aburrido" });
    expect(game.status).toBe("playing");
  });

  test("sin matchId en la URL, el primer INIT válido fija la partida", async () => {
    const { transport, channel, game } = setup({ matchId: null });
    transport.deliver("START", {}, "connect4-aaa");       // antes de INIT: se ignora
    transport.deliver("INIT", context({ matchId: "connect4-aaa" }), "connect4-aaa");
    await flush();
    expect(channel.matchId).toBe("connect4-aaa");
    transport.deliver("START", {}, "connect4-bbb");       // otra partida: se ignora
    expect(game.status).toBe("ready");
    expect(transport.sent.every((m) => m.matchId === "connect4-aaa" && m.protocol === PROTOCOL)).toBe(true);
  });

  test("lo que manda el juego lleva protocol y matchId", async () => {
    const { transport } = setup();
    transport.deliver("INIT", context());
    await flush();
    expect(transport.sent[0]).toEqual({ protocol: PROTOCOL, type: "READY", matchId: MATCH_ID, payload: {} });
  });
});
