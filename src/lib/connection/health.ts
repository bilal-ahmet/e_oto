/**
 * Etsy / Pinterest bağlantı sağlığı — SALT OKUNUR kontrol + son sonucun kalıcı kaydı.
 *
 * NEDEN: Panel yalnız "token kaydı var" bilgisine bakıp `bağlı` diyordu; gösterilen "geçerlilik"
 * de Etsy'nin 1 saatlik ERİŞİM anahtarının süresiydi (otomatik yenilenir, geçmiş görünmesi
 * arıza değildir). Bağlantının gerçekten çalıştığını yalnızca başarılı bir API çağrısı kanıtlar.
 * Kontrol yalnız okuma yapar: Etsy `GET /users/me`, Pinterest `GET /user_account`.
 *
 * Sonuç `app_settings.<provider>_last_check`'e JSON yazılır (token/anahtar İÇERMEZ).
 */

import { getOAuthTokenMeta, getSetting, setSetting, type AppSettingKey } from '@/lib/db/queries';
import { classifyError } from '@/lib/errors';
import { getMe } from '@/lib/etsy/listings';
import { pinterestFetch } from '@/lib/pinterest/client';
import type { ErrorKind } from '@/types';

export type Provider = 'etsy' | 'pinterest';

export interface ConnectionCheck {
  at: string; // ISO 8601 (UTC) — gösterimde Europe/Istanbul'a çevrilir
  ok: boolean;
  kind?: ErrorKind; // ok=false ise
  message?: string; // ok=false ise kısa sebep (sağlayıcı gövdesi kırpılmış)
  source: 'panel' | 'cron';
}

/**
 * Kullanıcıya gösterilen bağlantı durumu — "bağlı" tek başına bir şey kanıtlamaz.
 *  - not_connected   : token kaydı yok
 *  - reauth_required : refresh token sağlayıcıca reddedildi / refresh token yok
 *  - auth_error      : son kontrol 401/403 döndü
 *  - transient       : son kontrol geçici servis/ağ hatasıyla düştü
 *  - verified        : son salt okunur kontrol başarılı
 *  - unchecked       : hiç kontrol edilmedi
 */
export type ConnectionState = 'not_connected' | 'reauth_required' | 'auth_error' | 'transient' | 'verified' | 'unchecked';

const settingKey = (p: Provider): AppSettingKey => (p === 'etsy' ? 'etsy_last_check' : 'pinterest_last_check');
const reauthKey = (p: Provider): AppSettingKey => (p === 'etsy' ? 'etsy_reauth_required' : 'pinterest_reauth_required');

export async function readConnectionCheck(p: Provider): Promise<ConnectionCheck | null> {
  const raw = await getSetting(settingKey(p));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ConnectionCheck;
  } catch {
    return null;
  }
}

/** Salt okunur kontrolü ÇALIŞTIRIR ve sonucu kaydeder. Asla fırlatmaz. */
export async function runConnectionCheck(p: Provider, source: ConnectionCheck['source']): Promise<ConnectionCheck> {
  const at = new Date().toISOString();
  let result: ConnectionCheck;
  try {
    if (p === 'etsy') {
      const me = await getMe();
      if (me.shop_id == null) throw new Error('Etsy hesabına bağlı bir mağaza bulunamadı.');
    } else {
      await pinterestFetch('/user_account');
    }
    result = { at, ok: true, source };
  } catch (e) {
    const message = (e instanceof Error ? e.message : String(e)).slice(0, 300);
    result = { at, ok: false, kind: classifyError(e), message, source };
  }
  try {
    await setSetting(settingKey(p), JSON.stringify(result));
  } catch {
    /* kayıt başarısızlığı sonucu gizlememeli */
  }
  return result;
}

export interface ConnectionHealth {
  state: ConnectionState;
  lastCheck: ConnectionCheck | null;
  reauthRequiredSince: string | null;
}

export async function connectionHealth(p: Provider): Promise<ConnectionHealth> {
  const [meta, lastCheck, reauth] = await Promise.all([
    getOAuthTokenMeta(p),
    readConnectionCheck(p),
    getSetting(reauthKey(p)),
  ]);
  let state: ConnectionState;
  if (!meta.connected) state = 'not_connected';
  else if (reauth || !meta.hasRefreshToken) state = 'reauth_required';
  else if (!lastCheck) state = 'unchecked';
  else if (lastCheck.ok) state = 'verified';
  else if (lastCheck.kind === 'auth') state = 'auth_error';
  else state = 'transient';
  return { state, lastCheck, reauthRequiredSince: reauth };
}

export const CONNECTION_STATE_LABEL: Record<ConnectionState, string> = {
  not_connected: 'Bağlı değil',
  reauth_required: 'Yeniden yetkilendirme gerekiyor',
  auth_error: 'Yetki hatası',
  transient: 'Geçici servis hatası',
  verified: 'Bağlı (doğrulandı)',
  unchecked: 'Kontrol edilmedi',
};
