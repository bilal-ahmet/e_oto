/**
 * Pinterest OAuth callback: state doğrula, code'u token'a çevir, şifreli sakla, admin panele dön.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { exchangeCode } from '@/lib/pinterest/oauth';
import { upsertOAuthToken } from '@/lib/db/queries';
import { env } from '@/lib/env';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const base = env.PUBLIC_BASE_URL.replace(/\/+$/, '');

  if (error) {
    return NextResponse.redirect(`${base}/admin?pinterest=error&reason=${encodeURIComponent(error)}`);
  }

  const savedState = req.cookies.get('pinterest_oauth_state')?.value;

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${base}/admin?pinterest=error&reason=state_mismatch`);
  }

  try {
    const tokens = await exchangeCode(code);
    await upsertOAuthToken('pinterest', tokens.accessToken, tokens.refreshToken, tokens.expiresAt);
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'token_exchange_failed';
    return NextResponse.redirect(`${base}/admin?pinterest=error&reason=${encodeURIComponent(reason)}`);
  }

  const res = NextResponse.redirect(`${base}/admin?pinterest=connected`);
  res.cookies.delete('pinterest_oauth_state');
  return res;
}
