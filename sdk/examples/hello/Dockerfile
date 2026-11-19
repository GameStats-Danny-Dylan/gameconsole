# Juego de ejemplo sobre el SDK. Es la misma plantilla de sdk/README.md.
# Se construye desde la RAÍZ del repo (para que Docker vea sdk/):
#
#   docker build -f sdk/examples/hello/Dockerfile -t gameconsole-game-hello .

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

# 2) El juego, con el SDK ya listo en ../.. (file:../..).
FROM node:22-alpine AS build
COPY --from=sdk /repo/sdk /repo/sdk
WORKDIR /repo/sdk/examples/hello
COPY sdk/examples/hello/package.json sdk/examples/hello/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY sdk/examples/hello/ ./
RUN npm run build

# 3) Lo que corre: solo Node, el servidor del SDK y los archivos del juego.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 GAME_DIR=/app/dist
COPY --from=sdk /repo/sdk/dist-server ./server
COPY --from=build /repo/sdk/examples/hello/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server/main.js"]
