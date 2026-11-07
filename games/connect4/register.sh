#!/bin/sh
# PROVISIONAL (hasta sdk/server): anota el juego en el registry y manda el
# latido cada 5 s (protocolo, sección 3). Si el registry responde 404 (se
# reinició o el juego venció), vuelve a mandar el manifiesto.
# La imagen de nginx corre los scripts de /docker-entrypoint.d/ antes de
# arrancar; este deja el ciclo en segundo plano y termina enseguida.

MANIFEST=/usr/share/nginx/html/games/connect4/game.json
REGISTRY="${REGISTRY_URL:-http://registry:8080}"
ID=connect4

register() {
  curl -fsS -o /dev/null -X POST -H 'content-type: application/json' --data-binary "@$MANIFEST" "$REGISTRY/games" \
    && echo "[registry] $ID registrado en $REGISTRY"
}

(
  until register; do sleep 2; done
  while sleep 5; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$REGISTRY/games/$ID/heartbeat")
    [ "$code" = 204 ] || register
  done
) &
