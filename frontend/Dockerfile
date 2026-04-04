# ──────────────────────────────────────────────
# Stage 1: Dependencies
# ──────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ──────────────────────────────────────────────
# Stage 2: Builder
# ──────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env: API URL will be proxied through Nginx on same origin
ENV NEXT_PUBLIC_API_URL=/api/v1
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ──────────────────────────────────────────────
# Stage 3: Runner (minimal production image)
# ──────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user for security
RUN addgroup --system --gid 1001 nextjs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output (includes server.js + minimal node_modules)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
