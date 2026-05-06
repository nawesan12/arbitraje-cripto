# Multi-stage build para imagen final pequeña.
# Compatible con linux/amd64 (Windows Docker Desktop) y linux/arm64 (Mac M1+).

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache tini
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=builder /app/dist ./dist
RUN mkdir -p logs

# Tini como init para forwardear señales correctamente
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
