FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY vendor/boxcars-wasm ./vendor/boxcars-wasm
RUN npm ci --omit=dev

COPY src ./src

USER node
EXPOSE 8080
CMD ["node", "src/server.mjs"]
