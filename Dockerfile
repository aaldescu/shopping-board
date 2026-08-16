# ---------- 1. Build the React frontend ----------
FROM node:22-alpine AS webbuild
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---------- 2. Fetch PocketBase ----------
FROM alpine:3.20 AS pbfetch
ARG PB_VERSION=0.28.4
ARG TARGETARCH=amd64
RUN apk add --no-cache unzip ca-certificates \
    && wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" -O /tmp/pb.zip \
    && unzip /tmp/pb.zip -d /tmp/pb

# ---------- 3. Runtime: PocketBase serves API + static frontend ----------
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata

COPY --from=pbfetch /tmp/pb/pocketbase /usr/local/bin/pocketbase
COPY pb/pb_migrations /pb/pb_migrations
COPY pb/pb_hooks /pb/pb_hooks
COPY --from=webbuild /app/web/dist /pb/pb_public

# /pb/pb_data must be mounted as a persistent volume in production.
VOLUME /pb/pb_data

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q --spider http://127.0.0.1:8080/api/health || exit 1

CMD ["pocketbase", "serve", \
     "--http=0.0.0.0:8080", \
     "--dir=/pb/pb_data", \
     "--migrationsDir=/pb/pb_migrations", \
     "--hooksDir=/pb/pb_hooks", \
     "--publicDir=/pb/pb_public"]
