# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# deps — instala dependencias una sola vez, capa cacheable por package*.json
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY app/package.json app/package-lock.json* ./
RUN npm ci --legacy-peer-deps

# ---------------------------------------------------------------------------
# dev — target de desarrollo: hot-reload sobre el código montado por compose
# ---------------------------------------------------------------------------
FROM node:20-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY app/ .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
# builder — compila el standalone build de producción
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_OUTPUT_MODE=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY app/ .
RUN npm run build

# ---------------------------------------------------------------------------
# runner — imagen final de producción, usuario no-root
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
