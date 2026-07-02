/**
 * Etsy OAuth başlatma: PKCE verifier + state üret, cookie'ye sakla, authorize URL'ine yönlendir.
 */

import { NextResponse } from 'next/server';
import { buildAuthUrl, generateState, generateVerifier } from '@/lib/etsy/oauth';

export async function GET() {
  const verifier = generateVerifier();
  const state = generateState();
  const url = buildAuthUrl(verifier, state);

  const res = NextResponse.redirect(url);
  const cookieOpts = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600, // 10 dk
  };
  res.cookies.set('etsy_pkce_verifier', verifier, cookieOpts);
  res.cookies.set('etsy_oauth_state', state, cookieOpts);
  return res;
}
