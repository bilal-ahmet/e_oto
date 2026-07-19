/**
 * Pinterest OAuth2 yardımcıları (CLAUDE.md §8) — standart OAuth2, PKCE YOK (Etsy'den fark).
 * - buildAuthUrl: state üretir, authorize URL döner.
 * - exchangeCode: authorization code → token.
 * - refreshAccessToken: refresh_token → yeni token.
 * Token saklama queries.upsertOAuthToken('pinterest', ...) ile yapılır (şifreli, provider-agnostic).
 */

import { randomBytes } from 'crypto';
import { getEnv } from '@/lib/env';

const AUTH_URL = 'https://www.pinterest.com/oauth/';
const TOKEN_URL = 'https://api.pinterest.com/v5/oauth/token';

// CLAUDE.md §8: pin okuma/yazma + board okuma (board_id çözümü için).
export const PINTEREST_SCOPES = ['pins:read', 'pins:write', 'boards:read'];

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateState(): string {
  return base64url(randomBytes(16));
}

export interface PinterestTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

function requirePinterestConfig() {
  const env = getEnv();
  if (!env.PINTEREST_CLIENT_ID || !env.PINTEREST_CLIENT_SECRET || !env.PINTEREST_REDIRECT_URI) {
    throw new Error(
      'PINTEREST_CLIENT_ID / PINTEREST_CLIENT_SECRET / PINTEREST_REDIRECT_URI tanımlı değil — Pinterest OAuth yapılamaz.',
    );
  }
  return {
    clientId: env.PINTEREST_CLIENT_ID,
    clientSecret: env.PINTEREST_CLIENT_SECRET,
    redirectUri: env.PINTEREST_REDIRECT_URI,
  };
}

/** Authorize URL'i üretir (state cookie'ye saklanmalı). */
export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = requirePinterestConfig();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: PINTEREST_SCOPES.join(','),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Pinterest token isteği — Etsy'den fark: client kimlik bilgileri body'de değil,
 * HTTP Basic auth header'ında gönderilir (`Authorization: Basic base64(client_id:client_secret)`).
 */
async function postToken(body: Record<string, string>): Promise<PinterestTokens> {
  const { clientId, clientSecret } = requirePinterestConfig();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinterest token isteği başarısız (${res.status}): ${text}`);
  }
  const data = (await res.json()) as TokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

/** Callback'te gelen code'u token'a çevirir. */
export function exchangeCode(code: string): Promise<PinterestTokens> {
  const { redirectUri } = requirePinterestConfig();
  return postToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
}

/** Süresi dolan access token'ı refresh_token ile yeniler. */
export function refreshAccessToken(refreshToken: string): Promise<PinterestTokens> {
  return postToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}
