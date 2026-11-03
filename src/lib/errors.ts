/**
 * Hata sınıfları + sınıflandırma — "ne oldu" kadar "kullanıcı ne yapmalı" sorusuna cevap verir.
 *
 * NEDEN: Eskiden her dış hata düz `Error` idi; `fail()` yalnız mesajı yazıyordu. Panel bir Etsy
 * 400'ünü (içerik düzeltilmeli), 401'i (yeniden yetkilendir) ve zaman aşımını (tekrar dene)
 * ayırt edemiyordu. Sınıf `pipeline_runs.error_kind`'e yazılır; etiket/ipucu `lib/status.ts`.
 *
 * Saf modül (sunucu-only import yok) — panel de `ErrorKind` için kullanabilir.
 */

import type { ErrorKind } from '@/types';

/** Sınıfı önceden bilinen uygulama hatası (ör. ön-doğrulama ihlali, yetki eksik). */
export class AppError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Dış API'nin 2xx olmayan yanıtı. Mesaj formatı eskisiyle aynıdır (panelde görülen metin
 * değişmesin); ek olarak durum kodu yapısal taşınır. `body` sağlayıcının hata gövdesidir —
 * token İÇERMEZ (istek başlığı/gövdesi buraya konmaz).
 */
export class ApiError extends Error {
  constructor(
    readonly provider: 'etsy' | 'pinterest',
    readonly status: number,
    readonly path: string,
    readonly body: string,
    message: string,
    /** `Retry-After` başlığı (sn) — 429'da sağlayıcı verdiyse. */
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** OAuth refresh token'ın sağlayıcı tarafından kalıcı reddi (yeniden yetkilendirme şart). */
export function isInvalidGrant(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 400 || err.status === 401) && /invalid_grant/i.test(err.body);
}

export function classifyError(err: unknown): ErrorKind {
  if (err instanceof AppError) return err.kind;
  if (err instanceof ApiError) {
    if (isInvalidGrant(err)) return 'auth';
    if (err.status === 401 || err.status === 403) return 'auth';
    if (err.status === 429) return 'rate_limit';
    if (err.status >= 500 || err.status === 408) return 'transient';
    if (err.status >= 400) return 'validation';
  }
  if (err instanceof Error) {
    // TimeoutError (lib/async/timeout) ve undici ağ hataları ("fetch failed", ECONNRESET…).
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return 'transient';
    if (err.name === 'TypeError' && /fetch failed/i.test(err.message)) return 'transient';
    if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(err.message)) return 'transient';
  }
  return 'internal';
}
