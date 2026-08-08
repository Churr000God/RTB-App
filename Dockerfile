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
# Chromium del sistema para la generación de PDF de cotizaciones
# (app/lib/ventas/generar-pdf.ts, vía puppeteer-core). puppeteer-core NUNCA
# descarga su propio binario — apunta aquí por PUPPETEER_EXECUTABLE_PATH.
# ttf-freefont/font-noto no son opcionales: sin fuentes del sistema Chromium
# dibuja cuadritos en vez de texto (aunque la plantilla también embebe sus
# propias fuentes vía @font-face en base64, un fallback sin fuentes del
# sistema deja sin glifos cualquier carácter fuera de esa fuente embebida).
RUN apk add --no-cache \
      chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
COPY --from=deps /app/node_modules ./node_modules
COPY app/ .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
# builder — compila el standalone build de producción
#
# NEXT_PUBLIC_* se inlinan en el bundle de cliente en BUILD TIME, no en
# runtime (Next.js) — sin estos dos ARG/ENV, cualquier process.env.NEXT_PUBLIC_*
# leído desde código 'use client' queda `undefined` en el bundle final, y
# lib/supabase/client.ts lo enmascara con `?? ''` (login roto en silencio,
# gotcha ya documentado en CLAUDE.md). .dockerignore excluye los .env del
# contexto a propósito — estos valores llegan como --build-arg, nunca
# copiando el archivo.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_OUTPUT_MODE=standalone
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
COPY --from=deps /app/node_modules ./node_modules
COPY app/ .
RUN npm run build

# ---------------------------------------------------------------------------
# runner — imagen final de producción, usuario no-root
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# server.js (standalone) escucha en HOSTNAME:PORT — sin HOSTNAME=0.0.0.0
# puede quedarse en localhost y no responder al puerto publicado por Docker.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Chromium del sistema, igual que en el stage `dev` (ver comentario ahí) —
# va ANTES de crear el usuario no-root: apk necesita privilegios de root,
# que `USER nextjs` retira más abajo para el resto del stage.
RUN apk add --no-cache \
      chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
