# O Assassinato do Gabriel — imagem Docker (site + servidor, sem dependências em runtime)

# 1) Build do site
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json .npmrc ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm test && npm run build

# 2) Imagem final: só Node + o site compilado + o servidor
FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data DIST_DIR=/app/dist
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY server/server.mjs ./server/server.mjs
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server/server.mjs"]
