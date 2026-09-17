/**
 * POST /api/auth/logout → oturum çerezini siler ve /login'e döner.
 *
 * 303 redirect döner, JSON değil: Nav'daki düz `<form method="post">` JS olmadan da
 * çalışsın diye. (303, POST sonrası GET'e geçmenin doğru statüsüdür.)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, cookieOptions } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', req.url), { status: 303 });
  // maxAge 0 + aynı path/secure → tarayıcı çerezi siler. Seçenekler yazarkenkiyle
  // birebir aynı olmalı, yoksa silinmez ve oturum açık kalır.
  res.cookies.set(SESSION_COOKIE, '', cookieOptions(0));
  return res;
}
