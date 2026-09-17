import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Etsy AI Otomasyon — Panel',
  description: 'Etsy dijital görsel satışı için uçtan uca AI otomasyon paneli',
  // Panel arama sonuçlarında görünmesin (ikinci kanal: src/app/robots.ts).
  robots: { index: false, follow: false },
};

/**
 * İKİNCİ KAPI — `src/proxy.ts` ilk kapı.
 *
 * NEDEN İKİSİ BİRDEN: Next.js dokümanı proxy'nin tek başına bir yetkilendirme çözümü
 * OLMADIĞINI açıkça söyler; matcher'da yapılacak bir düzenleme korumayı sessizce kaldırabilir
 * (proxy.md → "Execution order" notu). Bu kontrol çerez okumaktan ibaret, maliyeti yok, ama
 * matcher bozulsa bile panel sayfaları açılmaz.
 *
 * `cookies()` Next 16'da ASENKRONDUR — await'siz kullanım derlenmez.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  if (!verifySession(store.get(SESSION_COOKIE)?.value).valid) redirect('/login?next=%2Fadmin');

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">{children}</main>
    </>
  );
}
