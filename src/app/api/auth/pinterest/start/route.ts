/**
 * Pinterest OAuth başlatma: state üret, cookie'ye sakla, authorize URL'ine yönlendir.
 */

import { NextResponse } from 'next/server';
import { buildAuthUrl, generateState } from '@/lib/pinterest/oauth';

export async function GET() {
  const state = generateState();
  const url = buildAuthUrl(state);

  const res = NextResponse.redirect(url);
  res.cookies.set('pinterest_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600, // 10 dk
  });
  return res;
}
