#!/usr/bin/env bash
# Prueba de humo de GameConsole: recorre el gateway como lo haría el navegador.
# La usan el CI/CD (integración y deploy) y sirve para probar a mano:
#
#   docker compose up -d --build --wait
#   bash scripts/smoke.sh                 # o BASE=https://xxx.trycloudflare.com bash scripts/smoke.sh
#
# Requiere curl y jq. Termina con error en el primer paso que falle.
set -euo pipefail

BASE="${BASE:-http://localhost:8000}"
HERE="$(cd "$(dirname "$0")" && pwd)"
MATCH="smoke-$(date +%s)-$RANDOM"   # matchId único: no choca con corridas anteriores

ok()   { echo "  ok  $*"; }
fail() { echo "FALLO $*" >&2; exit 1; }
get()  { curl -fsS --max-time 10 "$BASE$1"; }
post() { curl -fsS --max-time 15 -H 'content-type: application/json' -X "${3:-POST}" -d "$2" "$BASE$1"; }

echo "== GameConsole en $BASE"

echo "-- servicios"
[ "$(get /health | jq -r .status)" = ok ]              || fail "gateway /health"; ok "gateway"
[ "$(get /api/registry/health | jq -r .status)" = ok ] || fail "registry";        ok "registry"
[ "$(get /api/ai/health | jq -r .status)" = ok ]       || fail "prolog";          ok "prolog"

echo "-- apps servidas por el gateway"
curl -fsS --max-time 10 "$BASE/" | grep -q "<title>GameConsole</title>" || fail "consola /"; ok "consola"
curl -fsS --max-time 10 "$BASE/panel/" | grep -q "Panel de GameConsole" || fail "panel /panel/"; ok "panel"
curl -fsS --max-time 10 "$BASE/games/connect4/" | grep -q "4 en línea" || fail "/games/connect4/"; ok "4 en línea"
[ "$(get /games/connect4/game.json | jq -r .id)" = connect4 ] || fail "game.json del 4 en línea"; ok "game.json"

echo "-- IA (Prolog): rojo tiene 3 abajo, amarillo debe tapar en la 4"
board='{"board":[["red"],["red"],["red"],[],["yellow"],["yellow"],[]],"player":"yellow","difficulty":"hard"}'
col=$(post /api/ai/connect4/move "$board" | jq -r .column)
[ "$col" = 4 ] || fail "la IA eligió la columna $col"; ok "columna 4"

echo "-- registry: registrar, listar, latir y borrar un juego de prueba"
manifest='{"id":"smoke-game","name":"Smoke","version":"0.0.1","gameStatsId":"smoke","gameVersion":"1.0","entry":"/games/smoke-game/","players":{"min":1,"max":1},"modes":["solo"],"protocol":"gameconsole/1"}'
post /api/registry/games "$manifest" > /dev/null
get /api/registry/games | jq -e 'any(.[]; .id == "smoke-game")' > /dev/null || fail "no aparece en la lista"; ok "aparece en la lista"
post /api/registry/games/smoke-game/heartbeat '' PUT > /dev/null; ok "latido"
post /api/registry/games/smoke-game '' DELETE > /dev/null
get /api/registry/games | jq -e 'all(.[]; .id != "smoke-game")' > /dev/null || fail "sigue en la lista"; ok "se fue"

echo "-- GameStats: una partida de 4 en línea por /api/events ($MATCH)"
events=$(jq -c --arg m "$MATCH" 'map(.matchId = $m | .eventId = ($m + "-" + .eventId))' "$HERE/smoke-match.json")
expected=$(jq length <<< "$events")
accepted=$(post /api/events "$events" | jq .accepted)
[ "$accepted" = "$expected" ] || fail "Go aceptó $accepted de $expected"; ok "Go aceptó $accepted/$expected"

# Go manda la partida a Scala en segundo plano al llegar MATCH_FINISHED.
for _ in $(seq 1 30); do
  result=$(get "/api/results/$MATCH" 2>/dev/null) && break
  sleep 1
done
[ -n "${result:-}" ] || fail "Scala no guardó $MATCH"
total=$(jq .matchStats.totalEvents <<< "$result")
[ "$total" = "$expected" ] || fail "Scala analizó $total de $expected eventos (descartó alguno)"
ok "Scala analizó $total/$expected (ganador: $(jq -r .matchStats.winner <<< "$result"))"

echo "-- estadísticas (GameStats v1.1)"
if stats=$(get /api/stats/games/connect4 2>/dev/null); then
  ok "/api/stats/games/connect4: $(jq .matches <<< "$stats") partidas"
else
  echo "  --  /api/stats todavía no existe (GameStats < v1.1)"
fi

echo "== todo bien"
