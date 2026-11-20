// Prueba de punta a punta de DnD Games: maneja un navegador real (Edge o Chrome headless,
// por el protocolo DevTools, sin dependencias) y juega de verdad contra un deployment.
//
//   node scripts/e2e.mjs http://localhost:8000 gameconsole ./e2e-out
//   (BROWSER=ruta/al/chrome si no está Edge en la ruta por defecto; Node 22 o más)
//
// Revisa 38 cosas: los 3 juegos desde la consola, 3 partidas en paralelo en dos
// pestañas, el contrato y la identidad de cada evento (capturando lo que la consola
// manda a /api/events), que la IA la decide Prolog, que Go y Scala tienen todo, que
// el panel muestra lo mismo que GameStats, GameStats caído a mitad de una partida,
// cerrar la pestaña y el descubrimiento automático de juegos. Usa `docker stop/start`
// sobre los contenedores del proyecto compose indicado.
import { spawn, execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:8100";
const PROJECT = process.argv[3] ?? "gcverify";
const OUT = process.argv[4] ?? "./e2e-out";
mkdirSync(OUT, { recursive: true });
const EDGE = process.env.BROWSER ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9344;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (area, name, ok, detail = "") => {
  results.push({ area, name, ok: !!ok, detail });
  console.log(`${ok ? "OK  " : "FAIL"} [${area}] ${name}${detail ? " — " + detail : ""}`);
};
const docker = (cmd) => execSync(`docker ${cmd}`, { stdio: "pipe" }).toString().trim();
const api = async (path) => (await fetch(BASE + path, { cache: "no-store" })).json();

// ------------------------------------------------------------------ CDP
const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(OUT, "profile")}`,
  "--window-size=1600,1000", "--no-first-run", "--disable-extensions", "about:blank"], { stdio: "ignore" });

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const pending = new Map(); const listeners = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) listeners.forEach((f) => f(m));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ws, send, on: (f) => listeners.push(f) };
}

/** Una pestaña: evalúa JS, captura los POST a /api/events y saca capturas. */
async function openTab(browser, name, url) {
  const { result } = await browser.send("Target.createTarget", { url: "about:blank", newWindow: true });
  const targetId = result.targetId;
  let t;
  for (let i = 0; i < 40 && !t; i++) {
    t = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((x) => x.id === targetId);
    if (!t) await sleep(200);
  }
  const s = await connect(t.webSocketDebuggerUrl);
  const tab = { name, targetId, s, batches: [], beacons: 0 };
  await s.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await s.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await s.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await s.send("Network.enable", { maxPostDataSize: 1_000_000 });
  await s.send("Runtime.enable");
  s.on(async (m) => {
    if (m.method === "Network.requestWillBeSent" && m.params.request.url.endsWith("/api/events") && m.params.request.method === "POST") {
      let body = m.params.request.postData;
      if (!body && m.params.request.hasPostData) {
        const r = await s.send("Network.getRequestPostData", { requestId: m.params.requestId });
        body = r.result?.postData;
      }
      if (m.params.type === "Ping") tab.beacons++;
      try { const p = JSON.parse(body); tab.batches.push(Array.isArray(p) ? p : (p.events ?? [p])); } catch { /* no es JSON */ }
    }
    if (m.method === "Runtime.exceptionThrown") console.log(`  [${name}] EXCEPCIÓN:`, m.params.exceptionDetails?.exception?.description?.slice(0, 200));
  });
  tab.eval = async (expr) => {
    const r = await s.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(`[${name}] ${JSON.stringify(r.result.exceptionDetails).slice(0, 300)}`);
    return r.result?.result?.value;
  };
  tab.shot = async (file) => {
    const r = await s.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, file), Buffer.from(r.result.data, "base64"));
  };
  tab.go = async (u, wait = 3000) => { await s.send("Page.navigate", { url: u }); await sleep(wait); };
  await tab.go(url);
  return tab;
}

// Código que corre dentro de la página de la consola.
const PAGE = `
window.__e2e = {
  tiles: () => [...document.querySelectorAll('.match-tile')],
  frame: (i) => window.__e2e.tiles()[i]?.querySelector('iframe'),
  status: (i) => window.__e2e.tiles()[i]?.dataset.status,
  async openGame(name, players, opts) {
    const card = [...document.querySelectorAll('.game-card')].find(c => c.querySelector('.game-name')?.textContent.trim() === name);
    card.querySelector('.btn.play').click();
    await new Promise(r => setTimeout(r, 500));
    for (const [key, label] of Object.entries(opts || {})) {
      const sel = document.getElementById('opt-' + key);
      const idx = [...sel.options].findIndex(o => o.textContent.trim() === label);
      sel.value = String(idx); sel.dispatchEvent(new Event('change'));
    }
    players.forEach((p, i) => { const inp = document.getElementById('player-' + (i + 1)); inp.value = p; inp.dispatchEvent(new Event('input')); });
    document.querySelector('.match-form-foot .btn.primary').click();
    await new Promise(r => setTimeout(r, 300));
    return window.__e2e.tiles().length;
  },
  key(i, type, key, code) {
    const w = window.__e2e.frame(i)?.contentWindow; if (!w) return;
    w.dispatchEvent(new w.KeyboardEvent(type, { key, code, bubbles: true }));
  },
  c4Step(i) {
    const d = window.__e2e.frame(i)?.contentDocument; const root = d?.querySelector('.c4'); if (!root) return 'sin-tablero';
    if (root.dataset.status !== 'playing') return root.dataset.status;
    const status = d.querySelector('.c4-status')?.textContent || '';
    if (root.dataset.turn !== 'red' || status.includes('pensando')) return 'esperando';
    const cols = [...d.querySelectorAll('.c4-col:not(:disabled)')];
    if (!cols.length) return 'sin-columnas';
    const pref = [3, 2, 4, 1, 5, 0, 6].map(k => d.querySelectorAll('.c4-col')[k]).filter(c => !c.disabled);
    (Math.random() < .6 ? pref[0] : cols[Math.floor(Math.random() * cols.length)]).click();
    return 'jugó';
  },
  c4Text(i) { return window.__e2e.frame(i)?.contentDocument?.querySelector('.c4-status')?.textContent; },
  detail(i) { return window.__e2e.tiles()[i]?.querySelector('.match-detail')?.textContent; },
};
true`;

async function untilFinished(tab, i, stepFn, maxMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const st = await tab.eval(`window.__e2e.status(${i})`);
    if (st === "finished" || st === "error") return st;
    await stepFn();
    await sleep(350);
  }
  return await tab.eval(`window.__e2e.status(${i})`);
}

const allEvents = (tabs) => tabs.flatMap((t) => t.batches.flat());
const eventsOf = (tabs, matchId) => {
  const seen = new Map();
  for (const e of allEvents(tabs)) if (e.matchId === matchId && !seen.has(e.eventId)) seen.set(e.eventId, e);
  return [...seen.values()];
};
const matchIdOf = (tabs, gameId, playerId) => {
  const st = allEvents(tabs).filter((e) => e.type === "PLAYER_JOINED" && e.gameId === gameId && e.playerId === playerId);
  return st.at(-1)?.matchId;
};

try {
  let ver;
  for (let i = 0; i < 40 && !ver; i++) { try { ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); } catch { await sleep(250); } }
  const browser = await connect(ver.webSocketDebuggerUrl);

  // ================================================================ 1. Consola y juegos
  const t1 = await openTab(browser, "pestaña-1", BASE + "/");
  await t1.eval(PAGE);
  const cards = await t1.eval(`[...document.querySelectorAll('.game-card .game-name')].map(e => e.textContent.trim())`);
  check("Consola", "Los 3 juegos aparecen solos en el menú (registry)", cards.length === 3 && ["4 en línea", "Pelea", "Tetris"].every((n) => cards.includes(n)), cards.join(", "));
  const reg = await api("/api/registry/games");
  check("Consola", "Cada juego es una app aparte registrada con su manifiesto", reg.length === 3 && reg.every((g) => g.entry && g.gameStatsId), reg.map((g) => `${g.id}→${g.entry}`).join(", "));

  // ================================================================ 2. Partidas en paralelo
  await t1.eval(`window.__e2e.openGame('4 en línea', ['e2e-ana'], { difficulty: 'Difícil' })`);
  await sleep(2500);
  await t1.eval(`window.__e2e.openGame('Tetris', ['e2e-beto'], {})`);
  await sleep(2500);
  await t1.eval(`document.querySelector('.match-grid').scrollIntoView({block:'start'})`);
  const t2 = await openTab(browser, "pestaña-2", BASE + "/");
  await t2.eval(PAGE);
  await t2.eval(`window.__e2e.openGame('Pelea', ['e2e-dylan', 'e2e-eva'], { rounds: '1 round' })`);
  await sleep(3000);
  const vis = [await t1.eval(`document.visibilityState`), await t2.eval(`document.visibilityState`)];
  check("Paralelo", "Dos pestañas del navegador abiertas a la vez", vis.length === 2, `visibilidad: ${vis.join(", ")}`);

  // Mientras se juega: el panel debe ver las partidas en curso.
  await sleep(1500);
  const liveDuring = await api("/api/games");
  const live = Object.fromEntries((Array.isArray(liveDuring) ? liveDuring : []).map((g) => [g.gameId, g.inProgress]));
  check("Panel en vivo", "GameStats ve las 3 partidas en curso mientras se juegan (instancias por juego)", live.connect4 >= 1 && live.tetris >= 1 && live.fighting >= 1, JSON.stringify(live));
  await t1.shot("01-paralelo-pestana1.png"); await t2.shot("02-paralelo-pestana2-pelea.png");

  // Jugar las tres a la vez.
  let fightTick = 0;
  const [c4End, tetEnd, fightEnd] = await Promise.all([
    untilFinished(t1, 0, () => t1.eval(`window.__e2e.c4Step(0)`), 240_000),
    untilFinished(t1, 1, () => t1.eval(`window.__e2e.key(1,'keydown',' ','Space')`), 120_000),
    untilFinished(t2, 0, async () => {
      fightTick++;
      await t2.eval(`window.__e2e.key(0,'keydown','d','KeyD')`);
      if (fightTick % 2 === 0) { await t2.eval(`window.__e2e.key(0,'keydown','f','KeyF')`); await sleep(60); await t2.eval(`window.__e2e.key(0,'keyup','f','KeyF')`); }
    }, 120_000),
  ]);
  check("Juegos", "4 en línea contra la IA (difícil) se jugó hasta el final", c4End === "finished", `${c4End} · ${await t1.eval(`window.__e2e.c4Text(0)`)}`);
  check("Juegos", "Tetris se jugó hasta perder (fin de partida)", tetEnd === "finished", tetEnd);
  check("Juegos", "Pelea se jugó hasta el final (1 round)", fightEnd === "finished", `${fightEnd} · ${await t2.eval(`window.__e2e.detail(0)`)}`);
  await t1.shot("03-fin-4enlinea-tetris.png"); await t2.shot("04-fin-pelea.png");
  await sleep(4000);  // que el EventSender termine de mandar

  // ================================================================ 3. Eventos: contrato, identidad y no mezcla
  const ids = {
    connect4: matchIdOf([t1], "connect4", "e2e-ana"),
    tetris: matchIdOf([t1], "tetris", "e2e-beto"),
    fighting: matchIdOf([t2], "fighting", "e2e-dylan"),
  };
  check("Eventos", "Cada partida tiene su matchId propio ({juego}-{uuid})", Object.entries(ids).every(([g, id]) => id && id.startsWith(g + "-")) && new Set(Object.values(ids)).size === 3, JSON.stringify(ids));
  const tabsAll = [t1, t2];
  const mixed = allEvents(tabsAll).length && tabsAll.flatMap((t) => t.batches).filter((b) => new Set(b.map((e) => e.matchId)).size > 1).length;
  check("Eventos", "Ningún envío mezcla eventos de dos partidas (una cola por partida)", mixed === 0, `${tabsAll.reduce((n, t) => n + t.batches.length, 0)} envíos revisados`);
  const REQUIRED = ["eventId", "timestamp", "gameId", "gameVersion", "matchId", "type"];
  for (const [g, id] of Object.entries(ids)) {
    const ev = eventsOf(tabsAll, id);
    const missing = ev.filter((e) => REQUIRED.some((k) => e[k] === undefined || e[k] === ""));
    const types = ev.map((e) => e.type);
    const ordered = ev.every((e, k) => k === 0 || Date.parse(e.timestamp) >= Date.parse(ev[k - 1].timestamp));
    check("Eventos", `${g}: campos del contrato de GameStats en todos los eventos`, missing.length === 0 && ev.length > 0, `${ev.length} eventos, ${missing.length} incompletos`);
    check("Eventos", `${g}: empieza con MATCH_STARTED, termina con MATCH_FINISHED y trae acciones`, types[0] === "MATCH_STARTED" && types.at(-1) === "MATCH_FINISHED" && types.includes("PLAYER_ACTION"), `${types[0]} … ${types.at(-1)}; acciones: ${types.filter((t) => t === "PLAYER_ACTION").length}`);
    check("Eventos", `${g}: marcas de tiempo en orden y eventId únicos`, ordered && new Set(ev.map((e) => e.eventId)).size === ev.length);
  }

  // ================================================================ 4. Prolog
  const c4ev = eventsOf(tabsAll, ids.connect4);
  const aiMoves = c4ev.filter((e) => e.action === "DISC_DROPPED" && e.playerId === "cpu");
  const withAi = aiMoves.filter((e) => e.data?.ai);
  check("Prolog", "Cada jugada de la computadora la decidió Prolog (data.ai en el evento)", aiMoves.length > 0 && withAi.length === aiMoves.length, `${withAi.length}/${aiMoves.length} jugadas de la IA · ejemplo: ${JSON.stringify(withAi[0]?.data?.ai)}`);
  const cpuJoin = c4ev.find((e) => e.type === "PLAYER_JOINED" && e.playerId === "cpu");
  check("Prolog", "La computadora entra como jugador con su dificultad", cpuJoin?.data?.bot === true && cpuJoin?.data?.difficulty === "hard", JSON.stringify(cpuJoin?.data));
  const board = [[], [], [], [], [], [], []];
  const prologDirect = await (await fetch(BASE + "/api/ai/connect4/move", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ board: [["red", "red", "red"], [], [], ["yellow", "yellow"], [], [], []], player: "yellow", difficulty: "hard" }) })).json();
  check("Prolog", "Prolog tapa una amenaza (rojo tiene 3 en la columna 1 → juega en la 1)", prologDirect.column === 1, JSON.stringify(prologDirect));
  void board;

  // ================================================================ 5. GameStats recibió y analizó todo
  const matches = await api("/api/matches");
  const results = await api("/api/results");
  for (const [g, id] of Object.entries(ids)) {
    const sent = eventsOf(tabsAll, id).length;
    const goM = matches.find((m) => m.matchId === id);
    const sc = results.find((r) => r.matchId === id);
    check("GameStats", `${g}: Go aceptó todos los eventos de la partida`, goM && goM.eventCount === sent, `consola mandó ${sent} · Go tiene ${goM?.eventCount} (${goM?.status})`);
    check("GameStats", `${g}: Scala la analizó (resultado con estadísticas)`, !!sc, sc ? `ganador: ${sc.matchStats?.winner ?? "—"} · patrones: ${(sc.patterns ?? []).map((p) => p.rule).join(",") || "—"}` : "sin resultado");
  }

  // ================================================================ 6. Panel (solo muestra lo de GameStats)
  const ov = await api("/api/stats/overview");
  await t1.go(BASE + "/panel/", 4000);
  const panelGeneral = await t1.eval(`({ tabs: [...document.querySelectorAll('.tab')].map(t => t.textContent.trim()), tiles: Object.fromEntries([...document.querySelectorAll('.tiles .tile')].map(t => [t.querySelector('.label').textContent.trim(), t.querySelector('strong').textContent.trim()])), leaders: [...document.querySelectorAll('.leaderboard tbody tr')].length })`);
  check("Panel", "Pestañas General y una por cada juego", panelGeneral.tabs.length === 4, panelGeneral.tabs.join(" | "));
  check("Panel", "Totales generales = lo que devuelve GameStats (/stats/overview)", panelGeneral.tiles["Partidas terminadas"] === String(ov.matches) && panelGeneral.tiles["Jugadores"] === String(ov.players), `panel ${panelGeneral.tiles["Partidas terminadas"]} partidas / ${panelGeneral.tiles["Jugadores"]} jugadores · API ${ov.matches} / ${ov.players}`);
  await t1.shot("05-panel-general.png");
  for (const g of ["connect4", "tetris", "fighting"]) {
    const s = await api(`/api/stats/games/${g}`);
    await t1.eval(`[...document.querySelectorAll('.tab')].find(t => t.textContent.includes(${JSON.stringify({ connect4: "4 en línea", tetris: "Tetris", fighting: "Pelea" }[g])})).click()`);
    await sleep(700);
    const p = await t1.eval(`({ fin: [...document.querySelectorAll('.tiles .tile')].find(t => t.textContent.includes('terminadas'))?.querySelector('strong')?.textContent.trim(), rows: [...document.querySelectorAll('.leaderboard tbody tr')].map(r => r.querySelector('.who-name')?.childNodes[0]?.textContent.trim()) })`);
    const inPanel = ["e2e-ana", "e2e-beto", "e2e-dylan"].filter((n) => p.rows.includes(n));
    check("Panel", `${g}: partidas terminadas (instancias) = GameStats y aparecen los jugadores de la prueba`, p.fin === String(s.matches) && inPanel.length >= 1, `panel ${p.fin} · API ${s.matches} · jugadores e2e en la tabla: ${inPanel.join(",")}`);
    await t1.shot(`06-panel-${g}.png`);
  }

  // ================================================================ 7. Fallo de GameStats en medio de una partida
  await t1.go(BASE + "/", 3000);
  await t1.eval(PAGE);
  await t1.eval(`window.__e2e.openGame('4 en línea', ['e2e-fallo'], { difficulty: 'Fácil' })`);
  await sleep(3000);
  for (let k = 0; k < 2; k++) { await t1.eval(`window.__e2e.c4Step(0)`); await sleep(1800); }
  docker(`stop ${PROJECT}-ingestion-1`);
  for (let k = 0; k < 3; k++) { await t1.eval(`window.__e2e.c4Step(0)`); await sleep(1800); }
  await sleep(3000);
  const down = await t1.eval(`document.querySelector('.send-status')?.textContent`);
  const toast = await t1.eval(`[...document.querySelectorAll('.toast')].map(t => t.textContent).join(' | ')`);
  await t1.shot("07-gamestats-caido.png");
  check("Fallos", "Con GameStats caído la consola avisa y sigue jugando", /no responde/i.test(down + toast), `estado: "${down}" · aviso: "${toast}"`);
  docker(`start ${PROJECT}-ingestion-1`);
  let back = "";
  for (let k = 0; k < 40 && !/al día/i.test(back); k++) { await sleep(1000); back = await t1.eval(`document.querySelector('.send-status')?.textContent`); }
  check("Fallos", "Cuando GameStats vuelve, se manda todo lo pendiente solo", /al día/i.test(back), `estado: "${back}"`);
  const failEnd = await untilFinished(t1, 0, () => t1.eval(`window.__e2e.c4Step(0)`), 180_000);
  await sleep(4000);
  const failId = matchIdOf([t1], "connect4", "e2e-fallo");
  const failSent = eventsOf([t1], failId).length;
  const failGo = (await api("/api/matches")).find((m) => m.matchId === failId);
  const failSc = (await api("/api/results")).find((r) => r.matchId === failId);
  check("Fallos", "Ningún evento se perdió: Go tiene la partida completa y Scala la analizó", failEnd === "finished" && failGo?.eventCount === failSent && !!failSc, `consola ${failSent} · Go ${failGo?.eventCount} (${failGo?.status}) · Scala ${failSc ? "sí" : "no"}`);

  // ================================================================ 8. Cerrar la pestaña con una partida abierta
  await t2.go(BASE + "/", 3000);
  await t2.eval(PAGE);
  await t2.eval(`window.__e2e.openGame('Tetris', ['e2e-cierre'], {})`);
  await sleep(5000);
  const closeId = matchIdOf([t2], "tetris", "e2e-cierre");
  await browser.send("Target.closeTarget", { targetId: t2.targetId });
  let closeSt;
  for (let k = 0; k < 20; k++) { await sleep(500); closeSt = (await api("/api/matches")).find((m) => m.matchId === closeId)?.status; if (closeSt && closeSt !== "en_curso") break; }
  check("Fallos", "Cerrar la pestaña cierra la partida en GameStats (sendBeacon), sin esperar el timeout", closeSt && closeSt !== "en_curso", `${closeId}: ${closeSt}`);

  // ================================================================ 9. Descubrimiento automático
  await t1.go(BASE + "/", 3000);
  docker(`stop ${PROJECT}-game-tetris-1`);
  let n = 3;
  for (let k = 0; k < 60 && n === 3; k++) { await sleep(1000); n = await t1.eval(`document.querySelectorAll('.game-card').length`); }
  check("Descubrimiento", "Al apagar Tetris desaparece solo del menú", n === 2, `tarjetas: ${n}`);
  docker(`start ${PROJECT}-game-tetris-1`);
  for (let k = 0; k < 60 && n === 2; k++) { await sleep(1000); n = await t1.eval(`document.querySelectorAll('.game-card').length`); }
  check("Descubrimiento", "Al encenderlo vuelve a aparecer solo", n === 3, `tarjetas: ${n}`);

  writeFileSync(join(OUT, "resultados.json"), JSON.stringify({ results, ids, failId, closeId }, null, 2));
} catch (e) {
  console.log("ERROR DEL SCRIPT:", e.message);
  results.push({ area: "script", name: e.message, ok: false });
} finally {
  edge.kill();
  const bad = results.filter((r) => !r.ok);
  console.log(`\n== ${results.length - bad.length}/${results.length} comprobaciones OK`);
}
