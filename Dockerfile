# Etsy Otomasyon — üretim imajı (native binary garantisi: sharp + ffmpeg-static + archiver).
# Standalone çıktı KULLANILMAZ (file-tracing ffmpeg-static binary'sini kaçırabilir) — tam node_modules kopyalanır.

# ---- Builder ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Bağımlılıklar (lock ile deterministik; sharp/ffmpeg-static postinstall linux binary'lerini indirir).
COPY package.json package-lock.json ./
RUN npm ci

# Kaynak + build.
COPY . .
RUN npm run build

# ---- Runtime ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# KRİTİK — libuv thread pool boyutu (varsayılan 4).
# sharp işleri bu havuzu tutar; `dns.lookup` de aynı havuzdadır. Havuz dolduğunda yeni her
# Postgres/Spaces/fal/Etsy bağlantısı kuyruğa girer (ölçüm: 4 ms yerine 28.6 s) ve
# /api/pipeline/status gateway timeout'una (504/524) düşer. Havuzu büyütmek görsel işini
# ağ/dosya I/O'sundan ayırır. sharp eşzamanlılığı ayrıca lib/image/sharp.ts'te sınırlanır.
ENV UV_THREADPOOL_SIZE=8

# Tam node_modules + build çıktısı + asset'ler (sharp/ffmpeg-static runtime'da garanti mevcut).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

# Migration çalıştırıcı (pre-deploy job: `npm run db:migrate`) — src + config + migration dosyaları gerekir.
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json

EXPOSE 3000
CMD ["npm", "run", "start"]
