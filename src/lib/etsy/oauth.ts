/**
 * Etsy OAuth2 + PKCE yardımcıları (CLAUDE.md §8).
 * - buildAuthUrl: code_verifier + state üretir, authorize URL döner.
 * - exchangeCode: authorization code → token.
 * - refreshAccessToken: refresh_token → yeni token.
 * Token saklama queries.upsertOAuthToken ile yapılır (şifreli).
 */

import { createHash, randomBytes } from 'crypto';
import { getEnv } from '@/lib/env';

const CONNECT_URL = 'https://www.etsy.com/oauth/connect';
const TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';

// CLAUDE.md §8: listing okuma/yazma/silme + shop okuma.
export const ETSY_SCOPES = ['listings_r', 'listings_w', 'listings_d', 'shops_r'];

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function generateVerifier(): string {
  return base64url(randomBytes(32));
}

export function generateState(): string {
  return base64url(randomBytes(16));
}

function challengeFor(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest());
}

export interface EtsyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

function requireEtsyConfig() {
  const env = getEnv();
  if (!env.ETSY_CLIENT_ID || !env.ETSY_REDIRECT_URI) {
    throw new Error('ETSY_CLIENT_ID / ETSY_REDIRECT_URI tanımlı değil — Etsy OAuth yapılamaz.');
  }
  return { clientId: env.ETSY_CLIENT_ID, redirectUri: env.ETSY_REDIRECT_URI };
}

/** Authorize URL'i ve PKCE doğrulayıcısını üretir (verifier+state cookie'ye saklanmalı). */
export function buildAuthUrl(verifier: string, state: string): string {
  const { clientId, redirectUri } = requireEtsyConfig();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: ETSY_SCOPES.join(' '),
    state,
    code_challenge: challengeFor(verifier),
    code_challenge_method: 'S256',
  });
  return `${CONNECT_URL}?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

async function postToken(body: Record<string, string>): Promise<EtsyTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Etsy token isteği başarısız (${res.status}): ${text}`);
  }
  const data = (await res.json()) as TokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

/** Callback'te gelen code'u token'a çevirir. */
export function exchangeCode(code: string, verifier: string): Promise<EtsyTokens> {
  const { clientId, redirectUri } = requireEtsyConfig();
  return postToken({
    grant_type: 'authorization_code',
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: verifier,
  });
}

/** Süresi dolan access token'ı refresh_token ile yeniler. */
export function refreshAccessToken(refreshToken: string): Promise<EtsyTokens> {
  const { clientId } = requireEtsyConfig();
  return postToken({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  });
}
