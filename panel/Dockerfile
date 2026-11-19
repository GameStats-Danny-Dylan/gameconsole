# Panel de control: se construye con Vite y lo sirve nginx bajo /panel/.
# Se construye desde la RAÍZ del repo, porque usa el tema del SDK (sdk/):
#
#   docker build -f panel/Dockerfile -t gameconsole-panel .
FROM node:22-alpine AS build
# Del SDK solo hace falta el código (el panel usa @gameconsole/sdk/theme).
COPY sdk/package.json /repo/sdk/package.json
COPY sdk/src /repo/sdk/src
WORKDIR /repo/panel
COPY panel/package.json panel/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY panel/tsconfig.json panel/vite.config.ts panel/index.html ./
COPY panel/public ./public
COPY panel/src ./src
COPY panel/test ./test
RUN npx vitest run && npm run build

FROM nginx:1.28-alpine
COPY panel/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/panel/dist /usr/share/nginx/html/panel
RUN nginx -t
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
