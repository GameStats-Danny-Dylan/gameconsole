# 4 en línea: se construye con Vite y se sirve bajo /games/connect4/.
# PROVISIONAL: sirve los archivos con nginx. Cuando esté sdk/server (SDK de la
# consola), la segunda etapa pasa a usarlo: sirve lo mismo y además registra el
# juego en el registry con su latido.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src
COPY test ./test
RUN npx vitest run && npm run build

FROM nginx:1.28-alpine
RUN apk add --no-cache curl
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 register.sh /docker-entrypoint.d/90-register.sh
COPY --from=build /app/dist /usr/share/nginx/html/games/connect4
RUN nginx -t
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
