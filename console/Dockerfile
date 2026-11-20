# Consola de GameConsole: se construye con Vite y la sirve nginx en el puerto 8080.
# Se construye desde la RAÍZ del repo (para que Docker vea sdk/):
#
#   docker build -f console/Dockerfile -t gameconsole-console .

# 1) El SDK: sus pruebas (la consola usa sus tipos y su tema desde ../sdk).
# Las etapas de pruebas y compilación corren en la plataforma del que construye
# ($BUILDPLATFORM): el resultado es JS y archivos estáticos, igual para amd64 y arm64.
# Así las pruebas no corren emuladas con QEMU (muy lentas) al publicar para arm64.
FROM --platform=$BUILDPLATFORM node:22-alpine AS sdk
WORKDIR /repo/sdk
COPY sdk/package.json sdk/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY sdk/tsconfig.json sdk/tsconfig.server.json sdk/vitest.config.ts ./
COPY sdk/src ./src
COPY sdk/server ./server
COPY sdk/test ./test
RUN npm test

# 2) La consola, con el SDK en ../sdk (file:../sdk).
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
COPY --from=sdk /repo/sdk /repo/sdk
WORKDIR /repo/console
COPY console/package.json console/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY console/ ./
RUN npm test && npm run build

# 3) Lo que corre: solo nginx con los archivos estáticos.
FROM nginx:1.28-alpine
COPY console/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/console/dist /usr/share/nginx/html
RUN nginx -t
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
