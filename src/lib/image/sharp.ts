/**
 * Paylaşılan, YAPILANDIRILMIŞ sharp örneği. Görsel işleyen HER modül sharp'ı buradan almalı
 * (`import sharp from 'sharp'` DEĞİL) — aksi halde aşağıdaki sınırlar uygulanmadan çalışır.
 *
 * NEDEN (canlıda ölçüldü):
 *  1) libvips varsayılan eşzamanlılığı `os.cpus().length`'tir; konteynerde bu HOST'un çekirdek
 *     sayısını döndürür (cgroup kotasını değil). 1 vCPU'luk App Platform instance'ında libvips
 *     8-32 thread açıp tek çekirdeği thrash'e sokar.
 *  2) sharp işleri libuv thread pool'unu (varsayılan 4 slot) tutar. Havuz dolduğunda `dns.lookup`
 *     kuyruğa girer — ölçümde 4 ms yerine 28.6 s. Bu, işlem sürerken açılan HER yeni Postgres/
 *     Spaces/fal/Etsy bağlantısını kilitler ve /api/pipeline/status'ün 504 vermesine yol açar.
 *     UV_THREADPOOL_SIZE (bkz. Dockerfile) + düşük eşzamanlılık birlikte bu riski kaldırır.
 *  3) libvips operasyon cache'i burada faydasız: her görsel bir kez işlenir, cache yalnızca
 *     RSS'i şişirir.
 *
 * SHARP_CONCURRENCY ile ayarlanabilir (varsayılan 1 — 1 vCPU instance için doğru değer).
 */

import sharp from 'sharp';

const parsed = Number(process.env.SHARP_CONCURRENCY);
const CONCURRENCY = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;

sharp.concurrency(CONCURRENCY);
sharp.cache(false);

export { sharp };
export default sharp;
