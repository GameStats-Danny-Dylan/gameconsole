# 4 en línea: plantilla de sdk/README.md. Se construye desde la RAÍZ del repo
# (para que Docker vea sdk/):
#
#   docker build -f games/connect4/Dockerfile -t gameconsole-game-connect4 .
#
# Corre con sdk/server: sirve el juego bajo /games/connect4/, publica game.json
# y se registra solo en el registry (REGISTRY_URL) con su latido.

# 1) El SDK: pruebas y compilación del servidor (sdk/dist-server).
FROM node:22-alpine AS sdk
WORKDIR /repo/sdk
COPY sdk/package.json sdk/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY sdk/tsconfig.json sdk/tsconfig.server.json sdk/vitest.config.ts ./
COPY sdk/src ./src
COPY sdk/server ./server
COPY sdk/test ./test
RUN npm test && npm run build

# 2) El juego, con el SDK en ../../sdk (file:../../sdk).
FROM node:22-alpine AS build
COPY --from=sdk /repo/sdk /repo/sdk
WORKDIR /repo/games/connect4
COPY games/connect4/package.json games/connect4/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY games/connect4/ ./
RUN npm test && npm run build

# 3) Lo que corre: Node, el servidor del SDK y el build del juego.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 GAME_DIR=/app/dist
COPY --from=sdk /repo/sdk/dist-server ./server
COPY --from=build /repo/games/connect4/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server/main.js"]
