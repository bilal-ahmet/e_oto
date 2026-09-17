import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Giriş — Velora Panel',
  // Panel arama sonuçlarında görünmesin (ikinci kanal: src/app/robots.ts).
  robots: { index: false, follow: false },
};

/**
 * Giriş sayfasının kabuğu — kasıtlı olarak BOŞ bir çerçeve.
 *
 * NEDEN AYRI ROUTE GROUP: `admin/layout.tsx` <Nav /> render eder; oturumu olmayan birine
 * korumalı sayfaların linklerini göstermenin anlamı yok (tıklayınca yine buraya döner).
 * Marketing layout'u da uymaz: giriş ekranı vitrin değil. Fontlar ve `bg-paper` zemini
 * kök layout'tan (src/app/layout.tsx) zaten geliyor.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-12">{children}</main>
  );
}
