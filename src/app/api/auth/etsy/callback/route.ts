/**
 * Etsy OAuth callback: state doğrula, code'u token'a çevir, şifreli sakla, dashboard'a dön.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { exchangeCode } from '@/lib/etsy/oauth';
import { upsertOAuthToken } from '@/lib/db/queries';
import { env } from '@/lib/env';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const base = env.PUBLIC_BASE_URL.replace(/\/+$/, '');

  if (error) {
    return NextResponse.redirect(`${base}/?etsy=error&reason=${encodeURIComponent(error)}`);
  }

  const verifier = req.cookies.get('etsy_pkce_verifier')?.value;
  const savedState = req.cookies.get('etsy_oauth_state')?.value;

  if (!code || !state || !verifier || !savedState || state !== savedState) {
    return NextResponse.redirect(`${base}/?etsy=error&reason=state_mismatch`);
  }

  try {
    const tokens = await exchangeCode(code, verifier);
    await upsertOAuthToken('etsy', tokens.accessToken, tokens.refreshToken, tokens.expiresAt);
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'token_exchange_failed';
    return NextResponse.redirect(`${base}/?etsy=error&reason=${encodeURIComponent(reason)}`);
  }

  const res = NextResponse.redirect(`${base}/?etsy=connected`);
  res.cookies.delete('etsy_pkce_verifier');
  res.cookies.delete('etsy_oauth_state');
  return res;
}
